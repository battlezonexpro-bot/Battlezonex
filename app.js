import * as fb from './services/firebase.js';

// --- UI Components: Toast & Confirmation ---
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'times-circle' : 'exclamation-circle');
  toast.innerHTML = `<i class="fas fa-${icon} toast-icon"></i><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.25s ease';
    setTimeout(() => toast.remove(), 280);
  }, 3500);
}

function askConfirm(title, msg, onYes) {
  safeSet('confirm-title', title, 'innerText');
  safeSet('confirm-msg', msg, 'innerText');
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'block';
  document.getElementById('btn-confirm-yes').onclick = () => {
    modal.style.display = 'none';
    onYes();
  };
}

// --- Utility Helpers ---
const safeSet = (id, val, attr = 'value') => {
  const el = document.getElementById(id);
  if (el) el[attr] = val;
};

const safeGet = (id) => {
  const el = document.getElementById(id);
  return el ? el.value : '';
};

// --- Platform Navigation ---
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.view-section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const view = item.getAttribute('data-view');
    navItems.forEach(i => i.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    if (document.getElementById(view)) document.getElementById(view).classList.add('active');
    if (window.innerWidth <= 1024) closeSidebar();
  });
});

// --- Mobile Nav Toggle ---
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

function openSidebar() {
  if (sidebar) sidebar.classList.add('mobile-active');
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  if (sidebar) sidebar.classList.remove('mobile-active');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}
function toggleSidebar() {
  if (sidebar && sidebar.classList.contains('mobile-active')) closeSidebar();
  else openSidebar();
}

['mobile-toggle'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', toggleSidebar);
});

if (overlay) overlay.addEventListener('click', closeSidebar);

// Wake up backend
fb.pingBackend().then(online => {
  document.querySelectorAll('#backend-status').forEach(el => {
    if (online) {
      el.innerHTML = '<i class="fas fa-check-circle" style="color:var(--green)"></i> Backend Ready';
      el.style.borderColor = 'rgba(0,214,143,0.3)';
    } else {
      el.innerHTML = '<i class="fas fa-times-circle" style="color:var(--red)"></i> Offline';
      el.style.borderColor = 'rgba(255,71,87,0.3)';
    }
  });
});

// --- Real-time Data Sync ---
let globalConfig = null;
let allPlayers = []; 
let globalMatches = [];
let globalDeposits = [];
let globalWithdrawals = [];
let allTransactions = [];

// 1. Dashboard & Players
fb.listenUsers(users => {
  allPlayers = users;
  safeSet('stat-total-users', users.length, 'innerText');
  renderPlayers(users);
});

const userSearch = document.getElementById('user-search-input');
if (userSearch) {
  userSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = !query ? allPlayers : allPlayers.filter(u => 
      (u.name?.toLowerCase().includes(query)) || (u.email?.toLowerCase().includes(query)) ||
      (u.phone?.toLowerCase().includes(query)) || (u.ffUid?.toLowerCase().includes(query)) ||
      (u.inGameName?.toLowerCase().includes(query)) || (u.id?.toLowerCase().includes(query))
    );
    renderPlayers(filtered);
  });
}

// 2. Matches
let currentMatchFilter = 'Upcoming';

fb.listenMatches(matches => {
  globalMatches = matches;
  safeSet('stat-live-matches', matches.filter(m => m.status === 'Ongoing').length, 'innerText');
  updateMatchList();
  updateResultHub();
});

function updateMatchList() {
  const filtered = currentMatchFilter === 'All' 
    ? globalMatches 
    : globalMatches.filter(m => m.status === currentMatchFilter);
  renderTournaments(filtered);
}

const filterBtns = {
  'All': 'btn-filter-all',
  'Upcoming': 'btn-filter-upcoming',
  'Ongoing': 'btn-filter-ongoing',
  'Resulted': 'btn-filter-resulted',
  'Cancelled': 'btn-filter-cancelled'
};

Object.keys(filterBtns).forEach(status => {
  const btn = document.getElementById(filterBtns[status]);
  if (btn) {
    // Set initial active style for Upcoming
    if (status === 'Upcoming') btn.className = 'btn btn-primary btn-sm';
    else btn.className = 'btn btn-outline btn-sm';

    btn.onclick = () => {
      currentMatchFilter = status;
      // Reset all buttons to outline
      Object.values(filterBtns).forEach(id => {
        const b = document.getElementById(id);
        if (b) b.className = 'btn btn-outline btn-sm';
      });
      // Set active button to primary
      btn.className = 'btn btn-primary btn-sm';
      updateMatchList();
    };
  }
});

// 3. Financials
fb.listenDeposits(deps => {
  globalDeposits = deps;
  safeSet('count-deposits', deps.filter(d => d.status === 'Pending').length, 'innerText');
  if(currentFinancialView === 'deposits') renderDeposits(deps);
  updateFullHistory();
});

fb.listenWithdrawals(withs => {
  globalWithdrawals = withs;
  const pendingWith = withs.filter(w => w.status === 'Pending').length;
  safeSet('stat-pending-withdrawals', pendingWith, 'innerText');
  safeSet('count-withdrawals', pendingWith, 'innerText');
  if(currentFinancialView === 'withdrawals') renderWithdrawals(withs);
  updateFullHistory();
});

function updateFullHistory() {
  const unified = [
    ...globalDeposits.map(d => ({ ...d, txType: 'DEPOSIT', ref: d.utrNumber, date: d.timestamp })),
    ...globalWithdrawals.map(w => ({ ...w, txType: 'WITHDRAWAL', ref: w.upiId, date: w.timestamp }))
  ];
  allTransactions = unified.sort((a,b) => b.date - a.date);
  renderFullHistory(allTransactions);
}

// 4. Support
let globalTicketsCache = [];
fb.listenTickets(tickets => {
  globalTicketsCache = tickets;
  renderTickets(tickets);
});

// 5. Config
fb.listenAppConfig(config => {
  if(config) {
    globalConfig = config;
    const ids = ['cfg-version', 'cfg-update-url', 'cfg-upi', 'cfg-support-link', 'cfg-welcome-bonus', 'cfg-referral-bonus', 'cfg-fee-percent', 'cfg-theme', 'cfg-home-bg', 'cfg-winners-bg', 'cfg-help-bg', 'cfg-profile-bg', 'cfg-earn-bg', 'cfg-qr-manual', 'cfg-qr-20', 'cfg-qr-40', 'cfg-qr-100', 'cfg-qr-500', 'cfg-announcement', 'cfg-rules'];
    const keys = ['version', 'updateUrl', 'upiId', 'supportLink', 'welcomeBonusAmount', 'referralBonusAmount', 'playerMatchPlatformFeePercent', 'appTheme', 'homeBackgroundUrl', 'winnersBackgroundUrl', 'helpBackgroundUrl', 'profileBackgroundUrl', 'earnBackgroundUrl', 'manualPaymentQrUrl', 'qr20Url', 'qr40Url', 'qr100Url', 'qr500Url', 'announcementText', 'rulesText'];
    ids.forEach((id, i) => safeSet(id, config[keys[i]] || ''));
    
    safeSet('cfg-maint', String(config.maintenanceMode || false));
    safeSet('cfg-banner-enabled', String(config.isBannerEnabled !== false));
    safeSet('cfg-referral-banner', config.referralBannerUrl || '');
    safeSet('cfg-tds-banner', config.tdsBannerUrl || '');
    
    // Auto-fill Push Defaults into Broadcast form
    if (!document.getElementById('push-banner').value) safeSet('push-banner', config.defaultPushBanner || '');
    if (!document.getElementById('push-link').value) safeSet('push-link', config.defaultPushLink || '');
    
    renderContentManager(config);
  }
});

// --- Render Functions ---

function renderTournaments(matches) {
  const container = document.getElementById('tournament-list');
  if (!container) return;
  container.innerHTML = '';
  
  matches.forEach(m => {
    const card = document.createElement('div');
    card.id = `match-row-${m.id}`;
    card.className = 't-card';
    card.dataset.status = m.status; // Store raw status for logic
    
    const diff = new Date(m.time).getTime() - Date.now();
    if (diff > 0 && diff <= 120000 && m.status === 'Upcoming') {
      card.classList.add('match-glow');
    }

    const progress = (m.joinedSpots / m.totalSpots) * 100;
    const statusClass = m.status === 'Resulted' ? 'badge-primary' : (m.status === 'Ongoing' ? 'badge-success' : (m.status === 'Cancelled' ? 'badge-danger' : 'badge-warning'));

    card.innerHTML = `
      <img src="${m.bannerImageUrl || 'https://via.placeholder.com/400x200?text=Match+Banner'}" class="t-card-banner">
      <div class="t-card-badge"><span class="badge ${statusClass}">${m.status}</span></div>
      
      <div class="t-card-content">
        <div class="t-card-title">${m.title}</div>
        <div class="t-card-subtitle">
          <span class="badge badge-outline" style="border:1px solid #ddd; padding: 2px 6px;">${m.gameName}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${m.map}</span>
        </div>

        <div class="t-card-stats">
          <div><div class="t-stat-label">Entry Fee</div><div class="t-stat-item">₹${m.entryFee}</div></div>
          <div><div class="t-stat-label">Prize Pool</div><div class="t-stat-item" style="color:var(--success)">₹${m.prizePool}</div></div>
          <div><div class="t-stat-label">Per Kill</div><div class="t-stat-item">₹${m.perKill}</div></div>
          <div><div class="t-stat-label">Schedule</div><div class="t-stat-item" style="font-size:11px;">${new Date(m.time).toLocaleDateString()}</div></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
           <span style="font-size:11px; font-weight:700;">Spots: ${m.joinedSpots}/${m.totalSpots}</span>
           <span style="font-size:11px; color:var(--text-muted);">${Math.round(progress)}% Full</span>
        </div>
        <div class="spots-bar-container">
           <div class="spots-bar-fill" style="width: ${progress}%"></div>
        </div>

        <div class="t-card-footer">
          <div style="display:flex; gap:10px; align-items:center;">
             <div class="countdown-timer" id="timer-${m.id}" data-time="${m.time}">${calculateCountdown(m.time, m.status === 'Upcoming')}</div>
             <button class="btn btn-outline btn-sm btn-view-players" data-id="${m.id}" title="Joined Players"><i class="fas fa-users"></i></button>
             ${m.streamLink ? `<a href="${m.streamLink}" target="_blank" class="btn btn-outline btn-sm" style="padding:5px 8px;"><i class="fas fa-video"></i></a>` : ''}
          </div>
          <button class="btn btn-primary btn-sm btn-edit-match" data-id="${m.id}"><i class="fas fa-edit"></i> Edit</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll('.btn-edit-match').forEach(btn => {
    btn.onclick = () => {
      const match = matches.find(m => m.id === btn.dataset.id);
      
      safeSet('m-id', match.id || '');
      safeSet('m-title', match.title || '');
      safeSet('m-fee', match.entryFee || 0);
      safeSet('m-prize', match.prizePool || 0);
      safeSet('m-kill', match.perKill || 0);
      safeSet('m-map', match.map || '');
      safeSet('m-spots', match.totalSpots || 48);
      safeSet('m-time', match.time || '');
      safeSet('m-format', match.matchFormat || 'custom');
      safeSet('m-stream', match.streamLink || '');
      safeSet('m-banner', match.bannerImageUrl || '');
      safeSet('m-custom-prize', match.customPrizeDetails || '');
      safeSet('m-room-id', match.roomId || '');
      safeSet('m-room-pass', match.roomPassword || '');
      safeSet('m-status', match.status || 'Upcoming');
      
      populateGameDropdown(match.gameName);
      
      const roomDetails = document.getElementById('room-details-section');
      if (roomDetails) roomDetails.style.display = 'grid';
      
      const cancelBox = document.getElementById('match-cancel-box');
      if (cancelBox) cancelBox.style.display = (match.status !== 'Resulted' && match.status !== 'Cancelled' ? 'block' : 'none');
      
      const modal = document.getElementById('match-modal');
      if (modal) modal.style.display = 'block';
    };
  });

  // View Joined Players Logic
  document.querySelectorAll('.btn-view-players').forEach(btn => {
    btn.onclick = () => {
      const match = matches.find(m => m.id === btn.dataset.id);
      openJoinedPlayersModal(match);
    };
  });
}

let activeMatchForNotify = null;
function openJoinedPlayersModal(match) {
  activeMatchForNotify = match;
  safeSet('jp-match-title', `Joined: ${match.title}`, 'innerText');
  const list = document.getElementById('joined-players-list');
  if (!list) return;
  list.innerHTML = '';

  const playerUids = match.joinedPlayers || [];
  const playerIgns = match.joinedIGNs || [];

  if (playerUids.length === 0) {
    list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No players joined yet.</td></tr>';
  }

  playerUids.forEach((uid, i) => {
    const p = allPlayers.find(user => user.id === uid) || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div style="font-weight:700">${playerIgns[i] || 'N/A'}</div></td>
      <td><div style="font-size:12px">${p.email || 'N/A'}</div><div style="font-size:11px; color:var(--text-muted)">${p.phone || 'N/A'}</div></td>
      <td style="font-family:monospace; font-size:11px">${uid}</td>
    `;
    list.appendChild(tr);
  });

  document.getElementById('joined-players-modal').style.display = 'block';
}

const notifyJoinedBtn = document.getElementById('btn-notify-joined');
if (notifyJoinedBtn) {
  notifyJoinedBtn.onclick = () => {
    if (!activeMatchForNotify || !activeMatchForNotify.joinedPlayers?.length) return showToast("No players to notify!", "error");
    safeSet('nj-message', `Hurry up! Join ${activeMatchForNotify.title} now.`);
    document.getElementById('notify-joined-modal').style.display = 'block';
  };
}

document.getElementById('btn-nj-send').onclick = async () => {
  const title = safeGet('nj-title'), msg = safeGet('nj-message');
  if (title && msg) {
    document.getElementById('btn-nj-send').disabled = true;
    document.getElementById('btn-nj-send').innerText = "Sending...";
    await fb.sendPush(title, msg, activeMatchForNotify.joinedPlayers);
    showToast("Notification sent to all joined players!");
    document.getElementById('notify-joined-modal').style.display = 'none';
    document.getElementById('btn-nj-send').disabled = false;
    document.getElementById('btn-nj-send').innerText = "Send to All Joined";
  }
};

// --- Push Defaults Saving ---
const savePushDefaultsBtn = document.getElementById('btn-save-push-defaults');
if (savePushDefaultsBtn) {
  savePushDefaultsBtn.onclick = async () => {
    await fb.updateAppConfig({
      defaultPushBanner: safeGet('push-banner'),
      defaultPushLink: safeGet('push-link')
    });
    showToast('Push defaults saved as global settings!');
  };
}

const clearPushBtn = document.getElementById('btn-clear-push');
if (clearPushBtn) {
  clearPushBtn.onclick = () => {
    document.getElementById('push-form').reset();
    showToast('Form cleared');
  };
}

function updateResultHub() {
  const matches = globalMatches;
  const pendingBtn = document.getElementById('btn-show-pending-results');
  const isHistory = pendingBtn ? !pendingBtn.classList.contains('btn-primary') : false;
  const filtered = matches.filter(m => isHistory ? m.status === 'Resulted' : m.status === 'Ongoing');
  renderResults(filtered);
}

const showPendingBtn = document.getElementById('btn-show-pending-results');
if (showPendingBtn) {
  showPendingBtn.onclick = () => {
    showPendingBtn.className = 'btn btn-primary';
    const histBtn = document.getElementById('btn-show-results-history');
    if (histBtn) histBtn.className = 'btn btn-outline';
    updateResultHub();
  };
}

const showHistoryBtn = document.getElementById('btn-show-results-history');
if (showHistoryBtn) {
  showHistoryBtn.onclick = () => {
    showHistoryBtn.className = 'btn btn-primary';
    const pendingBtn = document.getElementById('btn-show-pending-results');
    if (pendingBtn) pendingBtn.className = 'btn btn-outline';
    updateResultHub();
  };
}

function renderResults(matches) {
  const container = document.getElementById('results-list');
  if (!container) return;
  container.innerHTML = '';
  matches.forEach(m => {
    const tr = document.createElement('tr');
    
    // Check if we are in cooling period
    let actionHtml = '';
    let statusHtml = `<span class="badge ${m.status === 'Resulted' ? 'badge-primary' : 'badge-success'}">${m.status}</span>`;
    
    if (m.status === 'Ongoing') {
      actionHtml = `<button class="btn btn-success btn-sm btn-declare-result" data-id="${m.id}">Declare Result</button>`;
    } else if (m.status === 'Resulted') {
      if (m.payoutsProcessed) {
        statusHtml = `<span class="badge badge-success">Completed & Paid</span>`;
        actionHtml = `<span style="font-size:12px; color:var(--text-muted)"><i class="fas fa-check-circle"></i> Paid Out</span>`;
      } else {
        // Cooling period logic
        const declaredAt = m.resultDeclaredAt || 0;
        const timePassed = Date.now() - declaredAt;
        const thirtyMins = 30 * 60 * 1000;
        const remaining = thirtyMins - timePassed;
        
        if (remaining > 0) {
           statusHtml = `<span class="badge badge-warning">Cooling Period</span>`;
           const minsLeft = Math.ceil(remaining / 60000);
           actionHtml = `
             <button class="btn btn-outline btn-sm btn-declare-result" data-id="${m.id}" title="Edit Results"><i class="fas fa-edit"></i> Edit</button>
             <button class="btn btn-warning btn-sm" disabled><i class="fas fa-clock"></i> ${minsLeft}m left</button>
           `;
        } else {
           statusHtml = `<span class="badge badge-warning">Awaiting Payout</span>`;
           actionHtml = `
             <button class="btn btn-outline btn-sm btn-declare-result" data-id="${m.id}" title="Edit Results"><i class="fas fa-edit"></i> Edit</button>
             <button class="btn btn-success btn-sm btn-process-payouts" data-id="${m.id}"><i class="fas fa-money-bill-wave"></i> Process Payouts</button>
           `;
        }
      }
    }

    tr.innerHTML = `
      <td><div style="font-weight:700">${m.title}</div></td>
      <td><div>${m.gameName}</div></td>
      <td>${statusHtml}</td>
      <td style="display:flex; gap:10px; align-items:center;">${actionHtml}</td>
    `;
    container.appendChild(tr);
  });
  
  document.querySelectorAll('.btn-declare-result').forEach(btn => btn.onclick = () => openResultModal(matches.find(m => m.id === btn.dataset.id)));
  document.querySelectorAll('.btn-process-payouts').forEach(btn => btn.onclick = () => processPayouts(matches.find(m => m.id === btn.dataset.id)));
}

async function processPayouts(match) {
  if (!confirm(`Process payouts for ${match.title}? This will permanently add money to user wallets.`)) return;
  
  const winners = match.winners || [];
  try {
    for (let w of winners) {
      if (w.prize > 0 || w.kills > 0) {
        const userSnap = await fb.getUser(w.uid);
        if (userSnap.exists()) {
          const u = userSnap.data();
          const newWinBal = (u.winningBalance || 0) + w.prize;
          const newDepBal = u.depositBalance || 0;
          const newBonBal = u.bonusBalance || 0;
          await fb.updateUser(w.uid, {
            winningBalance: newWinBal,
            walletBalance: newWinBal + newDepBal + newBonBal,
            totalKills: (u.totalKills || 0) + w.kills,
            matchesPlayed: (u.matchesPlayed || 0) + 1
          });
          fb.sendPush("Match Result & Prize!", `You earned ₹${w.prize} and got ${w.kills} kills in ${match.title}`, [w.uid]);
        }
      }
    }
    await fb.updateMatch(match.id, { payoutsProcessed: true });
    showToast("Payouts Processed Successfully!");
  } catch (err) {
    showToast("Error processing payouts: " + err.message, "error");
  }
}

let activeResultMatch = null;
function openResultModal(match) {
  activeResultMatch = match;
  safeSet('result-match-info', `${match.title} (${match.gameName})`, 'innerText');
  
  const updateWalletsCheck = document.getElementById('res-update-wallets');
  if (updateWalletsCheck) updateWalletsCheck.checked = (match.status !== 'Resulted');
  
  safeSet('calc-per-kill', match.perKill || 0);
  safeSet('calc-win-bonus', match.prizePool || 0);
  
  const list = document.getElementById('player-result-list');
  if (!list) return;
  list.innerHTML = '';
  const players = match.joinedPlayers || [];
  const igns = match.joinedIGNs || [];
  const existingWinners = match.winners || [];

  players.forEach((uid, i) => {
    const ign = igns[i] || 'Unknown';
    const existing = existingWinners.find(w => (w.uid === uid || w.ign === ign));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" class="res-rank" value="${existing?.rank || 0}" style="width:50px; padding:5px"></td>
      <td><div style="font-weight:700">${ign}</div><div style="font-size:10px">${uid}</div></td>
      <td><input type="number" class="res-kills" data-uid="${uid}" data-ign="${ign}" value="${existing?.kills || 0}" style="width:60px; padding:5px"></td>
      <td><input type="number" class="res-prize" value="${existing?.prize || 0}" style="width:70px; padding:5px; background: #f0fdf4;"></td>
    `;
    list.appendChild(tr);
  });
  list.querySelectorAll('input').forEach(input => input.addEventListener('input', recalculatePrizes));
  const calcPK = document.getElementById('calc-per-kill');
  if (calcPK) calcPK.addEventListener('input', recalculatePrizes);
  const calcWB = document.getElementById('calc-win-bonus');
  if (calcWB) calcWB.addEventListener('input', recalculatePrizes);
  
  const modal = document.getElementById('result-modal');
  if (modal) modal.style.display = 'block';
}

function recalculatePrizes() {
  const pk = Number(safeGet('calc-per-kill')) || 0;
  const wb = Number(safeGet('calc-win-bonus')) || 0;
  document.querySelectorAll('#player-result-list tr').forEach(row => {
    const rank = Number(row.querySelector('.res-rank').value) || 0;
    const kills = Number(row.querySelector('.res-kills').value) || 0;
    row.querySelector('.res-prize').value = (kills * pk) + (rank === 1 ? wb : 0);
  });
}

const submitResultBtn = document.getElementById('btn-submit-result');
if (submitResultBtn) {
  submitResultBtn.onclick = async () => {
    if(!activeResultMatch) return;
    
    if (activeResultMatch.status === 'Resulted' && activeResultMatch.payoutsProcessed) {
      if(!confirm("Warning: Payouts for this match were already processed. Editing this will NOT add/deduct wallets automatically. Continue?")) return;
    }

    submitResultBtn.disabled = true; submitResultBtn.innerText = "Saving Result...";
    
    const winners = [];
    let totalDistributed = 0;
    try {
      const rows = document.querySelectorAll('#player-result-list tr');
      for(let row of rows) {
        const rank = Number(row.querySelector('.res-rank').value);
        const killInput = row.querySelector('.res-kills');
        const prize = Number(row.querySelector('.res-prize').value);
        const uid = killInput.dataset.uid;
        
        if (rank > 0 || prize > 0) winners.push({ uid, ign: killInput.dataset.ign, kills: Number(killInput.value), prize, rank });
        totalDistributed += prize;
      }
      winners.sort((a,b) => (a.rank || 999) - (b.rank || 999));
      
      const updateData = { 
        status: 'Resulted', 
        winners, 
        totalDistributedPrize: totalDistributed 
      };
      
      if (!activeResultMatch.resultDeclaredAt) {
        updateData.resultDeclaredAt = Date.now();
        updateData.payoutsProcessed = false;
      }

      await fb.updateMatch(activeResultMatch.id, updateData);
      
      showToast("Result Declared! Cooling Period Started."); 
      const modal = document.getElementById('result-modal');
      if (modal) modal.style.display = 'none';
    } catch (err) { showToast("Error: " + err.message, "error"); }
    finally { submitResultBtn.disabled = false; submitResultBtn.innerText = "Declare & Start Cooling"; }
  };
}

function renderPlayers(users) {
  const container = document.getElementById('player-list');
  if (!container) return;
  container.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:36px;height:36px;min-width:36px;background:var(--teal-bg);color:var(--teal);border-radius:var(--r-m);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;overflow:hidden;">
            ${(u.profileImageUrl || u.profilePic) 
                ? `<img src="${u.profileImageUrl || u.profilePic}" style="width:100%;height:100%;object-fit:cover;">` 
                : (u.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div style="overflow:hidden;">
            <div style="font-weight:700;color:var(--tx-1);white-space:nowrap;text-overflow:ellipsis;">${u.name || 'Anonymous'}</div>
            <div style="font-size:11px;color:var(--tx-3);white-space:nowrap;text-overflow:ellipsis;">${u.email}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight:700;color:var(--teal);"><i class="fas fa-gamepad" style="font-size:10px;margin-right:4px;"></i>${u.inGameName || 'No IGN'}</div>
        <div style="font-size:10px;color:var(--tx-3);font-family:monospace;">UID: ${u.ffUid || '---'}</div>
      </td>
      <td>
        <div style="font-size:12px;display:flex;flex-direction:column;gap:2px;">
          <span style="color:var(--tx-2);font-weight:600;">W: <span style="color:var(--teal);">₹${u.winningBalance}</span></span>
          <span style="color:var(--tx-3);font-size:10px;">D: ₹${u.depositBalance} | B: ₹${u.bonusBalance}</span>
        </div>
      </td>
      <td>
        <div style="font-weight:700;color:var(--tx-1);"><i class="fas fa-crosshairs" style="color:var(--teal);font-size:10px;margin-right:4px;"></i>${u.totalKills || 0} Kills</div>
        <div style="font-size:10px;color:var(--tx-3);">${u.matchesPlayed || 0} Matches</div>
      </td>
      <td><span class="badge ${u.isBanned ? 'badge-danger' : 'badge-success'}">${u.isBanned ? 'BANNED' : 'ACTIVE'}</span></td>
      <td><button class="btn btn-outline btn-sm btn-edit-player" data-id="${u.id}"><i class="fas fa-user-edit"></i> Edit</button></td>
    `;
    container.appendChild(tr);
  });
  document.querySelectorAll('.btn-edit-player').forEach(btn => btn.onclick = () => {
    const u = allPlayers.find(user => user.id === btn.dataset.id);
    ['p-uid', 'p-name', 'p-phone', 'p-ign', 'p-ffuid', 'p-win', 'p-dep', 'p-bon', 'p-status'].forEach(id => {
       const key = id.replace('p-', '');
       const val = key === 'uid' ? u.id : (key === 'ign' ? u.inGameName : (key === 'status' ? String(u.isBanned || false) : (key === 'win' ? u.winningBalance : (key === 'dep' ? u.depositBalance : (key === 'bon' ? u.bonusBalance : u[key])))));
       safeSet(id, val || (typeof val === 'number' ? 0 : ''));
    });
    const modal = document.getElementById('player-modal');
    if (modal) modal.style.display = 'block';
  });
}

const playerForm = document.getElementById('player-form');
if (playerForm) {
  playerForm.onsubmit = async (e) => {
    e.preventDefault();
    const uid = safeGet('p-uid');
    const win = Number(safeGet('p-win')), dep = Number(safeGet('p-dep')), bon = Number(safeGet('p-bon'));
    const data = { name: safeGet('p-name'), phone: safeGet('p-phone'), inGameName: safeGet('p-ign'), ffUid: safeGet('p-ffuid'), winningBalance: win, depositBalance: dep, bonusBalance: bon, walletBalance: win + dep + bon, isBanned: safeGet('p-status') === 'true' };
    try { await fb.updateUser(uid, data); fb.sendPush("Account Update", data.isBanned ? "Account restricted." : "Profile updated.", [uid]); alert('Updated!'); if (document.getElementById('player-modal')) document.getElementById('player-modal').style.display = 'none'; } 
    catch (err) { alert(err.message); }
  };
}

// --- Financials ---
let currentFinancialView = 'deposits';
const depBtn = document.getElementById('btn-show-deposits');
if (depBtn) {
  depBtn.onclick = () => { currentFinancialView = 'deposits'; depBtn.className = 'btn btn-primary'; const withBtn = document.getElementById('btn-show-withdrawals'); if (withBtn) withBtn.className = 'btn btn-outline'; renderDeposits(globalDeposits); };
}
const withBtn = document.getElementById('btn-show-withdrawals');
if (withBtn) {
  withBtn.onclick = () => { currentFinancialView = 'withdrawals'; withBtn.className = 'btn btn-primary'; const depBtn = document.getElementById('btn-show-deposits'); if (depBtn) depBtn.className = 'btn btn-outline'; renderWithdrawals(globalWithdrawals); };
}

function renderDeposits(deps) {
  const box = document.getElementById('financial-table-box');
  if (!box) return;
  box.innerHTML = `<table><thead><tr><th>User</th><th>Amount</th><th>UTR</th><th>Status</th><th>Actions</th></tr></thead><tbody id="dep-rows"></tbody></table>`;
  const rows = document.getElementById('dep-rows');
  deps.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.userName}</td><td>₹${d.amount}</td><td style="font-family:monospace">${d.utrNumber}</td><td><span class="badge ${d.status === 'Success' ? 'badge-success' : 'badge-pending'}">${d.status}</span></td><td>${d.status === 'Pending' ? `<button class="btn btn-success btn-sm btn-appr-dep" data-id="${d.id}" data-uid="${d.userId}" data-amt="${d.amount}">Approve</button>` : '---'}</td>`;
    rows.appendChild(tr);
  });
  document.querySelectorAll('.btn-appr-dep').forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      await fb.updateDeposit(btn.dataset.id, { status: 'Success' });
      const uSnap = await fb.getUser(btn.dataset.uid);
      if(uSnap.exists()) {
        const u = uSnap.data();
        await fb.updateUser(btn.dataset.uid, { depositBalance: (u.depositBalance || 0) + Number(btn.dataset.amt), walletBalance: (u.walletBalance || 0) + Number(btn.dataset.amt) });
        fb.sendPush("Deposit Successful", `₹${btn.dataset.amt} credited.`, [btn.dataset.uid]);
      }
      alert('Approved!');
    } catch(e) { alert(e.message); btn.disabled = false; }
  });
}

function renderWithdrawals(withs) {
  const box = document.getElementById('financial-table-box');
  if (!box) return;
  box.innerHTML = `<table><thead><tr><th>User</th><th>Amount</th><th>Method/UPI</th><th>Status</th><th>Actions</th></tr></thead><tbody id="with-rows"></tbody></table>`;
  const rows = document.getElementById('with-rows');
  withs.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${w.userName}</td><td>₹${w.amount}</td><td>${w.method}: ${w.upiId}</td><td><span class="badge ${w.status === 'Success' ? 'badge-success' : (w.status === 'Rejected' ? 'badge-danger' : 'badge-pending')}">${w.status}</span></td><td>${w.status === 'Pending' ? `<button class="btn btn-success btn-sm btn-appr-with" data-id="${w.id}" data-uid="${w.userId}">Paid</button><button class="btn btn-danger btn-sm btn-rej-with" data-id="${w.id}" data-uid="${w.userId}" data-amt="${w.amount}">Reject</button>` : '---'}</td>`;
    rows.appendChild(tr);
  });
  document.querySelectorAll('.btn-appr-with').forEach(btn => btn.onclick = async () => { btn.disabled = true; await fb.updateWithdrawal(btn.dataset.id, { status: 'Success' }); fb.sendPush("Withdrawal Success", "Paid!", [btn.dataset.uid]); alert('Success!'); });
  document.querySelectorAll('.btn-rej-with').forEach(btn => btn.onclick = async () => { if(!confirm('Refund?')) return; btn.disabled = true; try { await fb.updateWithdrawal(btn.dataset.id, { status: 'Rejected' }); const uS = await fb.getUser(btn.dataset.uid); if(uS.exists()) { const u = uS.data(); await fb.updateUser(btn.dataset.uid, { winningBalance: (u.winningBalance || 0) + Number(btn.dataset.amt), walletBalance: (u.walletBalance || 0) + Number(btn.dataset.amt) }); fb.sendPush("Withdrawal Rejected", "Refunded.", [btn.dataset.uid]); } alert('Rejected!'); } catch(e) { alert(e.message); btn.disabled = false; } });
}

function renderFullHistory(txs) {
  const container = document.getElementById('full-tx-list');
  if(!container) return;
  container.innerHTML = '';
  txs.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="badge ${tx.txType === 'DEPOSIT' ? 'badge-success' : 'badge-danger'}">${tx.txType}</span></td><td><div style="font-weight:700">${tx.userName || 'System'}</div><div style="font-size:10px">UID: ${tx.userId}</div></td><td>₹${tx.amount}</td><td style="font-family:monospace">${tx.ref || '---'}</td><td><span class="badge ${tx.status === 'Success' ? 'badge-success' : 'badge-warning'}">${tx.status}</span></td><td>${new Date(tx.date).toLocaleString()}</td>`;
    container.appendChild(tr);
  });
}

const txSearch = document.getElementById('tx-search-input');
if (txSearch) {
  txSearch.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    renderFullHistory(!q ? allTransactions : allTransactions.filter(t => t.userId?.toLowerCase().includes(q) || t.ref?.toLowerCase().includes(q) || t.userName?.toLowerCase().includes(q)));
  });
}

// --- Support Hub ---
let activeTicketId = null;
let currentTicketTab = 'open'; // 'open' | 'resolved'

// Tab switcher (called from HTML onclick)
window.switchTicketTab = function(tab) {
  currentTicketTab = tab;
  document.querySelectorAll('.ticket-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById(`tab-${tab}`);
  if (tabEl) tabEl.classList.add('active');
  renderTickets(globalTicketsCache);
};

function renderTickets(tickets) {
  const container = document.getElementById('ticket-list');
  if (!container) return;
  container.innerHTML = '';

  const filtered = tickets.filter(t =>
    currentTicketTab === 'open' ? t.status !== 'Resolved' : t.status === 'Resolved'
  );

  // Update open count badge
  const openCount = tickets.filter(t => t.status !== 'Resolved').length;
  const countEl = document.getElementById('open-count');
  if (countEl) countEl.innerText = openCount;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding:30px;text-align:center;color:var(--tx-4);">
        <i class="fas fa-${currentTicketTab === 'open' ? 'inbox' : 'check-circle'}" style="font-size:28px;margin-bottom:10px;display:block;opacity:0.4;"></i>
        <div style="font-size:13px;font-weight:600;">${currentTicketTab === 'open' ? 'No open tickets' : 'No resolved tickets'}</div>
      </div>`;
    return;
  }

  filtered.forEach(t => {
    const div = document.createElement('div');
    div.className = `ticket-card${t.status === 'Resolved' ? ' resolved-card' : ''}${activeTicketId === t.id ? ' active' : ''}`;
    div.innerHTML = `
      <div class="ticket-meta">
        <div class="ticket-user">${t.userName || 'Unknown'}</div>
        <span class="badge ${t.status === 'Open' ? 'badge-warning' : 'badge-success'}">${t.status}</span>
      </div>
      <div class="ticket-concern">${t.concern || '—'}</div>
      <div class="ticket-time"><i class="fas fa-clock" style="margin-right:4px;"></i>${new Date(t.createdAt).toLocaleString()}</div>
    `;
    div.onclick = () => openTicket(t);
    container.appendChild(div);
  });
}

function openChatPanel() {
  const empty  = document.getElementById('chat-empty-state');
  const header = document.getElementById('chat-header');
  const msgs   = document.getElementById('chat-messages');
  const input  = document.getElementById('chat-input-area');
  if (empty)  empty.style.display  = 'none';
  if (header) header.style.display = 'flex';
  if (msgs)   msgs.style.display   = 'flex';
  if (input)  input.style.display  = 'flex';
}

window.closeChatPanel = function() {
  activeTicketId = null;
  if (msgUnsub) { msgUnsub(); msgUnsub = null; }
  const empty  = document.getElementById('chat-empty-state');
  const header = document.getElementById('chat-header');
  const msgs   = document.getElementById('chat-messages');
  const input  = document.getElementById('chat-input-area');
  if (empty)  { empty.style.display  = 'flex'; }
  if (header) { header.style.display = 'none'; }
  if (msgs)   { msgs.style.display   = 'none'; msgs.innerHTML = ''; }
  if (input)  { input.style.display  = 'none'; }
  renderTickets(globalTicketsCache);
};

let msgUnsub = null;
function openTicket(t) {
  activeTicketId = t.id;
  openChatPanel();

  safeSet('active-ticket-title', t.concern || 'Ticket', 'innerText');
  safeSet('active-ticket-user', `${t.userName}  ·  UID: ${t.uid || '—'}`, 'innerText');

  renderTickets(globalTicketsCache); // re-render to show active state

  const closeBtn = document.getElementById('btn-close-ticket');
  if (closeBtn) {
    // Remove old listener
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    const newCloseBtn = document.getElementById('btn-close-ticket');
    if (newCloseBtn) {
      newCloseBtn.onclick = () => askConfirm(
        'Resolve Ticket?',
        `Mark "${t.concern}" as resolved?`,
        async () => {
          await fb.updateTicket(t.id, { status: 'Resolved' });
          showToast('Ticket resolved ✓');
          closeChatPanel();
        }
      );
    }
  }

  if (msgUnsub) msgUnsub();
  msgUnsub = fb.listenMessages(t.id, msgs => {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.innerHTML = '';
    if (msgs.length === 0) {
      box.innerHTML = `<div style="text-align:center;padding:20px;color:var(--tx-4);font-size:12px;">No messages yet. Start the conversation.</div>`;
      return;
    }
    msgs.forEach(m => {
      const mD = document.createElement('div');
      mD.className = `msg ${m.senderId === 'ADMIN' ? 'msg-admin' : 'msg-user'}`;
      mD.innerText = m.message;
      if (m.imageUrl && m.imageUrl.trim() !== '') {
          const imgWrap = document.createElement('div');
          imgWrap.style.marginTop = '8px';
          imgWrap.innerHTML = `<a href="#" onclick="window.openImagePreview('${m.imageUrl}'); return false;"><img src="${m.imageUrl}" style="max-width:200px; border-radius:8px; display:block; cursor:pointer;"></a>`;
          mD.appendChild(imgWrap);
      }
      box.appendChild(mD);
    });
    box.scrollTop = box.scrollHeight;
  });
}

const sendMsgBtn = document.getElementById('btn-send-msg');
if (sendMsgBtn) {
  sendMsgBtn.onclick = async () => {
    const inp = document.getElementById('chat-input-box');
    if (activeTicketId && inp && inp.value.trim()) {
      const msg = inp.value.trim();
      inp.value = '';
      inp.focus();
      await fb.sendMessage(activeTicketId, { senderId: 'ADMIN', message: msg, timestamp: Date.now() });
    }
  };
}

// Enter key to send
const chatInputBox = document.getElementById('chat-input-box');
if (chatInputBox) {
  chatInputBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('btn-send-msg')?.click();
    }
  });
}



// --- Tournament Form ---
const createMatchBtn = document.getElementById('btn-create-match');
if (createMatchBtn) {
  createMatchBtn.onclick = () => {
    const form = document.getElementById('match-form');
    if (form) form.reset();
    safeSet('m-id', '');
    safeSet('m-status', 'Upcoming');
    populateGameDropdown();
    if (document.getElementById('room-details-section')) document.getElementById('room-details-section').style.display = 'none';
    if (document.getElementById('match-cancel-box')) document.getElementById('match-cancel-box').style.display = 'none';
    if (document.getElementById('match-modal')) document.getElementById('match-modal').style.display = 'block';
  };
}

const matchForm = document.getElementById('match-form');
if (matchForm) {
  matchForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = safeGet('m-id');
    const rid = safeGet('m-room-id'), rpass = safeGet('m-room-pass');
    const data = {
      title: safeGet('m-title'),
      entryFee: Number(safeGet('m-fee')),
      prizePool: Number(safeGet('m-prize')),
      perKill: Number(safeGet('m-kill')),
      gameName: safeGet('m-game'),
      matchFormat: safeGet('m-format'),
      map: safeGet('m-map'),
      totalSpots: Number(safeGet('m-spots')),
      time: safeGet('m-time'),
      streamLink: safeGet('m-stream'),
      bannerImageUrl: safeGet('m-banner'),
      customPrizeDetails: safeGet('m-custom-prize'),
      roomId: rid, roomPassword: rpass
    };

    if(id) {
      const mOld = globalMatches.find(m => m.id === id);
      if ((rid || rpass) && mOld.status === 'Upcoming') {
         data.status = 'Ongoing';
         fb.sendPush("Room ID/Pass Released!", `Room details for ${data.title} are now available!`, mOld.joinedPlayers);
      }
      await fb.updateMatch(id, data);
    } else {
      data.matchId = "M" + Date.now(); data.joinedSpots = 0; data.status = 'Upcoming'; data.isPlayerHosted = false;
      await fb.createMatch(data);
    }
    if (document.getElementById('match-modal')) document.getElementById('match-modal').style.display = 'none';
  };
}

const cancelMatchBtn = document.getElementById('btn-cancel-match');
if (cancelMatchBtn) {
  cancelMatchBtn.onclick = async () => {
    const mid = safeGet('m-id');
    if(!mid || !confirm("CANCEL MATCH & REFUND ALL PLAYERS?")) return;
    const match = globalMatches.find(m => m.id === mid);
    const players = match.joinedPlayers || [];
    const fee = match.entryFee || 0;
    for(let uid of players) {
       const uS = await fb.getUser(uid);
       if(uS.exists()) {
          const u = uS.data();
          await fb.updateUser(uid, { depositBalance: (u.depositBalance || 0) + fee, walletBalance: (u.walletBalance || 0) + fee });
          fb.sendPush("Match Cancelled", `Match ${match.title} cancelled. Fee ₹${fee} refunded.`, [uid]);
       }
    }
    await fb.updateMatch(mid, { status: 'Cancelled', joinedSpots: 0, joinedPlayers: [], joinedIGNs: [] });
    alert("Match Cancelled & Refunded!"); if (document.getElementById('match-modal')) document.getElementById('match-modal').style.display = 'none';
  };
}

function populateGameDropdown(sV = '') {
  const gs = document.getElementById('m-game'); 
  if (!gs) return;
  gs.innerHTML = '';
  if (globalConfig?.games) {
    globalConfig.games.forEach(g => { 
      const opt = document.createElement('option'); 
      opt.value = g.name; opt.innerText = g.name; 
      if (g.name === sV) opt.selected = true; 
      gs.appendChild(opt); 
    });
  }
  
  // Initial populate of cards for the default/selected game
  populateBannerPresets(gs.value);
}

// Update presets when game selection changes
const mGameEl = document.getElementById('m-game');
if (mGameEl) mGameEl.addEventListener('change', (e) => {
  populateBannerPresets(e.target.value);
});

function populateBannerPresets(gameName) {
  const ps = document.getElementById('m-banner-preset');
  if (!ps) return;
  ps.innerHTML = '<option value="">-- Choose from Library --</option>';
  
  if (globalConfig?.matchCards) {
    const cards = globalConfig.matchCards.filter(c => c.category === gameName);
    cards.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = c.url;
      opt.innerText = `Card ${i + 1}`;
      ps.appendChild(opt);
    });

    // AUTO-MAGIC: If cards exist for this category, pick the first one automatically
    if (cards.length > 0) {
       safeSet('m-banner', cards[0].url);
       ps.value = cards[0].url; // Select it in the dropdown too
    } else {
       safeSet('m-banner', ''); // Clear if no cards found
    }
  }
}

// When a preset is chosen, fill the actual URL field
const mBannerPresetEl = document.getElementById('m-banner-preset');
if (mBannerPresetEl) {
  mBannerPresetEl.addEventListener('change', (e) => {
    safeSet('m-banner', e.target.value);
  });
}

// --- Match Format Logic ---
const mFormat = document.getElementById('m-format');
const mFee = document.getElementById('m-fee');
const mPrize = document.getElementById('m-prize');
const mSpots = document.getElementById('m-spots');
const mCustomPrize = document.getElementById('m-custom-prize');

function updateMatchFormat() {
  const format = mFormat?.value;
  const fee = Number(mFee?.value) || 0;
  
  if (!format) return;
  
  const platformFee = Number(globalConfig?.playerMatchPlatformFeePercent) || 10;
  const prizeRatio = (100 - platformFee) / 100;
  
  const mKillGroup = document.getElementById('m-kill-group');
  if (mKillGroup) {
    if (format !== 'custom') {
      mKillGroup.style.display = 'none';
      if (document.getElementById('m-kill')) document.getElementById('m-kill').value = 0;
    } else {
      mKillGroup.style.display = 'block';
    }
  }

  let spots = Number(mSpots?.value) || 0;

  if (format === '1v1') spots = 2;
  else if (format === '2v2') spots = 4;
  else if (format === '4v4') spots = 8;
  else if (format === 'survival_top10') spots = 20;
  else if (format === 'survival' && spots === 0) spots = 48;

  if (mSpots) mSpots.value = spots;

  const totalPrize = Math.floor(fee * spots * prizeRatio);
  if (mPrize) mPrize.value = totalPrize;

  if (format === 'survival_top10') {
    const r1 = Math.floor(totalPrize * 0.30);
    const r2 = Math.floor(totalPrize * 0.20);
    const r3 = Math.floor(totalPrize * 0.15);
    const r4_5 = Math.floor(totalPrize * 0.075);
    const r6_10 = Math.floor((totalPrize - (r1 + r2 + r3 + (r4_5 * 2))) / 5);
    if (mCustomPrize) mCustomPrize.value = `Rank 1: ₹${r1}\nRank 2: ₹${r2}\nRank 3: ₹${r3}\nRank 4 to 5: ₹${r4_5}\nRank 6 to 10: ₹${r6_10}`;
  } else if (format === 'survival') {
    if (mCustomPrize) mCustomPrize.value = `Survival Match\nTotal Pool: ₹${totalPrize}`;
  } else if (format === '1v1') {
    if (mCustomPrize) mCustomPrize.value = `Winner: ₹${totalPrize}`;
  } else if (format === '2v2' || format === '4v4') {
    const playersInTeam = format === '2v2' ? 2 : 4;
    const perPlayer = Math.floor(totalPrize / playersInTeam);
    let listStr = `Winning Team: ₹${totalPrize}\n`;
    for(let i=1; i<=playersInTeam; i++) {
       listStr += `Player ${i}: ₹${perPlayer}${i < playersInTeam ? '\n' : ''}`;
    }
    if (mCustomPrize) mCustomPrize.value = listStr;
  }
  
  updateProfitDisplay();
}

function updateProfitDisplay() {
  const fee = Number(mFee?.value) || 0;
  const spots = Number(mSpots?.value) || 0;
  const prize = Number(mPrize?.value) || 0;
  const mProfitDisplay = document.getElementById('m-profit-display');
  if (mProfitDisplay) {
    const profit = (fee * spots) - prize;
    mProfitDisplay.innerText = `₹${profit}`;
    mProfitDisplay.style.color = profit < 0 ? 'var(--danger)' : 'var(--success)';
  }
}

if (mFormat) mFormat.addEventListener('change', updateMatchFormat);
if (mFee) mFee.addEventListener('input', () => { updateMatchFormat(); updateProfitDisplay(); });
if (mSpots) mSpots.addEventListener('input', () => { 
  if (mFormat?.value === 'survival' || mFormat?.value === 'custom') updateMatchFormat(); 
  updateProfitDisplay();
});
if (mPrize) mPrize.addEventListener('input', updateProfitDisplay);

const configForm = document.getElementById('system-config-form');
if (configForm) {
  configForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    const keys = ['version', 'updateUrl', 'upiId', 'supportLink', 'welcomeBonusAmount', 'referralBonusAmount', 'playerMatchPlatformFeePercent', 'appTheme', 'homeBackgroundUrl', 'winnersBackgroundUrl', 'helpBackgroundUrl', 'profileBackgroundUrl', 'earnBackgroundUrl', 'manualPaymentQrUrl', 'qr20Url', 'qr40Url', 'qr100Url', 'qr500Url', 'announcementText', 'rulesText'];
    const ids = ['cfg-version', 'cfg-update-url', 'cfg-upi', 'cfg-support-link', 'cfg-welcome-bonus', 'cfg-referral-bonus', 'cfg-fee-percent', 'cfg-theme', 'cfg-home-bg', 'cfg-winners-bg', 'cfg-help-bg', 'cfg-profile-bg', 'cfg-earn-bg', 'cfg-qr-manual', 'cfg-qr-20', 'cfg-qr-40', 'cfg-qr-100', 'cfg-qr-500', 'cfg-announcement', 'cfg-rules'];
    
    ids.forEach((id, i) => {
       const el = document.getElementById(id);
       if(el) data[keys[i]] = (el.type === 'number' ? Number(el.value) : el.value);
    });
    
    const maintEl = document.getElementById('cfg-maint');
    if (maintEl) data.maintenanceMode = maintEl.value === 'true';
    
    await fb.updateAppConfig(data); alert('Saved!');
  };
}

function renderContentManager(config) {
  // Home Banners
  const bL = document.getElementById('banner-list'); 
  if (bL) {
    bL.innerHTML = '';
    (config?.bannerImages || []).forEach((u, i) => { 
      const d = document.createElement('div'); 
      d.className = "card"; d.style = "width: 200px; padding: 10px;"; 
      d.innerHTML = `<img src="${u}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;"><div style="font-size:10px;margin-top:5px;overflow:hidden">${(config?.bannerLinks||[])[i]||'No link'}</div><button class="btn btn-outline text-danger btn-sm" style="width:100%;margin-top:5px" onclick="deleteBanner(${i})">Delete</button>`; 
      bL.appendChild(d); 
    });
  }
  
  // Game Categories
  const gL = document.getElementById('game-list'); 
  if (gL) {
    gL.innerHTML = '';
    (config?.games || []).forEach((g, i) => { 
      const tr = document.createElement('tr'); 
      tr.innerHTML = `
        <td>${g.name}</td>
        <td><img src="${g.imageUrl}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;"></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editGame(${i})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-outline text-danger btn-sm" onclick="deleteGame(${i})"><i class="fas fa-trash"></i></button>
        </td>`; 
      gL.appendChild(tr); 
    });
  }

  // Match Card Library
  const cL = document.getElementById('card-list');
  if (cL) {
    cL.innerHTML = '';
    (config.matchCards || []).forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge badge-primary">${c.category}</span></td>
        <td><img src="${c.url}" style="width:80px;height:45px;border-radius:6px;object-fit:cover;"></td>
        <td><div style="font-size:11px; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis;">${c.url}</div></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editMatchCard(${i})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-outline text-danger btn-sm" onclick="deleteMatchCard(${i})"><i class="fas fa-trash"></i></button>
        </td>`;
      cL.appendChild(tr);
    });
  }
}

// --- Content Handlers ---

// 1. Games
const gameForm = document.getElementById('game-form');
if (gameForm) {
  gameForm.onsubmit = async (e) => {
    e.preventDefault();
    const idx = document.getElementById('g-idx').value;
    const newGame = { name: safeGet('g-name'), imageUrl: safeGet('g-url'), playerCount: 0 };
    const games = [...(globalConfig?.games || [])];
    if (idx === "") games.push(newGame); else games[idx] = newGame;
    await fb.updateAppConfig({ games });
    alert('Category Saved!'); document.getElementById('game-modal').style.display = 'none';
  };
}

const addGameBtn = document.getElementById('btn-add-game');
if (addGameBtn) addGameBtn.onclick = () => {
  if (gameForm) gameForm.reset();
  safeSet('g-idx', '');
  document.getElementById('game-modal').style.display = 'block';
};

window.editGame = (i) => {
  const g = globalConfig?.games?.[i];
  safeSet('g-idx', i); safeSet('g-name', g.name); safeSet('g-url', g.imageUrl);
  document.getElementById('game-modal').style.display = 'block';
};

window.deleteGame = async (i) => {
  if(!confirm("Delete this category?")) return;
  const games = [...(globalConfig?.games || [])]; games.splice(i,1);
  await fb.updateAppConfig({ games });
};

// 2. Match Cards
const cardForm = document.getElementById('card-form');
if (cardForm) {
  cardForm.onsubmit = async (e) => {
    e.preventDefault();
    const idx = document.getElementById('c-idx').value;
    const newCard = { category: safeGet('c-game'), url: safeGet('c-url') };
    const matchCards = [...(globalConfig?.matchCards || [])];
    if (idx === "") matchCards.push(newCard); else matchCards[idx] = newCard;
    await fb.updateAppConfig({ matchCards });
    alert('Card URL Saved!'); document.getElementById('card-modal').style.display = 'none';
  };
}

const addCardBtn = document.getElementById('btn-add-card');
if (addCardBtn) addCardBtn.onclick = () => {
  if (cardForm) cardForm.reset();
  safeSet('c-idx', '');
  populateCardGameDropdown();
  document.getElementById('card-modal').style.display = 'block';
};

window.editMatchCard = (i) => {
  const c = globalConfig?.matchCards?.[i];
  safeSet('c-idx', i); populateCardGameDropdown(c.category); safeSet('c-url', c.url);
  document.getElementById('card-modal').style.display = 'block';
};

window.deleteMatchCard = async (i) => {
  if(!confirm("Delete this card URL?")) return;
  const matchCards = [...(globalConfig?.matchCards || [])]; matchCards.splice(i,1);
  await fb.updateAppConfig({ matchCards });
};

function populateCardGameDropdown(sV = '') {
  const gs = document.getElementById('c-game'); if (!gs) return;
  gs.innerHTML = '';
  (globalConfig?.games || []).forEach(g => { const opt = document.createElement('option'); opt.value = g.name; opt.innerText = g.name; if(g.name === sV) opt.selected = true; gs.appendChild(opt); });
}

// 3. Sliders (Legacy helpers)
const saveContentBtn = document.getElementById('btn-save-content-settings');
if (saveContentBtn) {
  saveContentBtn.onclick = async () => { 
    await fb.updateAppConfig({ 
        isBannerEnabled: safeGet('cfg-banner-enabled') === 'true', 
        referralBannerUrl: safeGet('cfg-referral-banner'),
        tdsBannerUrl: safeGet('cfg-tds-banner')
    }); 
    alert('Saved!'); 
  };
}

const addBannerBtn = document.getElementById('btn-add-banner');
if (addBannerBtn) {
  addBannerBtn.onclick = async () => { 
    const u = prompt("Img URL:"), l = prompt("Link:"); 
    if(u) await fb.updateAppConfig({ bannerImages: [...(globalConfig.bannerImages||[]), u], bannerLinks: [...(globalConfig.bannerLinks||[]), l||""] }); 
  };
}

window.deleteBanner = async (i) => { const imgs = [...globalConfig.bannerImages], lnks = [...globalConfig.bannerLinks]; imgs.splice(i,1); lnks.splice(i,1); await fb.updateAppConfig({ bannerImages: imgs, bannerLinks: lnks }); };


const pushForm = document.getElementById('push-form');
if (pushForm) {
  pushForm.onsubmit = async (e) => { 
    e.preventDefault(); 
    const t = safeGet('push-title'), m = safeGet('push-message');
    const banner = safeGet('push-banner'), link = safeGet('push-link');
    const b = document.getElementById('btn-send-push'); 
    
    if (b) b.disabled = true; 
    try { 
      await fb.sendPush(t, m, null, { image: banner, url: link }); 
      showToast('Broadcast Sent with High Priority!'); 
      e.target.reset(); 
    } catch(e){ showToast(e.message, 'error'); } 
    finally { if (b) b.disabled = false; } 
  };
}

// --- Countdown Engine ---
function calculateCountdown(targetDate, isUpcoming) {
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const diff = target - now;

  if (isNaN(target)) return "Time not set";
  
  if (diff <= 0) {
    if (!isUpcoming) return "Ongoing";
    // Show live delay in Mins and Secs
    const absDiff = Math.abs(diff);
    const totalSecs = Math.floor(absDiff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `⚠️ DELAYED: ${mins}m ${secs}s`;
  }

  const totalSecs = Math.floor(diff / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`;
}

setInterval(() => {
  let hasAnyDelay = false;
  
  document.querySelectorAll('.countdown-timer').forEach(el => {
    const time = el.dataset.time;
    if (!time) return;
    
    const row = el.closest('.t-card');
    if (!row) return;
    
    const dbStatus = row.dataset.status;
    const isUpcoming = (dbStatus === 'Upcoming');
    
    const text = calculateCountdown(time, isUpcoming);
    el.innerText = text;
    
    const diff = new Date(time).getTime() - Date.now();
    const badge = row.querySelector('.badge');

    if (isUpcoming) {
       if (diff < 0) {
         el.classList.add('delayed');
         row.classList.add('delay-flash');
         row.classList.remove('match-glow');
         if (badge) {
           badge.innerText = '⚠️ DELAYED';
           badge.className = 'badge badge-danger';
         }
         hasAnyDelay = true;
       } else {
         el.classList.remove('delayed');
         row.classList.remove('delay-flash');
         if (badge) {
           badge.innerText = 'Upcoming';
           badge.className = 'badge badge-warning';
         }
         if (diff <= 120000) row.classList.add('match-glow');
         else row.classList.remove('match-glow');
       }
    } else {
       el.classList.remove('delayed', 'match-glow', 'delay-flash');
       // If status is Ongoing/Resulted, keep its original badge
    }
  });

  const urgentBar = document.getElementById('urgent-delay-bar');
  if (urgentBar) urgentBar.style.display = hasAnyDelay ? 'block' : 'none';
}, 1000);

// --- Manual Add Funds ---
const addFundsForm = document.getElementById('add-funds-form');
if (addFundsForm) {
  addFundsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uidOrFfuid = document.getElementById('af-uid').value.trim();
    const wType = document.getElementById('af-type').value;
    const amt = Number(document.getElementById('af-amt').value);
    const reason = document.getElementById('af-reason').value.trim();
    
    const u = allPlayers.find(x => x.id === uidOrFfuid || x.ffUid === uidOrFfuid);
    if (!u) return alert('Player not found! Check the UID.');
    
    try {
      const currentBal = Number(u[wType]) || 0;
      const currentTotal = Number(u.walletBalance) || 0;
      
      const btn = addFundsForm.querySelector('button[type="button"].btn-teal');
      if (btn) btn.disabled = true;
      
      // Update User Wallet
      await fb.updateUser(u.id, {
         [wType]: currentBal + amt,
         walletBalance: currentTotal + amt
      });
      
      // Create Deposit Record so it shows in history
      await fb.createDeposit({
         userId: u.id,
         userName: u.name || 'Anonymous',
         amount: amt,
         utrNumber: reason || 'Manual Admin Add',
         status: 'Success',
         timestamp: Date.now()
      });
      
      // Send Push Notification
      const walletName = wType.replace('Balance', '');
      fb.sendPush("Funds Added", `₹${amt} added to your ${walletName} wallet.`, [u.id]);
      
      alert(`Successfully added ₹${amt} to ${u.name || u.ffUid}!`);
      addFundsForm.reset();
      document.getElementById('add-funds-modal').style.display = 'none';
      if (btn) btn.disabled = false;
    } catch(err) {
      alert('Error: ' + err.message);
      const btn = addFundsForm.querySelector('button[type="button"].btn-teal');
      if (btn) btn.disabled = false;
    }
  });
}

// --- Danger Zone Wipe Logic ---
const btnWipeMatches = document.getElementById('btn-wipe-matches');
if (btnWipeMatches) {
  btnWipeMatches.onclick = async () => {
    if(!confirm("DANGER: This will delete ALL matches permanently. Continue?")) return;
    let count = 0;
    btnWipeMatches.disabled = true;
    btnWipeMatches.innerText = 'Wiping...';
    try {
      for(const m of globalMatches) { await fb.deleteMatch(m.id); count++; }
      alert(`Wiped ${count} matches from database.`);
    } catch(err) { alert(err.message); }
    btnWipeMatches.disabled = false;
    btnWipeMatches.innerHTML = '<i class="fas fa-trash-alt"></i> Wipe All Matches';
  };
}

const btnWipeTxs = document.getElementById('btn-wipe-txs');
if (btnWipeTxs) {
  btnWipeTxs.onclick = async () => {
    if(!confirm("DANGER: This will delete ALL Deposits and Withdrawals permanently. Continue?")) return;
    let count = 0;
    btnWipeTxs.disabled = true;
    btnWipeTxs.innerText = 'Wiping...';
    try {
      for(const d of globalDeposits) { await fb.deleteDeposit(d.id); count++; }
      for(const w of globalWithdrawals) { await fb.deleteWithdrawal(w.id); count++; }
      alert(`Wiped ${count} transactions from database.`);
    } catch(err) { alert(err.message); }
    btnWipeTxs.disabled = false;
    btnWipeTxs.innerHTML = '<i class="fas fa-trash-alt"></i> Wipe All Transactions';
  };
}

const btnWipeAll = document.getElementById('btn-wipe-all');
if (btnWipeAll) {
  btnWipeAll.onclick = async () => {
    if(!confirm("EXTREME DANGER: This will wipe ALL Matches and ALL Transactions from the platform. Are you absolutely sure?")) return;
    if(prompt("Type 'CONFIRM' to wipe the database.") !== 'CONFIRM') return alert("Wipe cancelled.");
    
    btnWipeAll.disabled = true;
    btnWipeAll.innerText = 'Wiping Database...';
    let count = 0;
    try {
      for(const m of globalMatches) { await fb.deleteMatch(m.id); count++; }
      for(const d of globalDeposits) { await fb.deleteDeposit(d.id); count++; }
      for(const w of globalWithdrawals) { await fb.deleteWithdrawal(w.id); count++; }
      alert(`Wiped ${count} total records. Database is now clean.`);
    } catch(err) { alert(err.message); }
    btnWipeAll.disabled = false;
    btnWipeAll.innerHTML = '<i class="fas fa-skull-crossbones"></i> Wipe Entire Database';
  };
}

window.openImagePreview = (url) => {
  const modal = document.getElementById('image-preview-modal');
  const img = document.getElementById('image-preview-src');
  if (modal && img) {
    img.src = url;
    modal.style.display = 'block';
  }
};