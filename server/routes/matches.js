// server/routes/matches.js
const express = require('express');
const { prepare, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get matches for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // Get matches where I want a card (user1) or someone wants my card (user2)
    const matches = prepare(`
      SELECT 
        m.id,
        m.user1_card_id as card_id,
        m.status,
        m.created_at,
        CASE 
          WHEN m.user1_id = ? THEN 1 
          ELSE 0 
        END as i_want_it,
        CASE 
          WHEN m.user1_id = ? THEN u2.display_name 
          ELSE u1.display_name 
        END as other_user_name,
        CASE 
          WHEN m.user1_id = ? THEN m.user2_id 
          ELSE m.user1_id 
        END as other_user_id,
        uc.card_name,
        uc.card_image
      FROM matches m
      JOIN users u1 ON m.user1_id = u1.id
      JOIN users u2 ON m.user2_id = u2.id
      LEFT JOIN user_cards uc ON uc.card_id = m.user1_card_id AND uc.user_id = m.user2_id
      WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.status = 'pending'
      ORDER BY m.created_at DESC
    `).all(userId, userId, userId, userId, userId);

    res.json(matches);
  } catch (err) {
    console.error('Error getting matches:', err);
    res.status(500).json({ error: 'Failed to get matches' });
  }
});

// Cancel a want request
router.post('/cancel-want', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { cardId, friendId } = req.body;

    // Delete the match where I want this card from this friend
    const result = prepare(
      `DELETE FROM matches 
       WHERE user1_id = ? AND user2_id = ? AND user1_card_id = ? AND status = 'pending'`
    ).run(userId, friendId, cardId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Want request not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling want:', err);
    res.status(500).json({ error: 'Failed to cancel want request' });
  }
});

// Get notifications
router.get('/notifications', authenticateToken, (req, res) => {
  try {
    const notifications = prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all(req.user.id);

    res.json(notifications);
  } catch (err) {
    console.error('Error getting notifications:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    prepare(`
      UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.post('/notifications/read-all', authenticateToken, (req, res) => {
  try {
    prepare(`
      UPDATE notifications SET is_read = 1 WHERE user_id = ?
    `).run(req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

module.exports = router;