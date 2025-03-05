const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

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
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB Atlas');
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware to authenticate user session
const authenticateUser = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ error: 'Access denied, no token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// User Login (EmailJS Authentication Simulation)
app.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  let user = await db.collection(COLLECTION_NAME).findOne({ email });

  if (!user) {
    user = {
      email,
      isLoggedIn: true,
      cart: []
    };
    await db.collection(COLLECTION_NAME).insertOne(user);
  } else {
    await db.collection(COLLECTION_NAME).updateOne({ email }, { $set: { isLoggedIn: true } });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// Logout User
app.post('/logout', authenticateUser, async (req, res) => {
  await db.collection(COLLECTION_NAME).updateOne({ email: req.user.email }, { $set: { isLoggedIn: false } });
  res.json({ message: 'Logged out successfully' });
});

// Get User Cart
app.get('/cart', authenticateUser, async (req, res) => {
  const user = await db.collection(COLLECTION_NAME).findOne({ email: req.user.email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user.cart);
});

// Add to Cart
app.post('/cart/add', authenticateUser, async (req, res) => {
  const { product } = req.body;
  if (!product) return res.status(400).json({ error: 'Product data required' });

  await db.collection(COLLECTION_NAME).updateOne(
    { email: req.user.email },
    { $push: { cart: product } }
  );

  res.json({ message: 'Product added to cart' });
});

// Remove from Cart
app.post('/cart/remove', authenticateUser, async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'Product ID required' });

  await db.collection(COLLECTION_NAME).updateOne(
    { email: req.user.email },
    { $pull: { cart: { _id: productId } } }
  );

  res.json({ message: 'Product removed from cart' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
