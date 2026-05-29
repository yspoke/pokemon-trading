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
const tcgpCardsRoutes = require('./routes/tcgp-cards');
const tradesRoutes = require('./routes/trades');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

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
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

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