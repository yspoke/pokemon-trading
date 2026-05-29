// server/routes/tcgp-cards.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const CARDS_URL = 'https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/v4.json';
const EXPANSIONS_URL = 'https://raw.githubusercontent.com/chase-manning/pokemon-tcg-pocket-cards/refs/heads/main/expansions.json';

const CACHE_FILE = path.join(__dirname, '..', '..', 'cards-cache.json');

let cardsData = [];
let expansionsData = [];

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      cardsData = data.cards || [];
      expansionsData = data.expansions || [];
      console.log(`Loaded ${cardsData.length} TCGP cards from cache`);
      return true;
    } catch (err) {
      console.error('Error loading cache:', err);
    }
  }
  return false;
}

async function syncCards() {
  console.log('Syncing cards from GitHub...');
  
  try {
    const cardsResponse = await fetch(CARDS_URL);
    if (!cardsResponse.ok) {
      throw new Error(`Cards fetch failed: ${cardsResponse.status}`);
    }
    cardsData = await cardsResponse.json();
    console.log(`✓ Fetched ${cardsData.length} cards`);

    const expResponse = await fetch(EXPANSIONS_URL);
    if (expResponse.ok) {
      expansionsData = await expResponse.json();
      console.log(`✓ Fetched ${expansionsData.length} expansions`);
    }

    const cacheData = {
      cards: cardsData,
      expansions: expansionsData,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData));
    console.log('✓ Saved to cache');

    return cardsData.length;
  } catch (err) {
    console.error('Sync failed:', err.message);
    throw err;
  }
}

async function initialize() {
  if (!loadCache()) {
    try {
      await syncCards();
    } catch (err) {
      console.error('Initial sync failed:', err.message);
    }
  } else {
    // Check if cache is older than 24 hours
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const lastUpdated = new Date(data.lastUpdated);
      const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate > 24) {
        console.log('Cache is older than 24 hours, syncing...');
        syncCards().catch(err => console.error('Auto-sync failed:', err.message));
      }
    } catch (err) {
      // Ignore errors, just use cache
    }
  }
}

initialize();

// Auto-sync every 24 hours
setInterval(() => {
  console.log('Running scheduled card sync...');
  syncCards().catch(err => console.error('Scheduled sync failed:', err.message));
}, 24 * 60 * 60 * 1000);

// Search cards with expansion AND rarity filters
router.get('/search', authenticateToken, (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  const expansion = req.query.expansion || '';
  const rarity = req.query.rarity || '';
  
  let results = cardsData;

  // Filter by expansion (exact match on prefix before the dash or exact set code)
  if (expansion) {
    results = results.filter(card => {
      if (!card.id) return false;
      
      // Get the expansion part of the card ID (everything before the dash)
      const cardExpansion = card.id.split('-')[0];
      
      // Exact match on expansion code
      return cardExpansion.toLowerCase() === expansion.toLowerCase();
    });
  }

  // Filter by rarity
  if (rarity) {
    results = results.filter(card => 
      card.rarity === rarity
    );
  }

  // Filter by search query (Pokemon name)
  if (query) {
    results = results.filter(card => 
      card.name?.toLowerCase().includes(query)
    );
  }

  // If no filters, return empty
  if (!query && !expansion && !rarity) {
    return res.json([]);
  }

  res.json(results);
});

// Get all cards for an expansion
router.get('/expansion/:expansionId', authenticateToken, (req, res) => {
  const expansionId = req.params.expansionId.toLowerCase();
  
  const cards = cardsData.filter(card => 
    card.id?.toLowerCase().startsWith(expansionId)
  );
  
  res.json(cards);
});

// Get all expansions
router.get('/expansions', authenticateToken, (req, res) => {
  res.json(expansionsData);
});

// Get single card by ID
router.get('/card/:id', authenticateToken, (req, res) => {
  const card = cardsData.find(c => c.id === req.params.id);
  
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  res.json(card);
});

// Sync cards (manual trigger)
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const count = await syncCards();
    res.json({ success: true, message: `Synced ${count} cards` });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

// Get status
router.get('/status', authenticateToken, (req, res) => {
  let lastUpdated = null;
  
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      lastUpdated = data.lastUpdated;
    } catch (err) {}
  }
  
  res.json({
    totalCards: cardsData.length,
    totalExpansions: expansionsData.length,
    lastUpdated
  });
});

module.exports = router;