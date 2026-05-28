// server/routes/users.js
const express = require('express');
const { prepare } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all users except current user
router.get('/', authenticateToken, (req, res) => {
  const users = prepare(`
    SELECT id, username, display_name FROM users WHERE id != ?
  `).all(req.user.id);

  res.json(users);
});

// Get a user's cards by user ID (with pending match info)
router.get('/id/:userId/cards', authenticateToken, (req, res) => {
  const userId = parseInt(req.params.userId);
  const currentUserId = req.user.id;
  
  const user = prepare(`
    SELECT id, display_name FROM users WHERE id = ?
  `).get(userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const allCards = prepare(`
    SELECT * FROM user_cards WHERE user_id = ?
  `).all(userId);

  const available = allCards
    .filter(c => c.status === 'available')
    .map(card => {
      // Check if this card has a pending match
      const pendingMatch = prepare(`
        SELECT m.id, m.user1_id, u.display_name as wanter_name
        FROM matches m
        JOIN users u ON m.user1_id = u.id
        WHERE m.user2_id = ? AND m.user1_card_id = ? AND m.status = 'pending'
      `).get(userId, card.card_id);

      return {
        ...card,
        isPending: !!pendingMatch,
        pendingByMe: pendingMatch?.user1_id === currentUserId,
        wanterName: pendingMatch?.wanter_name || null
      };
    });

  res.json({ 
    user, 
    available
  });
});

// Get a user's cards by username (backup)
router.get('/:username/cards', authenticateToken, (req, res) => {
  const user = prepare(`
    SELECT id, display_name FROM users WHERE LOWER(username) = LOWER(?)
  `).get(req.params.username);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const cards = prepare(`
    SELECT * FROM user_cards WHERE user_id = ?
  `).all(user.id);

  const available = cards.filter(c => c.status === 'available');

  res.json({ 
    user, 
    available
  });
});

module.exports = router;