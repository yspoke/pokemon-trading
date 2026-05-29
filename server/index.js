// server/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, prepare } = require('./database');

const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const usersRoutes = require('./routes/users');
const matchesRoutes = require('./routes/matches');
const tcgpCardsRoutes = require('./routes/tcgp-cards');
const tradesRoutes = require('./routes/trades');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// JSONBin auto-backup configuration
const JSONBIN_API_KEY = '$2a$10$y1TeX1lKr4IzigYvN4nZx.1re9SyVGxuwGOinwxwc5Jx2op9NmlSe';
const JSONBIN_BIN_ID = '6a1941e3ddf5aa59f7733105';

let lastBackupHash = '';

async function autoBackup() {
  try {
    const backup = {
      users: prepare('SELECT id, username, password, display_name FROM users').all(),
      userCards: prepare('SELECT * FROM user_cards').all(),
      matches: prepare('SELECT * FROM matches').all(),
      trades: prepare('SELECT * FROM trades').all(),
      notifications: prepare('SELECT * FROM notifications').all()
    };
    
    // Simple hash to check if data changed
    const hash = JSON.stringify(backup).length + '-' + backup.userCards.length + '-' + backup.matches.length + '-' + backup.trades.length;
    
    if (hash === lastBackupHash) {
      console.log('No changes, skipping backup');
      return;
    }
    
    backup.savedAt = new Date().toISOString();
    
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY
      },
      body: JSON.stringify(backup)
    });
    
    if (res.ok) {
      lastBackupHash = hash;
      console.log('✓ Auto-backup saved to JSONBin');
    } else {
      console.error('Backup failed:', await res.text());
    }
  } catch (err) {
    console.error('Auto-backup error:', err.message);
  }
}

async function restoreFromJsonBin() {
  try {
    console.log('Checking JSONBin for backup...');
    
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY
      }
    });
    
    if (!res.ok) {
      console.log('No backup found or error fetching');
      return false;
    }
    
    const data = await res.json();
    const backup = data.record;
    
    if (!backup || !backup.users || backup.users.length === 0) {
      console.log('Backup is empty');
      return false;
    }
    
    console.log('Found backup from:', backup.savedAt);
    
    // Check if local DB is empty
    const localCards = prepare('SELECT COUNT(*) as count FROM user_cards').get();
    
    // Only restore if local is empty but backup has data
    if (localCards.count === 0 && backup.userCards && backup.userCards.length > 0) {
      console.log('Local DB is empty, restoring from backup...');
      
      // Restore users
      backup.users.forEach(user => {
        try {
          const exists = prepare('SELECT id FROM users WHERE username = ?').get(user.username);
          if (!exists) {
            prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)')
              .run(user.id, user.username, user.password, user.display_name);
          }
        } catch (e) {}
      });
      
      // Restore cards
      backup.userCards.forEach(card => {
        try {
          prepare(`INSERT INTO user_cards (id, user_id, card_id, card_name, card_image, card_set, card_rarity, status, quantity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(card.id, card.user_id, card.card_id, card.card_name, card.card_image,
              card.card_set || '', card.card_rarity || '', card.status, card.quantity || 1, card.created_at);
        } catch (e) {}
      });
      
      // Restore matches
      if (backup.matches) {
        backup.matches.forEach(match => {
          try {
            prepare(`INSERT INTO matches (id, user1_id, user2_id, user1_card_id, user2_card_id, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .run(match.id, match.user1_id, match.user2_id, match.user1_card_id, match.user2_card_id, match.status, match.created_at);
          } catch (e) {}
        });
      }
      
      // Restore trades
      if (backup.trades) {
        backup.trades.forEach(trade => {
          try {
            prepare(`INSERT INTO trades (id, user1_id, user2_id, user1_card_id, user1_card_name, user1_card_image, user2_card_id, user2_card_name, user2_card_image, status, created_at, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(trade.id, trade.user1_id, trade.user2_id, trade.user1_card_id, trade.user1_card_name, trade.user1_card_image,
                trade.user2_card_id, trade.user2_card_name, trade.user2_card_image, trade.status, trade.created_at, trade.completed_at);
          } catch (e) {}
        });
      }
      
      console.log('✓ Restored from JSONBin backup!');
      return true;
    } else {
      console.log('Local DB has data, skipping restore');
    }
    
    return false;
  } catch (err) {
    console.error('Restore error:', err.message);
    return false;
  }
}

// CORS for production
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// API routes
app.use('/api/tcgp', tcgpCardsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/admin', adminRoutes);

// Serve index.html for all other routes (except static files)
app.get('*', (req, res) => {
  // Don't redirect if it's a file request (has extension)
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize database then start server
initDatabase().then(async () => {
  // Try to restore from JSONBin if local DB is empty
  await restoreFromJsonBin();
  
  // Start auto-backup every 5 minutes (only if data changed)
  setInterval(autoBackup, 5 * 60 * 1000);
  
  // Also backup after 1 minute on startup
  setTimeout(autoBackup, 60 * 1000);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Auto-backup to JSONBin enabled (every 5 mins)');

    const usersFile = path.join(__dirname, '..', 'users.json');
    if (fs.existsSync(usersFile)) {
      const { users } = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      const usernames = users.map(u => u.username).join(', ');
      console.log(`Predefined users: ${usernames}`);
    }
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});