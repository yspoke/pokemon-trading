// server/routes/admin.js
const express = require('express');
const { prepare } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Secret admin key
const ADMIN_KEY = 'pokemon';

// Add a new user
router.post('/add-user', (req, res) => {
  const { adminKey, username, password, displayName } = req.body;

  // Check admin key
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Missing required fields: username, password, displayName' });
  }

  try {
    // Check if user already exists
    const existing = prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create user
    const result = prepare(`
      INSERT INTO users (username, password, display_name)
      VALUES (?, ?, ?)
    `).run(username, password, displayName);

    console.log(`Created new user: ${username}`);
    res.json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all users (admin only)
router.post('/list-users', (req, res) => {
  const { adminKey } = req.body;

  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  const users = prepare('SELECT id, username, display_name, created_at FROM users').all();
  res.json(users);
});

// Delete a user (admin only)
router.post('/delete-user', (req, res) => {
  const { adminKey, username } = req.body;

  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }

  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    const user = prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's cards, matches, trades, notifications
    prepare('DELETE FROM user_cards WHERE user_id = ?').run(user.id);
    prepare('DELETE FROM matches WHERE user1_id = ? OR user2_id = ?').run(user.id, user.id);
    prepare('DELETE FROM trades WHERE user1_id = ? OR user2_id = ?').run(user.id, user.id);
    prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id);
    prepare('DELETE FROM users WHERE id = ?').run(user.id);

    console.log(`Deleted user: ${username}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;