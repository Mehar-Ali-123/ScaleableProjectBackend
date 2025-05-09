const express = require("express");
const path = require("path");
const { upload } = require("../multer");
const User = require("../model/user.js");
const Message = require("../model/message.js");
const ErrorHandler = require("../utils/ErrorHandler");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const sendMail = require("../utils/sendMail.js");
const router = express.Router();
const crypto = require("crypto");
const catchAsyncError = require("../middleware/catchAsyncError.js");
const sendToken = require("../utils/jwtToken.js");
const bcrypt = require("bcrypt");
const { isAuthenticated } = require("../middleware/auth.js");
const SubscriptionEmail = require("../model/subcriptionEmails.js");
const Media = require("../model/media.js");

router.post("/create-user", upload.single("file"), async (req, res, next) => {
  try {
    const { name, email, password, country, signupDate } = req.body;
    if (!email) {
      return next(new ErrorHandler("Email cannot be null", 400));
    }
    const existingUser = await User.findOne({ email }).maxTimeMS(30000);
    if (existingUser) {
      const filename = req.file.filename;
      const filePath = path.join(__dirname, "..", "uploads", filename);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
        }
      });
      return next(new ErrorHandler("User email already exists", 400));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailToken = crypto.randomBytes(64).toString("hex");

    const newUser = new User({
      name,
      email,
      country,
      password: hashedPassword,
      avatar: req.file.filename,
      signupDate,
      emailToken,
      isVerified: false,
    });

    await newUser.save();
    const activationUrl = `https://carbonshredder.com/activation/${emailToken}`;

    try {
      await sendMail({
        email: newUser.email,
        subject: "Activate your email",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <p>Dear ${newUser.name},</p>
    
            <p>We hope this email finds you well. At Carbon Shredder, we're passionate about sustainability and reducing our carbon footprint, and we invite you to join us on this journey towards a greener future.</p>
    
            <p>With our innovative Carbon Footprint Calculator, you can now easily estimate your carbon emissions and gain valuable insights into your environmental impact. Whether it's tracking your daily activities, optimizing your transportation choices, or making eco-conscious purchasing decisions, our calculator empowers you to make a positive change for the planet.</p>
    
            <p>Here's how you can get started:</p>
            <ul>
              <li>Visit our website and access the Carbon Footprint Calculator.</li>
              <li>Input your information, including age, location, and lifestyle choices.</li>
              <li>Explore your personalized carbon footprint report and discover areas where you can reduce emissions.</li>
              <li>Take actionable steps towards a more sustainable lifestyle and track your progress over time.</li>
            </ul>
    
            <p>Together, we can make a difference. Join us today in taking meaningful steps towards a cleaner, healthier planet.</p>
    
            <p>Best regards,</p>
            <p>Thijn Felix</p>
            <p>Founder</p>
            <p>Carbon Shredder</p>
    
            <p><a href="${activationUrl}" style="display: inline-block; background-color: #77CFB8; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px;">Activate your account</a></p> 
          </div>
        `,
      });

      res.status(201).json({
        success: true,
        message: `Please check your email ${newUser.email} to activate your account`,
      });
    } catch (error) {
      return next(new ErrorHandler("Error sending activation email", 500));
    }

    console.log("User created successfully:", newUser);
  } catch (error) {
    console.error("Error creating user:", error);
    next(error);
  }
});

const createActivationToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
    },
    process.env.ACTIVATION_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES,
    }
  );
};
// activation link
router.post("/activation", async (req, res, next) => {
  try {
    const { activationToken } = req.body;
    console.log("Received activation token:", activationToken);
    if (!activationToken) {
      return next(new ErrorHandler("Activation token is required", 400));
    }
    const user = await User.findOne({ emailToken: activationToken });
    if (user) {
      console.log("Found user:", user);
      user.emailToken = null;
      user.isVerified = true;
      await user.save();
      return res
        .status(200)
        .json({ success: true, message: "Account activated successfully" });
    } else {
      console.log("Invalid activation token");
      return next(new ErrorHandler("Invalid activation token", 400));
    }
  } catch (error) {
    console.error("Error in activation endpoint:", error); // Add this line for debugging
    return next(new ErrorHandler(error.message, 500));
  }
});

// Login User
router.post(
  "/login-user",
  catchAsyncError(async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return next(new ErrorHandler("Please provide email and password", 400));
      }
      const user = await User.findOne({ email }).select("+password");
      console.log("User retrieved from MongoDB:", user);
      if (!user) {
        return next(new ErrorHandler("User does not exist", 400));
      }
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return next(new ErrorHandler("Incorrect password", 400));
      }

      res.cookie("userID", user._id, { maxAge: 900000, httpOnly: true });

      // Send token in response
      sendToken(user, 201, res);
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);
// check auth authenticated or not
router.get("/check-auth", isAuthenticated, (req, res) => {
  res.status(200).json({ isAuthenticated: true });
});

// Forget Pass
const otpMap = new Map();
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    // Fetch user details from the database
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const userName = user.name; // Assuming 'name' is the field in the user model

    const OTP = Math.floor(100000 + Math.random() * 900000);

    otpMap.set(email, OTP);

    try {
      await sendMail({
        email: email,
        subject: "Reset Your Password",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <p>Dear ${userName},</p>
            <p>We hope this email finds you well. At Carbon Shredder, we're dedicated to helping you reduce your carbon footprint and contribute to a more sustainable future.</p>
            <p>We received a request to reset the password for your account. To ensure the security of your account, please use the One-Time Password (OTP) provided below to reset your password.</p>
            <p><strong>Your OTP: ${OTP}</strong></p> 
            <p>Here's how you can reset your password:</p>
            <ul>
              <li>Visit our password reset page on the Carbon Shredder website.</li>
              <li>Enter your email address and the OTP provided above.</li>
              <li>Follow the instructions to create a new password for your account.</li>
            </ul> 
            <p>If you did not request a password reset, please ignore this email. Your account remains secure, and no changes have been made.</p>
            <p>Thank you for being a part of the Carbon Shredder community. Together, we can make a difference by taking meaningful steps towards a cleaner, healthier planet.</p>
            <p>Best regards,</p>
            <p>Thijn Felix<br/>Founder<br/>Carbon Shredder</p>
          </div>
        `,
      });
      res.status(201).json({
        success: true,
        message: `Please check your email ${email} for the OTP to reset your password`,
      });
    } catch (error) {
      return next(new ErrorHandler("Error sending OTP", 500));
    }
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ success: false, message: "Error sending OTP" });
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    const storedOTP = otpMap.get(email);
    if (!storedOTP || storedOTP !== parseInt(otp, 10)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    otpMap.delete(email);

    res
      .status(200)
      .json({ success: true, message: "Password reset successful" });
  } catch (error) {
    console.error("Error resetting password:", error);
    res
      .status(500)
      .json({ success: false, message: "Error resetting password" });
  }
});

router.get(
  "/get-user",
  isAuthenticated,
  catchAsyncError(async (req, res, next) => {
    try {
      const user = User.findById(req.user.id);
      if (!user) {
        return next(new ErrorHandler("user does not exist ", 400));
      }
      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

router.get(
  "/get-profile-data",
  isAuthenticated,
  catchAsyncError(async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }
      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  })
);

router.put(
  "/update-profile",
  isAuthenticated,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { name, email, country, currentPassword, newPassword } = req.body;
      const user = await User.findById(userId);
      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      user.name = name;
      user.email = email;
      user.country = country;

      if (req.file) {
        user.avatar = req.file.filename;
      }
      const isPasswordMatch = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordMatch) {
        return next(new ErrorHandler("Incorrect current password", 400));
      }

      if (newPassword) {
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
      }

      await user.save();

      res.status(200).json({
        success: true,
        message: "User profile and password updated successfully",
        user,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

router.post("/grant-admin-role", async (req, res) => {
  try {
    const { email } = req.body;

    const userToUpdate = await User.findOne({ email });

    if (!userToUpdate) {
      throw new Error("User not found.");
    }

    userToUpdate.role = "admin";
    await userToUpdate.save();

    res.json({ message: "Admin role granted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/logout", (req, res) => {
  res.json({ isAuthenticated: false, message: "Logged out successfully." });
});

router.post("/subscription-details", async (req, res, next) => {
  try {
    const { subscriptionType, email, name } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    user.subscriptionType = subscriptionType;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Subscription details updated successfully",
      user,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

router.get("/get-users-data", isAuthenticated, async (req, res, next) => {
  try {
    const users = await User.find().select(
      "name email subscriptionType country avatar signupDate"
    );

    if (!users || users.length == 0) {
      return res.status(404).json({
        success: false,
        error: "No users found",
      });
    }

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

router.put("/update-user/:userId", isAuthenticated, async (req, res, next) => {
  try {
    const { subscriptionType, country, profilePic, email, name } = req.body;
    const userId = req.params.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Update all fields regardless of whether they are provided or not
    user.subscriptionType = subscriptionType || user.subscriptionType;
    user.country = country || user.country;
    user.profilePic = profilePic || user.profilePic;
    user.email = email || user.email;
    user.name = name || user.name;

    await user.save();

    res.status(200).json({
      success: true,
      message: "User data updated successfully",
      user,
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 500));
  }
});

router.delete(
  "/delete-user/:userId",
  isAuthenticated,
  async (req, res, next) => {
    try {
      const userId = req.params.userId;

      // Find the user by ID and delete
      const deletedUser = await User.findByIdAndDelete(userId);

      if (!deletedUser) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "User deleted successfully",
        deletedUser,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

router.post("/contact", async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    // Save the message to the database
    const newMessage = new Message({
      senderName: name,
      senderEmail: email,
      messageBody: message,
    });

    await newMessage.save();

    // Try sending the email
    try {
      await sendMail({
        email: "thijnfelix@carbonshredder.com",
        subject: `Contact Form Submission from ${name}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong></p>
            <p>${message}</p>
          </div>
        `,
      });

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
      });
    } catch (error) {
      console.error("Error sending email:", error);
      return next(new ErrorHandler("Error sending email", 500));
    }
  } catch (error) {
    console.error("Error handling contact form submission:", error);
    res.status(500).json({ error: "Failed to process the contact form" });
  }
});

router.get("/contact-messages", async (req, res) => {
  try {
    const messages = await Message.find();
    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post(
  "/api/create-link-token",
  isAuthenticated,
  async function (req, res) {
    try {
      const { user } = req.body;
      const clientUserId = user._id;
      const plaidRequest = {
        user: {
          client_user_id: clientUserId,
        },
        client_name: "Plaid Test App",
        products: ["transactions"],
        language: "en",
        redirect_uri: "http://localhost:3000/",
        country_codes: ["US"],
      };
      const createTokenResponse = await client.linkTokenCreate(plaidRequest);
      const linkToken = createTokenResponse.data;
      res.status(200).json({ success: true, linkToken });
    } catch (error) {
      console.error("Error creating Plaid Link token:", error);
      res
        .status(500)
        .json({ success: false, error: "Error creating Plaid Link token" });
    }
  }
);

// SUBCRIPTION EMAIL
router.post("/subscribe", async (req, res) => {
  const { email } = req.body;
  try {
    // Check if the email already exists in the database
    const existingEmail = await SubscriptionEmail.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email is already subscribed." });
    }

    // If email is not a duplicate, save it to the database
    const newSubscriptionEmail = new SubscriptionEmail({ email });
    await newSubscriptionEmail.save();
    res.status(201).json({ message: "Email subscribed successfully!" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to subscribe email.", error: error.message });
  }
});

// media upload 
// Add this at the end of your file (after all other routes)

// Upload Media API (Image/Video)
router.post(
  "/upload-media",
  isAuthenticated,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const { title, description, category } = req.body;

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      const mimeType = req.file.mimetype;
      const fileType = mimeType.startsWith("video") ? "video" : "image";

      const newMedia = new Media({
        title,
        description,
        file: req.file.filename,
        fileType,
        category,
        user: req.user.id,
      });

      await newMedia.save();

      res.status(201).json({
        success: true,
        message: "Media uploaded successfully",
        media: newMedia,
      });
    } catch (error) {
      console.error("Error uploading media:", error);
      next(new ErrorHandler(error.message, 500));
    }
  }
);

router.get("/get-all-media", async (req, res, next) => {
  try {
    const mediaFiles = await Media.find().sort({ uploadedAt: -1 }); // latest first
    res.status(200).json({
      success: true,
      media: mediaFiles,
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    next(new ErrorHandler(error.message, 500));
  }
});


module.exports = router;
