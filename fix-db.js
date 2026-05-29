// fix-db.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'trading.db');

async function fixDatabase() {
  const SQL = await initSqlJs();
  
  let db;
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  console.log('\n=== CLEANING DATABASE ===\n');

  // Clear old data
  db.exec("DELETE FROM user_cards");
  db.exec("DELETE FROM matches");
  db.exec("DELETE FROM notifications");
  
  // Clear trades table if it exists
  try {
    db.exec("DELETE FROM trades");
    console.log('Cleared trades');
  } catch (e) {
    // Table might not exist yet
  }

  console.log('Cleared user_cards, matches, notifications');

  // Add card_rarity column if it doesn't exist
  try {
    db.exec("ALTER TABLE user_cards ADD COLUMN card_rarity TEXT");
    console.log('Added card_rarity column');
  } catch (e) {
    console.log('card_rarity column already exists');
  }

  // Create trades table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      user1_card_id TEXT NOT NULL,
      user2_card_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    )
  `);
  console.log('Trades table ready');

  // Show current users
  console.log('\n=== CURRENT USERS ===');
  const users = db.exec('SELECT id, username, display_name FROM users');
  if (users.length > 0) {
    users[0].values.forEach(row => {
      console.log('  ID: ' + row[0] + ', Username: ' + row[1] + ', Display: ' + row[2]);
    });
  }

  // Save the database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);

  console.log('\nDatabase cleaned and saved!');
  console.log('\nNext steps:');
  console.log('1. Run: npm start');
  console.log('2. Logout and login again');
  console.log('3. Add cards to test trading');
  
  db.close();
}

fixDatabase().catch(console.error);