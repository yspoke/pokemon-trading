// server/routes/admin.js
const express = require('express');
const { prepare } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all users with card counts
router.get('/users', authenticateToken, (req, res) => {
  try {
    const users = prepare(`
      SELECT u.id, u.username, u.display_name,
        (SELECT COUNT(*) FROM user_cards WHERE user_id = u.id) as card_count
      FROM users u
      ORDER BY u.id
    `).all();

    res.json(users);
  } catch (err) {
    console.error('Error getting users:', err);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Add new user
router.post('/users', authenticateToken, (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    // Check if username exists
    const existing = prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    prepare(`
      INSERT INTO users (username, password, display_name)
      VALUES (?, ?, ?)
    `).run(username.toLowerCase(), password, displayName);

    res.json({ success: true });
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

// Delete user
router.delete('/users/:id', authenticateToken, (req, res) => {
  const userId = req.params.id;

  try {
    // Delete user's cards
    prepare('DELETE FROM user_cards WHERE user_id = ?').run(userId);

    // Delete user's matches
    prepare('DELETE FROM matches WHERE user1_id = ? OR user2_id = ?').run(userId, userId);

    // Delete user's trades
    prepare('DELETE FROM trades WHERE user1_id = ? OR user2_id = ?').run(userId, userId);

    // Delete user's notifications
    prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);

    // Delete user
    prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const userCount = prepare('SELECT COUNT(*) as count FROM users').get().count;
    const cardCount = prepare('SELECT COUNT(*) as count FROM user_cards').get().count;
    const matchCount = prepare('SELECT COUNT(*) as count FROM matches WHERE status = ?').get('pending').count;
    const tradeCount = prepare('SELECT COUNT(*) as count FROM trades').get().count;

    res.json({
      users: userCount,
      cards: cardCount,
      pendingMatches: matchCount,
      trades: tradeCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get all data for backup
router.get('/backup', authenticateToken, (req, res) => {
  try {
    const users = prepare('SELECT id, username, password, display_name FROM users').all();
    const userCards = prepare('SELECT * FROM user_cards').all();
    const matches = prepare('SELECT * FROM matches').all();
    const trades = prepare('SELECT * FROM trades').all();
    const notifications = prepare('SELECT * FROM notifications').all();

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        users,
        userCards,
        matches,
        trades,
        notifications
      }
    };

    res.json(backup);
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Restore data from backup
router.post('/restore', authenticateToken, (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Clear existing data
    prepare('DELETE FROM notifications').run();
    prepare('DELETE FROM trades').run();
    prepare('DELETE FROM matches').run();
    prepare('DELETE FROM user_cards').run();

    // Restore users (add new ones, skip existing)
    if (data.users && data.users.length > 0) {
      data.users.forEach(user => {
        try {
          // Check if user already exists
          const existing = prepare('SELECT id FROM users WHERE username = ?').get(user.username);
          if (!existing) {
            prepare(`
              INSERT INTO users (id, username, password, display_name)
              VALUES (?, ?, ?, ?)
            `).run(user.id, user.username, user.password || user.username, user.display_name);
          }
        } catch (e) {
          console.log('Skip user:', e.message);
        }
      });
    }

    // Restore user_cards
    if (data.userCards && data.userCards.length > 0) {
      data.userCards.forEach(card => {
        try {
          prepare(`
            INSERT INTO user_cards (id, user_id, card_id, card_name, card_image, card_set, card_rarity, status, quantity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            card.id, card.user_id, card.card_id, card.card_name, card.card_image,
            card.card_set || '', card.card_rarity || '', card.status, card.quantity || 1, card.created_at
          );
        } catch (e) {
          console.log('Skip card:', e.message);
        }
      });
    }

    // Restore matches
    if (data.matches && data.matches.length > 0) {
      data.matches.forEach(match => {
        try {
          prepare(`
            INSERT INTO matches (id, user1_id, user2_id, user1_card_id, user2_card_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            match.id, match.user1_id, match.user2_id, match.user1_card_id,
            match.user2_card_id, match.status, match.created_at
          );
        } catch (e) {
          console.log('Skip match:', e.message);
        }
      });
    }

    // Restore trades
    if (data.trades && data.trades.length > 0) {
      data.trades.forEach(trade => {
        try {
          prepare(`
            INSERT INTO trades (id, user1_id, user2_id, user1_card_id, user1_card_name, user1_card_image, user2_card_id, user2_card_name, user2_card_image, status, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            trade.id, trade.user1_id, trade.user2_id, trade.user1_card_id,
            trade.user1_card_name, trade.user1_card_image, trade.user2_card_id,
            trade.user2_card_name, trade.user2_card_image, trade.status,
            trade.created_at, trade.completed_at
          );
        } catch (e) {
          console.log('Skip trade:', e.message);
        }
      });
    }

    // Restore notifications
    if (data.notifications && data.notifications.length > 0) {
      data.notifications.forEach(notif => {
        try {
          prepare(`
            INSERT INTO notifications (id, user_id, message, match_id, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            notif.id, notif.user_id, notif.message, notif.match_id,
            notif.is_read, notif.created_at
          );
        } catch (e) {
          console.log('Skip notification:', e.message);
        }
      });
    }

    res.json({ success: true, message: 'Data restored successfully' });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore data: ' + err.message });
  }
});

// Clear all data (keep users)
router.post('/clear', authenticateToken, (req, res) => {
  try {
    prepare('DELETE FROM notifications').run();
    prepare('DELETE FROM trades').run();
    prepare('DELETE FROM matches').run();
    prepare('DELETE FROM user_cards').run();

    res.json({ success: true });
  } catch (err) {
    console.error('Clear error:', err);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

module.exports = router;