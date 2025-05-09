const mongoose = require("mongoose");

const subscriptionEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  subscribedAt: {
    type: Date,
    default: Date.now,
  },
});

const SubscriptionEmail = mongoose.model(
  "SubscriptionEmail",
  subscriptionEmailSchema
);

module.exports = SubscriptionEmail;
