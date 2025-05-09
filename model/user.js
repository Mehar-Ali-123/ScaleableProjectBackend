const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    default: "user",
    enum: ["user", "admin"],
  },
  subscriptionType: {
    type: String,
  },
  emailToken: {
    type: String,
  },
  isVerified: {
    type: Boolean,
  },
  signupDate: {
    type: String,
  },

  plaidAccessTokenData: [
    {
      accessToken: {
        type: String,
        required: false,
      },
      itemId: {
        type: String,
        required: false,
      },
    },
  ],
  cnughtCreatedSubaccunt: [
    {
      subaccountId: { type: String },
      name: { type: String },
      email: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  cnughtCreatedOrder: [
    {
      stripe_customer_id: { type: String },
      stripe_subaccount_id: { type: String },
      order_id: { type: String },
      download_certificate: { type: String },
      order_number: { type: String },
      amount_kg: { type: String },
      price_usd_cents: { type: String },
      state: { type: String },
      created_on: { type: Date },
    },
  ],
  uploadedMedia: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
    },
  ],
  amount_kg: {
    type: Number,
    required: false,
  },
});

userSchema.methods.getJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES,
  });
};

userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to grant role to another user (admin only)
userSchema.methods.grantRole = async function (email, newRole) {
  if (this.role !== "admin") {
    throw new Error("Only admin users can grant roles.");
  }

  const userToUpdate = await this.model("User").findOne({ email });

  if (!userToUpdate) {
    throw new Error("User not found.");
  }

  userToUpdate.role = newRole;
  await userToUpdate.save();

  return userToUpdate;
};

module.exports = mongoose.model("User", userSchema);
