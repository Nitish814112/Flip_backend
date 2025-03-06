const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String }, // Store OTP
});

module.exports = mongoose.model("User", userSchema);
