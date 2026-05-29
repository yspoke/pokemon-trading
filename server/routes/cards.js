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

// Add a card I have (now includes rarity and quantity)
router.post('/add', authenticateToken, (req, res) => {
  const { cardId, cardName, cardImage, cardSet, cardRarity, status, quantity } = req.body;

  if (!cardId || !cardName || !cardImage || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['available', 'wanted'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Check if card already exists
    const existing = prepare(`
      SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = ?
    `).get(req.user.id, cardId, status);

    if (existing) {
      // Update quantity
      const newQuantity = (existing.quantity || 1) + (quantity || 1);
      prepare(`
        UPDATE user_cards SET quantity = ? WHERE id = ?
      `).run(newQuantity, existing.id);
      return res.json({ success: true, id: existing.id, quantity: newQuantity });
    }

    // Insert new card
    const result = prepare(`
      INSERT INTO user_cards (user_id, card_id, card_name, card_image, card_set, card_rarity, status, quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, cardId, cardName, cardImage, cardSet || '', cardRarity || '', status, quantity || 1);

    res.json({ success: true, id: result.lastInsertRowid, quantity: quantity || 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update card quantity
router.post('/update-quantity', authenticateToken, (req, res) => {
  const { cardId, status, quantity } = req.body;

  if (!cardId || !status || quantity === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    if (quantity <= 0) {
      // Delete the card if quantity is 0 or less
      prepare(`
        DELETE FROM user_cards WHERE user_id = ? AND card_id = ? AND status = ?
      `).run(req.user.id, cardId, status);
      return res.json({ success: true, deleted: true });
    }

    prepare(`
      UPDATE user_cards SET quantity = ? WHERE user_id = ? AND card_id = ? AND status = ?
    `).run(quantity, req.user.id, cardId, status);

    res.json({ success: true, quantity: quantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Want a card from a friend (creates a match and adds to wanted list if not already there)
router.post('/want', authenticateToken, (req, res) => {
  const { cardId, cardName, cardImage, cardSet, friendId } = req.body;

  if (!cardId || !cardName || !friendId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if there's already a PENDING match for this card from this friend by someone else
    const existingMatch = prepare(`
      SELECT id, user1_id FROM matches
      WHERE user2_id = ? AND user1_card_id = ? AND status = 'pending'
    `).get(friendId, cardId);

    if (existingMatch && existingMatch.user1_id !== req.user.id) {
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
    const friendCard = prepare(`
      SELECT * FROM user_cards
      WHERE user_id = ? AND card_id = ? AND status = 'available'
    `).get(friendId, cardId);

    if (!friendCard) {
      return res.status(400).json({ error: 'Friend no longer has this card' });
    }

    // Add to my wanted list ONLY if not already there (don't increment)
    const alreadyWanted = prepare(`
      SELECT id FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'wanted'
    `).get(req.user.id, cardId);

    if (!alreadyWanted) {
      prepare(`
        INSERT INTO user_cards (user_id, card_id, card_name, card_image, card_set, card_rarity, status, quantity)
        VALUES (?, ?, ?, ?, ?, ?, 'wanted', 1)
      `).run(req.user.id, cardId, cardName, cardImage, cardSet || '', friendCard.card_rarity || '');
    }

    // Create match: user1 wants the card, user2 has it
    const result = prepare(`
      INSERT INTO matches (user1_id, user2_id, user1_card_id, user2_card_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(req.user.id, friendId, cardId, cardId);

    // Notify the friend
    prepare(`
      INSERT INTO notifications (user_id, message, match_id)
      VALUES (?, ?, ?)
    `).run(friendId, req.user.displayName + ' wants your ' + cardName + '!', result.lastInsertRowid);

    res.json({ success: true, matchId: result.lastInsertRowid });
  } catch (err) {
    console.error('Error in want:', err);
    res.status(500).json({ error: err.message });
  }
});

// I have a card that a friend wants (creates a match)
router.post('/i-have', authenticateToken, (req, res) => {
  const { cardId, cardName, cardImage, cardSet, cardRarity, friendId } = req.body;

  if (!cardId || !cardName || !friendId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if I already have this card in my collection
    let myCard = prepare(`
      SELECT id FROM user_cards
      WHERE user_id = ? AND card_id = ? AND status = 'available'
    `).get(req.user.id, cardId);

    // If I don't have it, add it to my collection
    if (!myCard) {
      prepare(`
        INSERT INTO user_cards (user_id, card_id, card_name, card_image, card_set, card_rarity, status, quantity)
        VALUES (?, ?, ?, ?, ?, ?, 'available', 1)
      `).run(req.user.id, cardId, cardName, cardImage, cardSet || '', cardRarity || '');
    }

    // Check if there's already a pending match
    const existingMatch = prepare(`
      SELECT id FROM matches
      WHERE user1_id = ? AND user2_id = ? AND user1_card_id = ? AND status = 'pending'
    `).get(friendId, req.user.id, cardId);

    if (existingMatch) {
      return res.status(400).json({ error: 'Match already exists for this card!' });
    }

    // Create match: friend wants the card (user1), I have it (user2)
    const result = prepare(`
      INSERT INTO matches (user1_id, user2_id, user1_card_id, user2_card_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(friendId, req.user.id, cardId, cardId);

    // Notify the friend
    prepare(`
      INSERT INTO notifications (user_id, message, match_id)
      VALUES (?, ?, ?)
    `).run(friendId, req.user.displayName + ' has the ' + cardName + ' you want!', result.lastInsertRowid);

    res.json({ success: true, matchId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a card - also removes related matches and trades
router.delete('/remove/:id', authenticateToken, (req, res) => {
  // First get the card info
  const card = prepare(`
    SELECT * FROM user_cards WHERE id = ? AND user_id = ?
  `).get(req.params.id, req.user.id);

  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  // Delete related matches where this user has this card
  prepare(`
    DELETE FROM matches 
    WHERE (user1_id = ? AND user1_card_id = ?) 
       OR (user2_id = ? AND user2_card_id = ?)
  `).run(req.user.id, card.card_id, req.user.id, card.card_id);

  // Delete related trades where this user has this card
  prepare(`
    DELETE FROM trades 
    WHERE ((user1_id = ? AND user1_card_id = ?) 
       OR (user2_id = ? AND user2_card_id = ?))
       AND status = 'pending'
  `).run(req.user.id, card.card_id, req.user.id, card.card_id);

  // Delete the card
  prepare(`
    DELETE FROM user_cards WHERE id = ?
  `).run(req.params.id);

  res.json({ success: true });
});

// Remove a wanted card
router.delete('/remove-wanted/:cardId', authenticateToken, (req, res) => {
  const result = prepare(`
    DELETE FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'wanted'
  `).run(req.user.id, req.params.cardId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json({ success: true });
});

module.exports = router;