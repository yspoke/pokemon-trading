// server/routes/trades.js
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { prepare, saveDatabase } = require('../database');

const router = express.Router();

// Get possible trades (based on matches - where both users want each other's cards)
router.get('/possible', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // Get matches where I want someone's card
    const iWantMatches = prepare(
      `SELECT m.*, uc.card_rarity
       FROM matches m
       LEFT JOIN user_cards uc ON uc.card_id = m.user1_card_id AND uc.user_id = m.user2_id
       WHERE m.user1_id = ? AND m.status = 'pending'`
    ).all(userId);

    // Get matches where someone wants my card
    const theyWantMatches = prepare(
      `SELECT m.*, uc.card_rarity
       FROM matches m
       LEFT JOIN user_cards uc ON uc.card_id = m.user1_card_id AND uc.user_id = m.user2_id
       WHERE m.user2_id = ? AND m.status = 'pending'`
    ).all(userId);

    // Get existing pending trades to calculate reserved quantities
    const pendingTrades = prepare(
      `SELECT * FROM trades WHERE (user1_id = ? OR user2_id = ?) AND status = 'pending'`
    ).all(userId, userId);

    // Calculate how many of each card is reserved in pending trades
    const myReservedCards = {};
    const theirReservedCards = {};

    pendingTrades.forEach(trade => {
      if (trade.user1_id === userId) {
        myReservedCards[trade.user1_card_id] = (myReservedCards[trade.user1_card_id] || 0) + 1;
        const theirKey = trade.user2_id + '_' + trade.user2_card_id;
        theirReservedCards[theirKey] = (theirReservedCards[theirKey] || 0) + 1;
      } else {
        myReservedCards[trade.user2_card_id] = (myReservedCards[trade.user2_card_id] || 0) + 1;
        const theirKey = trade.user1_id + '_' + trade.user1_card_id;
        theirReservedCards[theirKey] = (theirReservedCards[theirKey] || 0) + 1;
      }
    });

    const possibleTrades = [];

    // For each card I want from someone
    for (const iWant of iWantMatches) {
      // Check if that same person wants one of my cards
      for (const theyWant of theyWantMatches) {
        // Must be the same other user
        if (iWant.user2_id !== theyWant.user1_id) continue;

        const otherUserId = iWant.user2_id;
        const cardIWantId = iWant.user1_card_id;
        const cardTheyWantId = theyWant.user1_card_id;

        // Get my card details and quantity
        const myCard = prepare(
          `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
        ).get(userId, cardTheyWantId);

        // Get their card details and quantity
        const theirCard = prepare(
          `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
        ).get(otherUserId, cardIWantId);

        if (!myCard || !theirCard) continue;

        // Check if rarities match
        if (myCard.card_rarity !== theirCard.card_rarity) continue;

        // Calculate available quantities (total minus reserved in pending trades)
        const myTotalQty = myCard.quantity || 1;
        const myReserved = myReservedCards[cardTheyWantId] || 0;
        const myAvailable = myTotalQty - myReserved;

        const theirKey = otherUserId + '_' + cardIWantId;
        const theirTotalQty = theirCard.quantity || 1;
        const theirReserved = theirReservedCards[theirKey] || 0;
        const theirAvailable = theirTotalQty - theirReserved;

        // Skip if either card has no available quantity
        if (myAvailable <= 0 || theirAvailable <= 0) continue;

        // Get other user's name
        const otherUser = prepare(
          `SELECT display_name FROM users WHERE id = ?`
        ).get(otherUserId);

        if (!otherUser) continue;

        // Add to possible trades
        possibleTrades.push({
          myCard: {
            id: myCard.card_id,
            name: myCard.card_name,
            image: myCard.card_image,
            rarity: myCard.card_rarity,
            available: myAvailable
          },
          theirCard: {
            id: theirCard.card_id,
            name: theirCard.card_name,
            image: theirCard.card_image,
            rarity: theirCard.card_rarity,
            ownerId: otherUserId,
            ownerName: otherUser.display_name,
            available: theirAvailable
          }
        });
      }
    }

    res.json(possibleTrades);

  } catch (err) {
    console.error('Error getting possible trades:', err);
    res.status(500).json({ error: 'Failed to get possible trades' });
  }
});

// Get pending trades for current user
router.get('/pending', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const trades = prepare(
      `SELECT t.*, 
        u1.display_name as user1_name,
        u2.display_name as user2_name
       FROM trades t
       JOIN users u1 ON t.user1_id = u1.id
       JOIN users u2 ON t.user2_id = u2.id
       WHERE (t.user1_id = ? OR t.user2_id = ?) AND t.status = 'pending'
       ORDER BY t.created_at DESC`
    ).all(userId, userId);

    // Format the trades for the frontend
    const formattedTrades = trades.map(trade => {
      const isUser1 = trade.user1_id === userId;
      
      // If card names aren't stored, try to get them from user_cards
      let user1CardName = trade.user1_card_name;
      let user1CardImage = trade.user1_card_image;
      let user2CardName = trade.user2_card_name;
      let user2CardImage = trade.user2_card_image;

      if (!user1CardName) {
        const card1 = prepare(
          `SELECT card_name, card_image FROM user_cards WHERE user_id = ? AND card_id = ?`
        ).get(trade.user1_id, trade.user1_card_id);
        if (card1) {
          user1CardName = card1.card_name;
          user1CardImage = card1.card_image;
        }
      }

      if (!user2CardName) {
        const card2 = prepare(
          `SELECT card_name, card_image FROM user_cards WHERE user_id = ? AND card_id = ?`
        ).get(trade.user2_id, trade.user2_card_id);
        if (card2) {
          user2CardName = card2.card_name;
          user2CardImage = card2.card_image;
        }
      }

      return {
        id: trade.id,
        myCard: {
          id: isUser1 ? trade.user1_card_id : trade.user2_card_id,
          name: isUser1 ? (user1CardName || 'Unknown Card') : (user2CardName || 'Unknown Card'),
          image: isUser1 ? (user1CardImage || '') : (user2CardImage || '')
        },
        theirCard: {
          id: isUser1 ? trade.user2_card_id : trade.user1_card_id,
          name: isUser1 ? (user2CardName || 'Unknown Card') : (user1CardName || 'Unknown Card'),
          image: isUser1 ? (user2CardImage || '') : (user1CardImage || '')
        },
        otherUserName: isUser1 ? trade.user2_name : trade.user1_name,
        isUser1: isUser1,
        status: trade.status,
        createdAt: trade.created_at
      };
    });

    res.json(formattedTrades);

  } catch (err) {
    console.error('Error getting pending trades:', err);
    res.status(500).json({ error: 'Failed to get pending trades' });
  }
});

// Propose a trade
router.post('/propose', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { myCardId, theirCardId, theirUserId } = req.body;

    // Get my card details
    const myCard = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
    ).get(userId, myCardId);

    if (!myCard) {
      return res.status(400).json({ error: 'You do not have this card available' });
    }

    // Get their card details
    const theirCard = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
    ).get(theirUserId, theirCardId);

    if (!theirCard) {
      return res.status(400).json({ error: 'That card is not available' });
    }

    // Check if rarities match
    if (myCard.card_rarity !== theirCard.card_rarity) {
      return res.status(400).json({ error: 'Cards must have the same rarity to trade' });
    }

    // Check if trade already exists
    const existingTrade = prepare(
      `SELECT * FROM trades 
       WHERE status = 'pending' AND (
         (user1_id = ? AND user2_id = ? AND user1_card_id = ? AND user2_card_id = ?)
         OR (user1_id = ? AND user2_id = ? AND user1_card_id = ? AND user2_card_id = ?)
       )`
    ).get(userId, theirUserId, myCardId, theirCardId, theirUserId, userId, theirCardId, myCardId);

    if (existingTrade) {
      return res.status(400).json({ error: 'This trade has already been proposed' });
    }

    // Create the trade with card details
    prepare(
      `INSERT INTO trades (
        user1_id, user2_id, 
        user1_card_id, user1_card_name, user1_card_image,
        user2_card_id, user2_card_name, user2_card_image,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
    ).run(
      userId, theirUserId, 
      myCardId, myCard.card_name, myCard.card_image,
      theirCardId, theirCard.card_name, theirCard.card_image
    );

    res.json({ success: true, message: 'Trade proposed successfully' });

  } catch (err) {
    console.error('Error proposing trade:', err);
    res.status(500).json({ error: 'Failed to propose trade' });
  }
});

// Complete a trade
router.post('/:id/complete', authenticateToken, (req, res) => {
  try {
    const tradeId = req.params.id;
    const userId = req.user.id;

    // Get the trade
    const trade = prepare(
      `SELECT * FROM trades WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND status = 'pending'`
    ).get(tradeId, userId, userId);

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    // Decrement quantity for user1's card (or remove if quantity becomes 0)
    const user1Card = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
    ).get(trade.user1_id, trade.user1_card_id);

    if (user1Card) {
      if ((user1Card.quantity || 1) <= 1) {
        prepare(`DELETE FROM user_cards WHERE id = ?`).run(user1Card.id);
      } else {
        prepare(`UPDATE user_cards SET quantity = quantity - 1 WHERE id = ?`).run(user1Card.id);
      }
    }

    // Decrement quantity for user2's card (or remove if quantity becomes 0)
    const user2Card = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'available'`
    ).get(trade.user2_id, trade.user2_card_id);

    if (user2Card) {
      if ((user2Card.quantity || 1) <= 1) {
        prepare(`DELETE FROM user_cards WHERE id = ?`).run(user2Card.id);
      } else {
        prepare(`UPDATE user_cards SET quantity = quantity - 1 WHERE id = ?`).run(user2Card.id);
      }
    }

    // Also decrement from wanted lists if they exist
    const user1Wanted = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'wanted'`
    ).get(trade.user1_id, trade.user2_card_id);

    if (user1Wanted) {
      if ((user1Wanted.quantity || 1) <= 1) {
        prepare(`DELETE FROM user_cards WHERE id = ?`).run(user1Wanted.id);
      } else {
        prepare(`UPDATE user_cards SET quantity = quantity - 1 WHERE id = ?`).run(user1Wanted.id);
      }
    }

    const user2Wanted = prepare(
      `SELECT * FROM user_cards WHERE user_id = ? AND card_id = ? AND status = 'wanted'`
    ).get(trade.user2_id, trade.user1_card_id);

    if (user2Wanted) {
      if ((user2Wanted.quantity || 1) <= 1) {
        prepare(`DELETE FROM user_cards WHERE id = ?`).run(user2Wanted.id);
      } else {
        prepare(`UPDATE user_cards SET quantity = quantity - 1 WHERE id = ?`).run(user2Wanted.id);
      }
    }

    // Mark trade as completed
    prepare(
      `UPDATE trades SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(tradeId);

    // Clean up related matches
    prepare(
      `DELETE FROM matches WHERE 
        (user1_id = ? AND user2_id = ? AND user1_card_id = ?) OR
        (user1_id = ? AND user2_id = ? AND user1_card_id = ?)`
    ).run(trade.user1_id, trade.user2_id, trade.user2_card_id, trade.user2_id, trade.user1_id, trade.user1_card_id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error completing trade:', err);
    res.status(500).json({ error: 'Failed to complete trade' });
  }
});

// Cancel a trade
router.post('/:id/cancel', authenticateToken, (req, res) => {
  try {
    const tradeId = req.params.id;
    const userId = req.user.id;

    // Verify this trade belongs to the user
    const trade = prepare(
      `SELECT * FROM trades WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND status = 'pending'`
    ).get(tradeId, userId, userId);

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    // Just delete the trade - don't modify card quantities
    prepare(`DELETE FROM trades WHERE id = ?`).run(tradeId);

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling trade:', err);
    res.status(500).json({ error: 'Failed to cancel trade' });
  }
});

module.exports = router;