// public/app.js
var API_URL = '';
var token = localStorage.getItem('token');
var currentUser = null;
var myCardIds = new Set();
var myWantedCardIds = new Set();
var myCards = [];
var myWantedCards = [];
var selectedExpansion = '';
var selectedRarity = '';

// Expansion and rarity data (loaded from API)
var expansions = [];
var rarities = ['◊', '◊◊', '◊◊◊', '◊◊◊◊', '☆', '☆☆', '☆☆☆', '♕'];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  if (token) {
    verifyToken();
  } else {
    showLogin();
  }
  loadFilters();
});

// Load filter options from API
async function loadFilters() {
  var expDiv = document.getElementById('expansion-filters');
  var rarDiv = document.getElementById('rarity-filters');

  // Load expansions from API
  try {
    var res = await fetch(API_URL + '/api/tcgp/expansions', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      expansions = await res.json();
    }
  } catch (err) {
    console.error('Error loading expansions:', err);
  }

  // Render expansion filters
  if (expDiv) {
    var expHtml = '<label class="filter-option"><input type="radio" name="expansion" value="" checked onchange="filterByExpansion(\'\')"><span>All</span></label>';
    expansions.forEach(function(exp) {
      expHtml += '<label class="filter-option"><input type="radio" name="expansion" value="' + exp.id + '" onchange="filterByExpansion(\'' + exp.id + '\')"><span>' + exp.name + '</span></label>';
    });
    expDiv.innerHTML = expHtml;
  }

  // Render rarity filters
  if (rarDiv) {
    var rarHtml = '<label class="filter-option"><input type="radio" name="rarity" value="" checked onchange="filterByRarity(\'\')"><span>All</span></label>';
    rarities.forEach(function(r) {
      var encodedRarity = encodeURIComponent(r);
      rarHtml += '<label class="filter-option"><input type="radio" name="rarity" value="' + encodedRarity + '" onchange="filterByRarity(\'' + encodedRarity + '\')"><span>' + r + '</span></label>';
    });
    rarDiv.innerHTML = rarHtml;
  }
}

// Show login screen
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

// Show app screen
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  loadMyCards();
  loadFilters();
}

// Verify token
async function verifyToken() {
  try {
    var res = await fetch(API_URL + '/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      var data = await res.json();
      currentUser = data.user;
      var displayEl = document.getElementById('user-display');
      if (displayEl) displayEl.textContent = currentUser.displayName;
      showApp();
    } else {
      localStorage.removeItem('token');
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

// Login
async function login() {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;
  var errorDiv = document.getElementById('login-error');

  if (!username || !password) {
    errorDiv.textContent = 'Please enter username and password';
    return;
  }

  try {
    var res = await fetch(API_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });

    var data = await res.json();

    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      var displayEl = document.getElementById('user-display');
      if (displayEl) displayEl.textContent = currentUser.displayName;
      if (errorDiv) errorDiv.textContent = '';
      showApp();
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    console.log('Login error:', err);
    errorDiv.textContent = 'Connection error';
  }
}

// Logout
function logout() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  showLogin();
}

// Show tab (matches the HTML onclick)
function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(function(tab) {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.nav-tabs button').forEach(function(btn) {
    btn.classList.remove('active');
  });

  // Show selected tab
  var tabElement = document.getElementById(tabName + '-tab');
  if (tabElement) {
    tabElement.classList.add('active');
  }

  // Highlight the clicked button
  event.target.classList.add('active');

  // Load data for the tab
  if (tabName === 'my-cards') {
    loadMyCards();
  } else if (tabName === 'friends') {
    loadFriendsCards();
  } else if (tabName === 'matches') {
    loadMatches();
    loadPossibleTrades();
    loadPendingTrades();
  }
}

// Escape quotes for onclick handlers
function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Load my cards
async function loadMyCards() {
  try {
    var res = await fetch(API_URL + '/api/cards/my-cards', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var data = await res.json();

    myCards = data.available || [];
    myWantedCards = data.wanted || [];

    myCardIds = new Set(myCards.map(function(c) { return c.card_id; }));
    myWantedCardIds = new Set(myWantedCards.map(function(c) { return c.card_id; }));

    displayMyCards();
    displayMyWantedCards();
  } catch (err) {
    console.error('Error loading my cards:', err);
  }
}

// Display my cards (cards I have)
function displayMyCards() {
  var container = document.getElementById('my-cards-list');
  if (!container) return;

  if (myCards.length === 0) {
    container.innerHTML = '<p class="empty-message">No cards yet. Search and add cards you have!</p>';
    return;
  }

  var html = '<div class="card-grid">';
  myCards.forEach(function(card) {
    html += '<div class="card-item">';
    html += '<img src="' + card.card_image + '" alt="' + escapeQuotes(card.card_name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
    html += '<h3>' + card.card_name + '</h3>';
    html += '<p class="card-rarity">' + (card.card_rarity || '') + '</p>';
    html += '<p class="card-set">' + (card.card_set || '') + '</p>';
    html += '<p class="card-quantity">Qty: ' + (card.quantity || 1) + '</p>';
    html += '<div class="quantity-controls">';
    html += '<button class="btn-qty" onclick="updateQuantity(\'' + card.card_id + '\', \'available\', ' + ((card.quantity || 1) - 1) + ')">−</button>';
    html += '<span>' + (card.quantity || 1) + '</span>';
    html += '<button class="btn-qty" onclick="updateQuantity(\'' + card.card_id + '\', \'available\', ' + ((card.quantity || 1) + 1) + ')">+</button>';
    html += '</div>';
    html += '<button class="btn-remove" onclick="removeCard(' + card.id + ')">Remove</button>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// Display my wanted cards
function displayMyWantedCards() {
  var container = document.getElementById('my-wanted-list');
  if (!container) return;

  if (myWantedCards.length === 0) {
    container.innerHTML = '<p class="empty-message">No wanted cards yet. Browse friends\' cards or search to add wants!</p>';
    return;
  }

  var html = '<div class="card-grid">';
  myWantedCards.forEach(function(card) {
    html += '<div class="card-item card-wanted">';
    html += '<img src="' + card.card_image + '" alt="' + escapeQuotes(card.card_name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
    html += '<h3>' + card.card_name + '</h3>';
    html += '<p class="card-rarity">' + (card.card_rarity || '') + '</p>';
    html += '<p class="card-quantity">Qty: ' + (card.quantity || 1) + '</p>';
    html += '<div class="quantity-controls">';
    html += '<button class="btn-qty" onclick="updateQuantity(\'' + card.card_id + '\', \'wanted\', ' + ((card.quantity || 1) - 1) + ')">−</button>';
    html += '<span>' + (card.quantity || 1) + '</span>';
    html += '<button class="btn-qty" onclick="updateQuantity(\'' + card.card_id + '\', \'wanted\', ' + ((card.quantity || 1) + 1) + ')">+</button>';
    html += '</div>';
    html += '<button class="btn-remove" onclick="removeWantedCard(\'' + card.card_id + '\')">Remove</button>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// Update card quantity
async function updateQuantity(cardId, status, newQuantity) {
  try {
    var res = await fetch(API_URL + '/api/cards/update-quantity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        status: status,
        quantity: newQuantity
      })
    });

    if (res.ok) {
      // Reload all relevant tabs
      loadMyCards();
      loadFriendsCards();
      loadMatches();
      loadPossibleTrades();
      loadPendingTrades();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to update quantity');
    }
  } catch (err) {
    alert('Error updating quantity');
  }
}

// Filter by expansion
function filterByExpansion(expansion) {
  selectedExpansion = expansion;
  if (expansion || selectedRarity || document.getElementById('card-search').value.trim()) {
    searchCards();
  }
}

// Filter by rarity
function filterByRarity(rarity) {
  selectedRarity = decodeURIComponent(rarity);
  if (selectedRarity || selectedExpansion || document.getElementById('card-search').value.trim()) {
    searchCards();
  }
}

// Search cards
async function searchCards() {
  var query = document.getElementById('card-search').value.trim();
  var resultsDiv = document.getElementById('search-results');

  if (!query && !selectedExpansion && !selectedRarity) {
    resultsDiv.innerHTML = '<p class="empty-message">Enter a search term or select a filter.</p>';
    return;
  }

  resultsDiv.innerHTML = '<div class="loading"></div>';

  try {
    var url = API_URL + '/api/tcgp/search?';
    var params = [];
    if (query) params.push('q=' + encodeURIComponent(query));
    if (selectedExpansion) params.push('expansion=' + encodeURIComponent(selectedExpansion));
    if (selectedRarity) params.push('rarity=' + encodeURIComponent(selectedRarity));
    url += params.join('&');

    var res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var cards = await res.json();

    displaySearchResults(cards);
  } catch (err) {
    console.error('Search error:', err);
    resultsDiv.innerHTML = '<p class="error">Error searching cards</p>';
  }
}

// Display search results
function displaySearchResults(cards) {
  var resultsDiv = document.getElementById('search-results');

  if (!cards || cards.length === 0) {
    resultsDiv.innerHTML = '<p class="empty-message">No cards found.</p>';
    return;
  }

  var html = '<p class="results-count">Found ' + cards.length + ' cards</p>';
  html += '<div class="card-grid">';

  cards.forEach(function(card) {
    var isOwned = myCardIds.has(card.id);
    var isWanted = myWantedCardIds.has(card.id);
    var cardClass = 'card-item';
    if (isOwned) cardClass += ' card-owned';
    if (isWanted) cardClass += ' card-wanted';

    html += '<div class="' + cardClass + '">';
    html += '<img src="' + card.image + '" alt="' + escapeQuotes(card.name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
    html += '<h3>' + card.name + '</h3>';
    html += '<p class="card-rarity">' + (card.rarity || '') + '</p>';
    html += '<p class="card-set">' + (card.pack || card.expansion || '') + '</p>';
    html += '<div class="card-actions-double">';

    // I Have This button
    if (isOwned) {
      html += '<button class="btn-owned" onclick="addCard(\'' + card.id + '\', \'' + escapeQuotes(card.name) + '\', \'' + card.image + '\', \'' + escapeQuotes(card.pack || card.expansion || '') + '\', \'' + escapeQuotes(card.rarity || '') + '\')">✓ Have (+1)</button>';
    } else {
      html += '<button class="btn-have" onclick="addCard(\'' + card.id + '\', \'' + escapeQuotes(card.name) + '\', \'' + card.image + '\', \'' + escapeQuotes(card.pack || card.expansion || '') + '\', \'' + escapeQuotes(card.rarity || '') + '\')">📦 I Have This</button>';
    }

    // I Want This button
    if (isWanted) {
      html += '<button class="btn-wanted-active" onclick="addWantedCard(\'' + card.id + '\', \'' + escapeQuotes(card.name) + '\', \'' + card.image + '\', \'' + escapeQuotes(card.pack || card.expansion || '') + '\', \'' + escapeQuotes(card.rarity || '') + '\')">❤️ Want (+1)</button>';
    } else {
      html += '<button class="btn-want-search" onclick="addWantedCard(\'' + card.id + '\', \'' + escapeQuotes(card.name) + '\', \'' + card.image + '\', \'' + escapeQuotes(card.pack || card.expansion || '') + '\', \'' + escapeQuotes(card.rarity || '') + '\')">♡ I Want This</button>';
    }

    html += '</div></div>';
  });

  html += '</div>';
  resultsDiv.innerHTML = html;
}

// Add card I have
async function addCard(cardId, cardName, cardImage, cardSet, cardRarity) {
  try {
    var res = await fetch(API_URL + '/api/cards/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        cardName: cardName,
        cardImage: cardImage,
        cardSet: cardSet,
        cardRarity: cardRarity,
        status: 'available',
        quantity: 1
      })
    });

    if (res.ok) {
      myCardIds.add(cardId);
      loadMyCards();
      searchCards();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to add card');
    }
  } catch (err) {
    alert('Error adding card');
  }
}

// Add wanted card
async function addWantedCard(cardId, cardName, cardImage, cardSet, cardRarity) {
  try {
    var res = await fetch(API_URL + '/api/cards/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        cardName: cardName,
        cardImage: cardImage,
        cardSet: cardSet,
        cardRarity: cardRarity,
        status: 'wanted',
        quantity: 1
      })
    });

    if (res.ok) {
      myWantedCardIds.add(cardId);
      loadMyCards();
      searchCards();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to add card');
    }
  } catch (err) {
    alert('Error adding card');
  }
}

// Remove card
async function removeCard(cardId) {
  if (!confirm('Remove this card?')) return;

  try {
    var res = await fetch(API_URL + '/api/cards/remove/' + cardId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    // Reload all relevant tabs
    loadMyCards();
    loadFriendsCards();
    loadMatches();
    loadPossibleTrades();
    loadPendingTrades();
  } catch (err) {
    console.error('Error removing card:', err);
    loadMyCards();
  }
}

// Remove wanted card
async function removeWantedCard(cardId) {
  if (!confirm('Remove from wanted?')) return;

  try {
    var res = await fetch(API_URL + '/api/cards/remove-wanted/' + cardId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    // Reload all relevant tabs
    loadMyCards();
    loadFriendsCards();
    loadMatches();
    loadPossibleTrades();
    loadPendingTrades();
  } catch (err) {
    console.error('Error removing card:', err);
    loadMyCards();
  }
}

// Load friends' cards
async function loadFriendsCards() {
  var friendsHaveDiv = document.getElementById('friends-cards-list');
  var friendsWantDiv = document.getElementById('friends-wanted-list');

  if (friendsHaveDiv) friendsHaveDiv.innerHTML = '<div class="loading"></div>';
  if (friendsWantDiv) friendsWantDiv.innerHTML = '<div class="loading"></div>';

  try {
    var res = await fetch(API_URL + '/api/users', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var users = await res.json();

    var friendsHaveHtml = '';
    var friendsWantHtml = '';

    for (var i = 0; i < users.length; i++) {
      var user = users[i];

      var cardsRes = await fetch(API_URL + '/api/users/id/' + user.id + '/cards', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var cardsData = await cardsRes.json();

      var availableCards = cardsData.available || [];
      var wantedCards = cardsData.wanted || [];

      // Cards this friend has
      if (availableCards.length > 0) {
        friendsHaveHtml += '<div class="friend-section">';
        friendsHaveHtml += '<div class="friend-header"><h4>' + user.display_name + '</h4><span class="friend-card-count">' + availableCards.length + ' cards</span></div>';
        friendsHaveHtml += '<div class="card-grid">';

        availableCards.forEach(function(card) {
          var buttonHtml = '';

          if (card.isPending) {
            if (card.pendingByMe) {
              buttonHtml = '<button class="btn-pending" disabled>⏳ You want this</button>';
              buttonHtml += '<button class="btn-cancel-want" onclick="cancelWant(\'' + card.card_id + '\', ' + user.id + ')">Cancel</button>';
            } else {
              buttonHtml = '<button class="btn-taken" disabled>🔒 ' + (card.wanterName || 'Someone') + ' wants</button>';
            }
          } else {
            buttonHtml = '<button class="btn-want" onclick="wantCard(\'' + card.card_id + '\', \'' + escapeQuotes(card.card_name) + '\', \'' + card.card_image + '\', \'' + escapeQuotes(card.card_set || '') + '\', ' + user.id + ')">❤️ I Want This</button>';
          }

          friendsHaveHtml += '<div class="card-item' + (card.isPending ? ' card-pending' : '') + '">';
          friendsHaveHtml += '<img src="' + card.card_image + '" alt="' + escapeQuotes(card.card_name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
          friendsHaveHtml += '<h3>' + card.card_name + '</h3>';
          friendsHaveHtml += '<p class="card-rarity">' + (card.card_rarity || '') + '</p>';
          friendsHaveHtml += '<p class="card-quantity">Qty: ' + (card.quantity || 1) + '</p>';
          friendsHaveHtml += '<div class="card-actions">' + buttonHtml + '</div>';
          friendsHaveHtml += '</div>';
        });

        friendsHaveHtml += '</div></div>';
      }

      // Cards this friend wants
      if (wantedCards.length > 0) {
        friendsWantHtml += '<div class="friend-section">';
        friendsWantHtml += '<div class="friend-header"><h4>' + user.display_name + '</h4><span class="friend-card-count">' + wantedCards.length + ' wanted</span></div>';
        friendsWantHtml += '<div class="card-grid">';

        wantedCards.forEach(function(card) {
          var iHaveIt = myCardIds.has(card.card_id);
          var buttonHtml = '';

          // Always show the same nice button - backend handles adding to collection if needed
          buttonHtml = '<button class="btn-have-it" onclick="iHaveThis(\'' + card.card_id + '\', \'' + escapeQuotes(card.card_name) + '\', \'' + card.card_image + '\', \'' + escapeQuotes(card.card_set || '') + '\', \'' + escapeQuotes(card.card_rarity || '') + '\', ' + user.id + ')">' + (iHaveIt ? '🎁' : '📦') + ' I Have This!</button>';

          friendsWantHtml += '<div class="card-item card-can-help">';
          friendsWantHtml += '<img src="' + card.card_image + '" alt="' + escapeQuotes(card.card_name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
          friendsWantHtml += '<h3>' + card.card_name + '</h3>';
          friendsWantHtml += '<p class="card-rarity">' + (card.card_rarity || '') + '</p>';
          friendsWantHtml += '<p class="card-quantity">Qty: ' + (card.quantity || 1) + '</p>';
          friendsWantHtml += '<div class="card-actions">' + buttonHtml + '</div>';
          friendsWantHtml += '</div>';
        });

        friendsWantHtml += '</div></div>';
      }
    }

    if (friendsHaveDiv) {
      friendsHaveDiv.innerHTML = friendsHaveHtml || '<p class="empty-message">No friends have cards yet.</p>';
    }
    if (friendsWantDiv) {
      friendsWantDiv.innerHTML = friendsWantHtml || '<p class="empty-message">No friends want cards yet.</p>';
    }

  } catch (err) {
    console.error('Error loading friends cards:', err);
    if (friendsHaveDiv) friendsHaveDiv.innerHTML = '<p class="error">Error loading friends\' cards</p>';
    if (friendsWantDiv) friendsWantDiv.innerHTML = '<p class="error">Error loading friends\' cards</p>';
  }
}

// Want a card from a friend
async function wantCard(cardId, cardName, cardImage, cardSet, friendId) {
  try {
    var res = await fetch(API_URL + '/api/cards/want', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        cardName: cardName,
        cardImage: cardImage,
        cardSet: cardSet,
        friendId: friendId
      })
    });

    if (res.ok) {
      loadFriendsCards();
      loadMatches();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to request card');
    }
  } catch (err) {
    alert('Error requesting card');
  }
}

// Cancel a want request
async function cancelWant(cardId, friendId) {
  if (!confirm('Cancel this want request?')) return;

  try {
    var res = await fetch(API_URL + '/api/matches/cancel-want', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        friendId: friendId
      })
    });

    // Reload all relevant tabs
    loadMyCards();
    loadFriendsCards();
    loadMatches();
    loadPossibleTrades();
    loadPendingTrades();
  } catch (err) {
    console.error('Error cancelling want:', err);
    loadFriendsCards();
  }
}
// I have a card that a friend wants
async function iHaveThis(cardId, cardName, cardImage, cardSet, cardRarity, friendId) {
  try {
    var res = await fetch(API_URL + '/api/cards/i-have', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        cardId: cardId,
        cardName: cardName,
        cardImage: cardImage,
        cardSet: cardSet,
        cardRarity: cardRarity,
        friendId: friendId
      })
    });

    if (res.ok) {
      loadFriendsCards();
      loadMatches();
      loadMyCards();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to notify friend');
    }
  } catch (err) {
    alert('Error notifying friend');
  }
}

// Load matches
async function loadMatches() {
  var matchesDiv = document.getElementById('matches-list');
  if (!matchesDiv) return;

  try {
    var res = await fetch(API_URL + '/api/matches', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var matches = await res.json();

    if (!matches || matches.length === 0) {
      matchesDiv.innerHTML = '<p class="empty-message">No matches yet.</p>';
      return;
    }

    var html = '<div class="card-grid">';
    matches.forEach(function(match) {
      var cardName = match.card_name || 'Unknown Card';
      var cardImage = match.card_image || '';

      html += '<div class="card-item">';
      if (cardImage) {
        html += '<img src="' + cardImage + '" alt="' + escapeQuotes(cardName) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
      }
      html += '<h3>' + cardName + '</h3>';
      html += '<p class="match-type ' + (match.i_want_it ? 'want' : 'have') + '">';
      if (match.i_want_it) {
        html += 'You want from ' + match.other_user_name;
      } else {
        html += match.other_user_name + ' wants this';
      }
      html += '</p>';
      html += '</div>';
    });
    html += '</div>';

    matchesDiv.innerHTML = html;

    // Update badge
    var badge = document.getElementById('match-count');
    if (badge) {
      if (matches.length > 0) {
        badge.textContent = matches.length;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading matches:', err);
    matchesDiv.innerHTML = '<p class="error">Error loading matches</p>';
  }
}

// Load possible trades
async function loadPossibleTrades() {
  var tradesDiv = document.getElementById('possible-trades-list');
  if (!tradesDiv) return;

  try {
    var res = await fetch(API_URL + '/api/trades/possible', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var trades = await res.json();

    if (!trades || trades.length === 0) {
      tradesDiv.innerHTML = '<p class="empty-message">No possible trades. Both you and a friend need to want each other\'s cards with matching rarity.</p>';
      return;
    }

    var html = '<div class="trades-grid">';
    trades.forEach(function(trade) {
      html += '<div class="trade-card">';

      html += '<div class="trade-side">';
      html += '<span class="trade-label">You give:</span>';
      html += '<img src="' + trade.myCard.image + '" alt="' + escapeQuotes(trade.myCard.name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
      html += '<p class="trade-card-name">' + trade.myCard.name + '</p>';
      html += '<p class="trade-card-rarity">' + (trade.myCard.rarity || '') + '</p>';
      html += '</div>';

      html += '<div class="trade-arrow">⇄</div>';

      html += '<div class="trade-side">';
      html += '<span class="trade-label">You get:</span>';
      html += '<img src="' + trade.theirCard.image + '" alt="' + escapeQuotes(trade.theirCard.name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
      html += '<p class="trade-card-name">' + trade.theirCard.name + '</p>';
      html += '<p class="trade-card-rarity">' + (trade.theirCard.rarity || '') + '</p>';
      html += '<p class="trade-owner">from ' + trade.theirCard.ownerName + '</p>';
      html += '</div>';

      html += '<button class="btn-propose" onclick="proposeTrade(\'' + trade.myCard.id + '\', \'' + trade.theirCard.id + '\', ' + trade.theirCard.ownerId + ')">Propose Trade</button>';
      html += '</div>';
    });
    html += '</div>';

    tradesDiv.innerHTML = html;
  } catch (err) {
    console.error('Error loading possible trades:', err);
    tradesDiv.innerHTML = '<p class="error">Error loading trades</p>';
  }
}

// Load pending trades
async function loadPendingTrades() {
  var pendingDiv = document.getElementById('pending-trades-list');
  if (!pendingDiv) return;

  try {
    var res = await fetch(API_URL + '/api/trades/pending', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var trades = await res.json();

    if (!trades || trades.length === 0) {
      pendingDiv.innerHTML = '<p class="empty-message">No pending trades.</p>';
      return;
    }

    var html = '<div class="trades-grid">';
    trades.forEach(function(trade) {
      html += '<div class="trade-card">';

      html += '<div class="trade-side">';
      html += '<span class="trade-label">You give:</span>';
      if (trade.myCard.image) {
        html += '<img src="' + trade.myCard.image + '" alt="' + escapeQuotes(trade.myCard.name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
      }
      html += '<p class="trade-card-name">' + trade.myCard.name + '</p>';
      html += '</div>';

      html += '<div class="trade-arrow">⇄</div>';

      html += '<div class="trade-side">';
      html += '<span class="trade-label">You get:</span>';
      if (trade.theirCard.image) {
        html += '<img src="' + trade.theirCard.image + '" alt="' + escapeQuotes(trade.theirCard.name) + '" onerror="this.src=\'https://placehold.co/200x280?text=No+Image\'">';
      }
      html += '<p class="trade-card-name">' + trade.theirCard.name + '</p>';
      html += '<p class="trade-owner">from ' + trade.otherUserName + '</p>';
      html += '</div>';

      html += '<div class="trade-actions-bottom">';
      html += '<button class="btn-complete" onclick="completeTrade(' + trade.id + ')">✓ Complete</button>';
      html += '<button class="btn-cancel" onclick="cancelTrade(' + trade.id + ')">✕ Cancel</button>';
      html += '</div>';

      html += '</div>';
    });
    html += '</div>';

    pendingDiv.innerHTML = html;
  } catch (err) {
    console.error('Error loading pending trades:', err);
    pendingDiv.innerHTML = '<p class="error">Error loading pending trades</p>';
  }
}

// Propose a trade
async function proposeTrade(myCardId, theirCardId, theirUserId) {
  try {
    var res = await fetch(API_URL + '/api/trades/propose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        myCardId: myCardId,
        theirCardId: theirCardId,
        theirUserId: theirUserId
      })
    });

    var data = await res.json();

    if (res.ok) {
      alert('Trade proposed!');
      loadPossibleTrades();
      loadPendingTrades();
    } else {
      alert(data.error || 'Failed to propose trade');
    }
  } catch (err) {
    alert('Error proposing trade');
  }
}

// Complete a trade
async function completeTrade(tradeId) {
  if (!confirm('Complete this trade? Cards will be removed from inventories.')) return;

  try {
    var res = await fetch(API_URL + '/api/trades/' + tradeId + '/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.ok) {
      alert('Trade completed!');
      loadMyCards();
      loadMatches();
      loadPossibleTrades();
      loadPendingTrades();
      loadFriendsCards();
    } else {
      var data = await res.json();
      alert(data.error || 'Failed to complete trade');
    }
  } catch (err) {
    alert('Error completing trade');
  }
}

// Cancel a trade
async function cancelTrade(tradeId) {
  if (!confirm('Cancel this trade?')) return;

  try {
    var res = await fetch(API_URL + '/api/trades/' + tradeId + '/cancel', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.ok) {
      // Reload all relevant sections
      loadPossibleTrades();
      loadPendingTrades();
      loadMatches();
    }
  } catch (err) {
    console.error('Error cancelling trade:', err);
  }
}