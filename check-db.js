// check-db.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'trading.db');

async function checkDatabase() {
  const SQL = await initSqlJs();
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('No database found!');
    return;
  }

  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  console.log('\n=== USERS ===');
  const users = db.exec('SELECT * FROM users');
  if (users.length > 0) {
    console.log('Columns:', users[0].columns);
    users[0].values.forEach(row => console.log(row));
  }

  console.log('\n=== USER CARDS ===');
  const cards = db.exec('SELECT * FROM user_cards');
  if (cards.length > 0) {
    console.log('Columns:', cards[0].columns);
    cards[0].values.forEach(row => console.log(row));
  } else {
    console.log('No cards found');
  }

  console.log('\n=== MATCHES ===');
  const matches = db.exec('SELECT * FROM matches');
  if (matches.length > 0) {
    console.log('Columns:', matches[0].columns);
    matches[0].values.forEach(row => console.log(row));
  } else {
    console.log('No matches found');
  }

  console.log('\n=== TRADES ===');
  try {
    const trades = db.exec('SELECT * FROM trades');
    if (trades.length > 0) {
      console.log('Columns:', trades[0].columns);
      trades[0].values.forEach(row => console.log(row));
    } else {
      console.log('No trades found');
    }
  } catch (e) {
    console.log('Trades table does not exist');
  }

  db.close();
}

checkDatabase().catch(console.error);