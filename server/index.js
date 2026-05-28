// server/index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const usersRoutes = require('./routes/users');
const matchesRoutes = require('./routes/matches');

const app = express();
const PORT = process.env.PORT || 3000;

const tcgpCardsRoutes = require('./routes/tcgp-cards'); // Add this line near the top

app.use('/api/tcgp', tcgpCardsRoutes); // Add this line with other routes

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/matches', matchesRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize database then start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Read actual users from users.json
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