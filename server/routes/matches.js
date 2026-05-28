// server/routes/matches.js
const express = require('express');
const { prepare } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all matches for current user
router.get('/', authenticateToken, (req, res) => {
  const matches = prepare(`
    SELECT
      m.id,
      m.user1_id,
      m.user2_id,
      m.user1_card_id as card_id,
      m.status,
      m.created_at,
      u1.display_name as wanter_name,
      u2.display_name as haver_name,
      uc.card_name,
      uc.card_image
    FROM matches m
    JOIN users u1 ON m.user1_id = u1.id
    JOIN users u2 ON m.user2_id = u2.id
    LEFT JOIN user_cards uc ON uc.card_id = m.user1_card_id AND uc.user_id = m.user2_id
    WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.status != 'completed'
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id);

  const formattedMatches = matches.map(match => {
    const iAmWanter = match.user1_id === req.user.id;
    
    return {
      id: match.id,
      card_id: match.card_id,
      card_name: match.card_name || 'Unknown Card',
      card_image: match.card_image || '',
      i_want_it: iAmWanter,
      other_user_name: iAmWanter ? match.haver_name : match.wanter_name,
      other_user_id: iAmWanter ? match.user2_id : match.user1_id,
      status: match.status,
      created_at: match.created_at
    };
  });

  res.json(formattedMatches);
});

// Complete a match
router.post('/:id/complete', authenticateToken, (req, res) => {
  const matchId = req.params.id;

  // Verify user is part of this match
  const match = prepare(`
    SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)
  `).get(matchId, req.user.id, req.user.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Mark as completed
  prepare(`UPDATE matches SET status = 'completed' WHERE id = ?`).run(matchId);

  res.json({ success: true });
});

// Get notifications
router.get('/notifications', authenticateToken, (req, res) => {
  const notifications = prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json(notifications);
});

// Mark notification as read
router.put('/notifications/:id/read', authenticateToken, (req, res) => {
  prepare(`
    UPDATE notifications SET is_read = 1
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);

  res.json({ success: true });
});

// Get unread notification count
router.get('/notifications/unread-count', authenticateToken, (req, res) => {
  const result = prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(req.user.id);

  res.json({ count: result?.count || 0 });
});

module.exports = router;