const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { z } = require('zod');

const app = express();
const db = new Database('movies.db');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(
  cors({
    origin: 'http://localhost:3000/',
  })
);
app.use(express.json());

// Define types
// In JavaScript, types are not defined explicitly, so we can skip this

// Database initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    movie_id INTEGER,
    watched BOOLEAN DEFAULT 0,
    favorite BOOLEAN DEFAULT 0,
    rating INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Auth middleware
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('No token provided');

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  const schema = z.object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
  });

  try {
    const { username, email, password } = schema.parse(req.body);
    const hashedPassword = await bcrypt.hash(password, 10);

    db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(
      username,
      email,
      hashedPassword
    );

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(400).json({ message: 'Invalid input or user already exists' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  try {
    const { email, password } = schema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token });
  } catch (error) {
    res.status(400).json({ message: 'Invalid input' });
  }
});

// Example protected route
app.get('/api/protected', auth, (req, res) => {
  res.json({ message: `Welcome, ${req.user.username}` });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
