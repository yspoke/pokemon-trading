// public/app.js

const API_URL = '';
let token = localStorage.getItem('token');
let currentUser = null;
let selectedExpansion = '';
let selectedRarity = '';
let myCardIds = new Set();

// Check if logged in on page load
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    verifyToken();
  }
  
  document.getElementById('search-btn').addEventListener('click', searchCards);
  document.getElementById('card-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchCards();
  });
});

// Login
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      showApp();
    } else {
      errorEl.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorEl.textContent = 'Connection error. Please try again.';
  }
}

// Verify token
async function verifyToken() {
  try {
    const res = await fetch(`${API_URL}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showApp();
    } else {
      logout();
    }
  } catch (err) {
    logout();
  }
}

// Logout
function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app-page').style.display = 'none';
}

// Show main app
function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-page').style.display = 'block';
  document.getElementById('display-name').textContent = currentUser.displayName;
  
  loadExpansions();
  loadMyCards();
  loadMatchCount();
}

// Tab navigation
function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  document.querySelectorAll('.nav-tabs button').forEach(btn => {
    btn.classList.remove('active');
  });

  document.getElementById(`${tabName}-tab`).classList.add('active');
  event.target.classList.add('active');

  switch (tabName) {
    case 'my-cards':
      loadMyCards();
      break;
    case 'friends-cards':
      loadFriendsCards();
      break;
    case 'matches':
      loadMatches();
      break;
  }
}

// Helper function to escape quotes
function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Load expansions
async function loadExpansions() {
  try {
    const res = await fetch(`${API_URL}/api/tcgp/expansions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const expansions = await res.json();
    const expansionList = document.getElementById('expansion-list');

    let html = `
      <label class="filter-option">
        <input type="radio" name="expansion" value="" checked onchange="onFilterChange()">
        <span>All Expansions</span>
      </label>
    `;

    if (expansions && expansions.length > 0) {
      expansions.forEach(exp => {
        html += `
          <label class="filter-option">
            <input type="radio" name="expansion" value="${exp.id}" onchange="onFilterChange()">
            <span>${exp.name}</span>
          </label>
        `;
      });
    }

    expansionList.innerHTML = html;
  } catch (err) {
    console.error('Error loading expansions:', err);
  }
}

// Handle filter change (expansion or rarity)
function onFilterChange() {
  const expansionEl = document.querySelector('input[name="expansion"]:checked');
  const rarityEl = document.querySelector('input[name="rarity"]:checked');
  
  selectedExpansion = expansionEl ? expansionEl.value : '';
  selectedRarity = rarityEl ? rarityEl.value : '';
  
  // If any filter is selected, load cards
  if (selectedExpansion || selectedRarity) {
    loadFilteredCards();
  } else {
    hideSearchResults();
  }
}

// Load cards with filters
async function loadFilteredCards() {
  showSearchResults();
  document.getElementById('search-results').innerHTML = '<div class="loading"></div>';

  try {
    let url = `${API_URL}/api/tcgp/search?`;
    const query = document.getElementById('card-search').value.trim();
    
    if (query) url += `q=${encodeURIComponent(query)}&`;
    if (selectedExpansion) url += `expansion=${encodeURIComponent(selectedExpansion)}&`;
    if (selectedRarity) url += `rarity=${encodeURIComponent(selectedRarity)}`;
      
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const cards = await res.json();
    displaySearchCards(cards);
  } catch (err) {
    console.error('Error loading cards:', err);
    document.getElementById('search-results').innerHTML = '<p class="error">Error loading cards.</p>';
  }
}

// Hide search results
function hideSearchResults() {
  document.getElementById('search-results-section').style.display = 'none';
}

// Show search results section
function showSearchResults() {
  document.getElementById('search-results-section').style.display = 'block';
}

// Search cards
async function searchCards() {
  const query = document.getElementById('card-search').value.trim();
  
  if (!query && !selectedExpansion && !selectedRarity) {
    hideSearchResults();
    return;
  }

  loadFilteredCards();
}

// Display search cards
function displaySearchCards(cards) {
  const resultsDiv = document.getElementById('search-results');

  if (cards && cards.length > 0) {
    resultsDiv.innerHTML = `
      <p class="results-info">Found ${cards.length} cards</p>
      <div class="card-grid">
        ${cards.map(card => {
          const iHaveThis = myCardIds.has(card.id);
          return `
            <div class="card-item ${iHaveThis ? 'card-owned' : ''}">
              <img src="${card.image}" alt="${card.name}" 
                   onerror="this.onerror=null; this.src='https://via.placeholder.com/200x280?text=${encodeURIComponent(card.name)}'">
              <h3>${card.name}</h3>
              <p>${card.id}</p>
              <p class="card-rarity">${card.rarity || ''}</p>
              <div class="card-actions">
                ${iHaveThis 
                  ? `<button class="btn-owned" onclick="removeMyCard('${card.id}')">✅ I Have This</button>`
                  : `<button class="btn-have" onclick="addMyCard('${card.id}', '${escapeQuotes(card.name)}', '${card.image}', '${escapeQuotes(card.pack || '')}')">+ I Have This</button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    resultsDiv.innerHTML = '<div class="empty-state"><span>🔍</span><p>No cards found.</p></div>';
  }
}

// Add card to my collection
async function addMyCard(cardId, cardName, cardImage, cardSet) {
  try {
    const res = await fetch(`${API_URL}/api/cards/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        cardId,
        cardName,
        cardImage,
        cardSet,
        status: 'available'
      })
    });

    if (res.ok) {
      myCardIds.add(cardId);
      loadMyCards();
      loadFilteredCards();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add card');
    }
  } catch (err) {
    alert('Error adding card');
  }
}

// Remove card from my collection
async function removeMyCard(cardId) {
  try {
    const res = await fetch(`${API_URL}/api/cards/my-cards`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const card = data.available.find(c => c.card_id === cardId);
    
    if (card) {
      await fetch(`${API_URL}/api/cards/remove/${card.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      myCardIds.delete(cardId);
      loadMyCards();
      
      // Refresh search if filters are active
      if (selectedExpansion || selectedRarity || document.getElementById('card-search').value.trim()) {
        loadFilteredCards();
      }
    }
  } catch (err) {
    alert('Error removing card');
  }
}

// Load my cards
async function loadMyCards() {
  try {
    const res = await fetch(`${API_URL}/api/cards/my-cards`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    
    myCardIds.clear();
    if (data.available) {
      data.available.forEach(card => myCardIds.add(card.card_id));
    }

    document.getElementById('my-cards-count').textContent = data.available?.length || 0;

    const myCardsDiv = document.getElementById('my-cards-list');
    if (data.available && data.available.length > 0) {
      myCardsDiv.innerHTML = `
        <div class="card-grid">
          ${data.available.map(card => `
            <div class="card-item card-owned">
              <img src="${card.card_image}" alt="${card.card_name}"
                   onerror="this.onerror=null; this.src='https://via.placeholder.com/200x280?text=${encodeURIComponent(card.card_name)}'">
              <h3>${card.card_name}</h3>
              <p>${card.card_id}</p>
              <div class="card-actions">
                <button class="btn-remove" onclick="removeMyCard('${card.card_id}')">Remove</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      myCardsDiv.innerHTML = '<p class="empty-message">No cards yet. Search below to add cards you have!</p>';
    }
  } catch (err) {
    console.error('Error loading my cards:', err);
  }
}

// Load friends cards
async function loadFriendsCards() {
  const friendsDiv = document.getElementById('friends-cards-list');
  friendsDiv.innerHTML = '<div class="loading"></div>';

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const users = await res.json();

    if (!users || users.length === 0) {
      friendsDiv.innerHTML = '<div class="empty-state"><span>👥</span><p>No other users yet.</p></div>';
      return;
    }

    let html = '';
    
    for (const user of users) {
      const cardsUrl = `${API_URL}/api/users/id/${user.id}/cards`;
      const cardsRes = await fetch(cardsUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!cardsRes.ok) {
        console.error(`Failed to fetch cards for user ${user.id}`);
        continue;
      }
      
      const cardsData = await cardsRes.json();
      const cardCount = cardsData.available?.length || 0;
      
      html += `<div class="friend-section">`;
      html += `
        <div class="friend-header">
          <h3>👤 ${user.display_name}</h3>
          <span class="friend-card-count">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
        </div>
      `;
      
      if (cardCount > 0) {
        html += `<div class="card-grid">`;
        for (const card of cardsData.available) {
          let buttonHtml = '';
          
          if (card.isPending) {
            if (card.pendingByMe) {
              buttonHtml = `<button class="btn-pending" disabled>⏳ You want this</button>`;
            } else {
              buttonHtml = `<button class="btn-taken" disabled>🔒 ${card.wanterName} wants this</button>`;
            }
          } else {
            buttonHtml = `
              <button class="btn-want" onclick="wantCard('${card.card_id}', '${escapeQuotes(card.card_name)}', '${card.card_image}', '${escapeQuotes(card.card_set || '')}', ${user.id}, '${escapeQuotes(user.display_name)}')">
                ❤️ I Want This
              </button>
            `;
          }
          
          html += `
            <div class="card-item ${card.isPending ? 'card-pending' : ''}">
              <img src="${card.card_image}" alt="${card.card_name}"
                   onerror="this.onerror=null; this.src='https://via.placeholder.com/200x280?text=Card'">
              <h3>${card.card_name}</h3>
              <p>${card.card_id}</p>
              <div class="card-actions">
                ${buttonHtml}
              </div>
            </div>
          `;
        }
        html += `</div>`;
      } else {
        html += '<p class="empty-message">No cards available for trade yet.</p>';
      }
      
      html += '</div>';
    }
    
    friendsDiv.innerHTML = html;
  } catch (err) {
    console.error('Error loading friends cards:', err);
    friendsDiv.innerHTML = '<p class="error">Error loading friends cards.</p>';
  }
}

// Want a card from a friend
async function wantCard(cardId, cardName, cardImage, cardSet, friendId, friendName) {
  try {
    const res = await fetch(`${API_URL}/api/cards/want`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        cardId,
        cardName,
        cardImage,
        cardSet,
        friendId
      })
    });

    const data = await res.json();

    if (res.ok) {
      alert(`🎉 Match created! You want ${cardName} from ${friendName}. Check the Matches tab!`);
      loadMatchCount();
    } else {
      alert(data.error || 'Failed to create match');
    }
  } catch (err) {
    alert('Error creating match');
  }
}

// Load matches
async function loadMatches() {
  try {
    const res = await fetch(`${API_URL}/api/matches`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const matches = await res.json();
    const matchesDiv = document.getElementById('matches-list');

    if (matches && matches.length > 0) {
      matchesDiv.innerHTML = matches.map(match => `
        <div class="match-item">
          <div class="match-card">
            <img src="${match.card_image}" alt="${match.card_name}"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/100x140?text=${encodeURIComponent(match.card_name)}'">
          </div>
          <div class="match-info">
            <h3>${match.card_name}</h3>
            ${match.i_want_it 
              ? `<p class="match-type want">❤️ You want this card</p>
                 <p>📦 <strong>${match.other_user_name}</strong> has it!</p>`
              : `<p class="match-type have">✅ You have this card</p>
                 <p>❤️ <strong>${match.other_user_name}</strong> wants it!</p>`
            }
            <p class="match-date">Matched: ${new Date(match.created_at).toLocaleDateString()}</p>
          </div>
          <div class="match-actions">
            <button class="btn-complete" onclick="completeMatch(${match.id})">✅ Trade Complete</button>
          </div>
        </div>
      `).join('');
    } else {
      matchesDiv.innerHTML = '<div class="empty-state"><span>🔄</span><p>No matches yet. Check your friends\' cards and mark ones you want!</p></div>';
    }
  } catch (err) {
    console.error('Error loading matches:', err);
  }
}

// Complete a match
async function completeMatch(matchId) {
  if (!confirm('Mark this trade as complete? This will remove the match.')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/matches/${matchId}/complete`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadMatches();
      loadMatchCount();
    }
  } catch (err) {
    alert('Error completing match');
  }
}

// Load match count
async function loadMatchCount() {
  try {
    const res = await fetch(`${API_URL}/api/matches`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const matches = await res.json();
    const badge = document.getElementById('match-count');

    if (matches && matches.length > 0) {
      badge.textContent = matches.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Error loading match count:', err);
  }
}

// Sync cards
async function syncCards() {
  if (!confirm('Sync card database with latest data from GitHub?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/tcgp/sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      alert(data.message);
      loadExpansions();
    } else {
      alert('Sync failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Sync error: ' + err.message);
  }
}