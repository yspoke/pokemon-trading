// server/routes/cards.js
const express = require('express');
const { prepare, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get my cards
router.get('/my-cards', authenticateToken, (req, res) => {
  const cards = prepare(`
    SELECT * FROM user_cards WHERE user_id = ?
  `).all(req.user.id);

  const available = cards.filter(c => c.status === 'available');
  const wanted = cards.filter(c => c.status === 'wanted');

  res.json({ available, wanted });
});

// Add a card I have
router.post('/add', authenticateToken, (req, res) => {
  const { cardId, cardName, cardImage, cardSet, status } = req.body;

  if (!cardId || !cardName || !cardImage || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['available', 'wanted'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = prepare(`
      INSERT INTO user_cards (user_id, card_id, card_name, card_image, card_set, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, cardId, cardName, cardImage, cardSet || '', status);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Card already in your list' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Want a card from a friend (creates a match directly)
router.post('/want', authenticateToken, (req, res) => {
  const { cardId, cardName, cardImage, cardSet, friendId } = req.body;

  if (!cardId || !cardName || !friendId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if there's already a PENDING match for this card from this friend
    const existingMatch = prepare(`
      SELECT id FROM matches
      WHERE user2_id = ? AND user1_card_id = ? AND status = 'pending'
    `).get(friendId, cardId);

    if (existingMatch) {
      return res.status(400).json({ error: 'Someone already wants this card. Wait for their trade to complete.' });
    }

    // Check if I already have a pending match for this card from this friend
    const myExistingMatch = prepare(`
      SELECT id FROM matches
      WHERE user1_id = ? AND user2_id = ? AND user1_card_id = ? AND status = 'pending'
    `).get(req.user.id, friendId, cardId);

    if (myExistingMatch) {
      return res.status(400).json({ error: 'You already want this card from this friend!' });
    }

    // Verify friend actually has this card
    const friendHasCard = prepare(`
      SELECT id FROM user_cards
      WHERE user_id = ? AND card_id = ? AND status = 'available'
    `).get(friendId, cardId);

    if (!friendHasCard) {
      return res.status(400).json({ error: 'Friend no longer has this card' });
    }

    // Create match: user1 wants the card, user2 has it
    const result = prepare(`
      INSERT INTO matches (user1_id, user2_id, user1_card_id, user2_card_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.id, friendId, cardId, cardId);

    // Get friend's name for notification
    const friend = prepare(`SELECT display_name FROM users WHERE id = ?`).get(friendId);

    // Notify the friend
    prepare(`
      INSERT INTO notifications (user_id, message, match_id)
      VALUES (?, ?, ?)
    `).run(friendId, `🎉 ${req.user.displayName} wants your ${cardName}!`, result.lastInsertRowid);

    res.json({ success: true, matchId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if a card is already wanted by someone
router.get('/card-status/:friendId/:cardId', authenticateToken, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  const cardId = req.params.cardId;

  // Check if there's a pending match for this card
  const pendingMatch = prepare(`
    SELECT m.id, m.user1_id, u.display_name as wanter_name
    FROM matches m
    JOIN users u ON m.user1_id = u.id
    WHERE m.user2_id = ? AND m.user1_card_id = ? AND m.status = 'pending'
  `).get(friendId, cardId);

  if (pendingMatch) {
    const isMe = pendingMatch.user1_id === req.user.id;
    res.json({
      isWanted: true,
      byMe: isMe,
      wanterName: isMe ? 'You' : pendingMatch.wanter_name
    });
  } else {
    res.json({ isWanted: false });
  }
});

// Remove a card
router.delete('/remove/:id', authenticateToken, (req, res) => {
  const result = prepare(`
    DELETE FROM user_cards WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json({ success: true });
});

// Browse all available cards from other users
router.get('/browse', authenticateToken, (req, res) => {
  const cards = prepare(`
    SELECT uc.*, u.display_name as owner_name, u.username as owner_username
    FROM user_cards uc
    JOIN users u ON uc.user_id = u.id
    WHERE uc.user_id != ? AND uc.status = 'available'
    ORDER BY uc.created_at DESC
  `).all(req.user.id);

  res.json(cards);
});

module.exports = router;