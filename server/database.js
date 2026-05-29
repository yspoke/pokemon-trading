// server/database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'trading.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      card_image TEXT NOT NULL,
      card_set TEXT,
      card_rarity TEXT,
      status TEXT DEFAULT 'available',
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      user1_card_id TEXT NOT NULL,
      user2_card_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      user1_card_id TEXT NOT NULL,
      user1_card_name TEXT,
      user1_card_image TEXT,
      user2_card_id TEXT NOT NULL,
      user2_card_name TEXT,
      user2_card_image TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user1_id) REFERENCES users(id),
      FOREIGN KEY (user2_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      match_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Load predefined users
  const usersFile = path.join(__dirname, '..', 'users.json');
  if (fs.existsSync(usersFile)) {
    const fileContent = fs.readFileSync(usersFile, 'utf8');
    const { users } = JSON.parse(fileContent);
    
    console.log('Loading users from users.json...');
    
    users.forEach(user => {
      try {
        db.run(
          `INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)`,
          [user.username.toLowerCase(), user.password, user.displayName]
        );
        console.log('Created user:', user.username);
      } catch (e) {
        console.log('User already exists or error:', user.username, e.message);
      }
    });
  } else {
    console.log('users.json not found!');
  }

  saveDatabase();
  
  // Verify users were created
  const stmt = db.prepare('SELECT id, username, display_name FROM users');
  const allUsers = [];
  while (stmt.step()) {
    allUsers.push(stmt.getAsObject());
  }
  stmt.free();
  console.log('Users in database:', allUsers);
  
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function prepare(sql) {
  return {
    run: (...params) => {
      db.run(sql, params);
      saveDatabase();
      const lastId = db.exec("SELECT last_insert_rowid()");
      return { 
        lastInsertRowid: lastId[0]?.values[0]?.[0], 
        changes: db.getRowsModified() 
      };
    },
    get: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
  };
}

module.exports = { initDatabase, prepare, saveDatabase };