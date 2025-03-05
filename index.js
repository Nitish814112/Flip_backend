const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const DB_URI = process.env.DB_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;
const JWT_SECRET = process.env.JWT_SECRET;

let db;

MongoClient.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((client) => {
    db = client.db(DB_NAME);
    console.log("Connected to MongoDB Atlas");
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Middleware to authenticate user session
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access denied, no token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// Function to generate a 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Nodemailer transporter (Configure your email)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// User Login (Send OTP)
app.post("/login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const otp = generateOTP();
  let user = await db.collection(COLLECTION_NAME).findOne({ email });

  if (!user) {
    user = {
      email,
      isLoggedIn: false,
      otp,
      cart: [],
    };
    await db.collection(COLLECTION_NAME).insertOne(user);
  } else {
    await db.collection(COLLECTION_NAME).updateOne({ email }, { $set: { otp, isLoggedIn: false } });
  }

  // Send OTP via email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP for Login",
    text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Error sending email:", error);
      return res.status(500).json({ error: "Failed to send OTP" });
    }
    console.log("Email sent:", info.response);
  });

  res.json({ success: true, message: "OTP sent successfully" });
});

// Verify OTP and Log In
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

  const user = await db.collection(COLLECTION_NAME).findOne({ email });

  if (!user || user.otp !== otp) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  await db.collection(COLLECTION_NAME).updateOne({ email }, { $set: { isLoggedIn: true, otp: null } });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, user });
});

// Logout User
app.post("/logout", authenticateUser, async (req, res) => {
  await db.collection(COLLECTION_NAME).updateOne({ email: req.user.email }, { $set: { isLoggedIn: false } });
  res.json({ message: "Logged out successfully" });
});

// Get User Cart
app.get("/cart", authenticateUser, async (req, res) => {
  const user = await db.collection(COLLECTION_NAME).findOne({ email: req.user.email });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user.cart);
});

// Add to Cart
app.post("/cart/add", authenticateUser, async (req, res) => {
  const { product } = req.body;
  if (!product) return res.status(400).json({ error: "Product data required" });

  await db.collection(COLLECTION_NAME).updateOne(
    { email: req.user.email },
    { $push: { cart: product } }
  );

  res.json({ message: "Product added to cart" });
});

// Remove from Cart (Fix ObjectId issue)
app.post("/cart/remove", authenticateUser, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: "Product ID required" });

  try {
    await db.collection(COLLECTION_NAME).updateOne(
      { email: req.user.email },
      { $pull: { cart: { _id: new ObjectId(productId) } } }
    );

    res.json({ message: "Product removed from cart" });
  } catch (error) {
    res.status(400).json({ error: "Invalid Product ID" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
