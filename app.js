/* ==========================================
   MHASpace v3 - Silver Shark Edition
   Firebase + Adsgram + Levels + Combo
   + i18n + Store (Powerups + Boxes) + Daily
   No Leaderboard (removed)
   ========================================== */

// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyBJTd25x7MKfcQVzAH7ZNNaAwUjXs_-CoI",
  authDomain: "mhaexplorer-ac7a7.firebaseapp.com",
  databaseURL: "https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mhaexplorer-ac7a7",
  storageBucket: "mhaexplorer-ac7a7.appspot.com",
  messagingSenderId: "692744600959",
  appId: "1:692744600959:web:7feb3b2f9f24c21fe22e4a"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- Constants ---
const TEMP_BOOST_DURATION_MS = 90 * 1000;
const AD_COOLDOWN_MS = 3 * 60 * 1000;
const AD_BOOST_MULTIPLIER = 3;
const REFERRAL_BONUS = 100;
const DAILY_REWARD = 50;
const SAVE_THROTTLE_MS = 5000;
const COMBO_WINDOW_MS = 2000;
const POWERUP_DURATION_MS = 30 * 1000;
const SHIELD_DURATION_MS = 5 * 60 * 1000;

// --- State ---
let score = 0.00;
let tempMultiplier = 1;
let tempBoostExpiry = 0;
let isDataLoaded = false;
let lastLevel = null;
let isPaused = false;
let lastAdWatchTime = 0;
let lastSaveTime = 0;
let saveTimer = null;

// Combo
let comboCount = 0;
let lastCatchTime = 0;
let shieldExpiry = 0;

// Power-ups
let magnetExpiry = 0;
let x2Expiry = 0;

// Inventory (from Firebase)
let inventory = { magnet: 0, x2: 0, shield: 0 };

// Timers
let treasureSpawnInterval = null;
let bigTreasureSpawnInterval = null;
let giftSpawnInterval = null;
let powerupSpawnInterval = null;
let uiInterval = null;

// Daily
let lastDailyClaim = 0;

// Tutorial
const TUTORIAL_KEY = 'mha_tutorial_done';

// --- Telegram Init ---
(function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    const bg = tg.themeParams?.bg_color;
    if (bg) document.body.style.background = bg;
  } catch (e) { console.warn('Telegram init:', e); }
})();

// --- Levels & Biomes ---
const LEVELS = [
  { min: 0,       key: 'levelDrop',   icon: "💧", class: "level-1" },
  { min: 100000,  key: 'levelStream', icon: "🌊", class: "level-2" },
  { min: 200000,  key: 'levelRiver',  icon: "🏞️", class: "level-3" },
  { min: 300000,  key: 'levelLake',   icon: "🌅", class: "level-4" },
  { min: 500000,  key: 'levelSea',    icon: "🌊", class: "level-5" },
  { min: 1000000, key: 'levelOcean',  icon: "🐋", class: "level-6" },
  { min: 2000000, key: 'levelDepths', icon: "🦈", class: "level-7" },
  { min: 5000000, key: 'levelLegend', icon: "👑", class: "level-8" }
];

const BIOMES = {
  1: { bg: 0x020617, fog: 0x020617, bubble: 0x38bdf8 },
  2: { bg: 0x041e2e, fog: 0x041e2e, bubble: 0x22d3ee },
  3: { bg: 0x062e2e, fog: 0x062e2e, bubble: 0x10b981 },
  4: { bg: 0x0a2f1f, fog: 0x0a2f1f, bubble: 0x4ade80 },
  5: { bg: 0x0a1e3d, fog: 0x0a1e3d, bubble: 0x60a5fa },
  6: { bg: 0x1a0f3d, fog: 0x1a0f3d, bubble: 0xa78bfa },
  7: { bg: 0x3d0a1a, fog: 0x3d0a1a, bubble: 0xf87171 },
  8: { bg: 0x3d2a05, fog: 0x3d2a05, bubble: 0xfbbf24 }
};

function getLevel(s) {
  let cur = LEVELS[0];
  for (const lv of LEVELS) { if (s >= lv.min) cur = lv; else break; }
  return cur;
}
function getNextLevel(s) {
  for (const lv of LEVELS) { if (s < lv.min) return lv; }
  return null;
}
function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return Math.floor(n).toString();
}

// --- Adsgram ---
let AdController = null;
let adsgramReady = false;
function initAdsgram() {
  if (typeof window.Adsgram === 'undefined') return false;
  try {
    AdController = window.Adsgram.init({ blockId: "48760" });
    adsgramReady = true;
    return true;
  } catch (e) { return false; }
}
setTimeout(initAdsgram, 2000);

async function showRewardedAd() {
  if (adsgramReady && AdController) {
    try { await AdController.show(); return { success: true }; }
    catch (e) { console.warn('Adsgram failed:', e); }
  }
  return { success: false };
}

// --- User ---
function getUserId() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u && u.id) return u.id.toString();
  let guest = localStorage.getItem('mha_guest_id');
  if (!guest) {
    guest = 'GUEST_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('mha_guest_id', guest);
  }
  return guest;
}
function getUserName() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u) return (u.first_name || '') + (u.last_name ? ' ' + u.last_name : '');
  return 'Guest';
}
function getReferrerId() {
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return sp ? sp.toString() : null;
}

// --- Auto Register ---
async function autoRegisterUser() {
  const userId = getUserId();
  if (!userId) return;
  const userRef = db.ref('players/' + userId);
  try {
    const snap = await userRef.once('value');
    if (!snap.exists()) {
      await userRef.set({
        score: 0,
        name: getUserName(),
        joinedAt: Date.now(),
        lastActive: Date.now(),
        referredBy: null,
        referredByProcessed: false,
        unclaimedRefBonus: 0,
        successfulRefsCount: 0,
        lastDailyClaim: 0,
        powerups: { magnet: 0, x2: 0, shield: 0 }
      });
      const referrerId = getReferrerId();
      if (referrerId && referrerId !== userId) {
        await userRef.update({ referredBy: referrerId, referredByProcessed: true });
        await db.ref('players/' + referrerId + '/unclaimedRefBonus').transaction(c => (c || 0) + REFERRAL_BONUS);
        await db.ref('players/' + referrerId + '/successfulRefsCount').transaction(c => (c || 0) + 1);
      }
    } else {
      userRef.update({ lastActive: Date.now(), name: getUserName() });
    }
  } catch (e) { console.warn('autoRegister:', e); }
}

// --- Save (Throttled) ---
function scheduleSave() {
  if (saveTimer) return;
  const elapsed = Date.now() - lastSaveTime;
  const wait = Math.max(0, SAVE_THROTTLE_MS - elapsed);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToFirebase();
  }, wait);
}

function saveToFirebase() {
  if (!isDataLoaded) return;
  const userId = getUserId();
  if (!userId) return;
  lastSaveTime = Date.now();
  try { localStorage.setItem('mha_offline_score', score.toString()); } catch (e) {}
  db.ref('players/' + userId).update({ score, lastActive: Date.now() })
    .catch(e => console.warn('save failed:', e));
}

// --- Load ---
async function loadUserData() {
  await autoRegisterUser();
  const userId = getUserId();
  try {
    const snap = await db.ref('players/' + userId).once('value');
    const data = snap.val();
    if (data) {
      score = typeof data.score === 'number' ? data.score : 0;
      lastDailyClaim = data.lastDailyClaim || 0;
      // Load inventory
      if (data.powerups && typeof data.powerups === 'object') {
        inventory.magnet = data.powerups.magnet || 0;
        inventory.x2 = data.powerups.x2 || 0;
        inventory.shield = data.powerups.shield || 0;
      }
      // Check last purchase to show reward
      if (data.lastPurchase && !data.lastPurchase.shown) {
        showPurchaseReward(data.lastPurchase, userId);
      }
    } else {
      const cached = parseFloat(localStorage.getItem('mha_offline_score') || '0');
      if (cached > 0) score = cached;
    }
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.classList.add('hide');
    const status = document.getElementById('db-status');
    if (status) status.innerText = t('connected');
    updateUI();
    startAdCooldownTicker();
    checkPendingReferralBonuses(userId);
    checkDailyReward();
    maybeShowTutorial();
  } catch (e) {
    console.error(e);
    const cached = parseFloat(localStorage.getItem('mha_offline_score') || '0');
    if (cached > 0) score = cached;
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.classList.add('hide');
    const status = document.getElementById('db-status');
    if (status) status.innerText = t('offline');
    updateUI();
    startAdCooldownTicker();
  }
}
loadUserData();

function checkPendingReferralBonuses(userId) {
  db.ref('players/' + userId + '/unclaimedRefBonus').once('value').then(snap => {
    const amount = snap.val();
    if (amount && amount > 0) {
      score += amount;
      db.ref('players/' + userId + '/unclaimedRefBonus').remove();
      updateUI();
      saveToFirebase();
      SoundManager.gift();
      alert(t('refBonus', { n: amount }));
    }
  });
}

// --- Show Purchase Reward ---
function showPurchaseReward(purchase, userId) {
  // Mark as shown
  db.ref('players/' + userId + '/lastPurchase/shown').set(true);

  let title = '';
  let bigValue = '';
  let emoji = '🎁';

  if (purchase.type === 'box') {
    emoji = '📦';
    title = t('purchaseBox', { n: purchase.reward });
    bigValue = '+' + purchase.reward + ' MHA';
  } else if (purchase.type === 'powerup') {
    if (purchase.powerupType === 'magnet') {
      emoji = '🧲';
      title = (purchase.count > 1) ? t('purchaseMagnet5') : t('purchaseMagnet');
    } else if (purchase.powerupType === 'x2') {
      emoji = '⚡';
      title = t('purchaseX2');
    } else if (purchase.powerupType === 'shield') {
      emoji = '🛡️';
      title = t('purchaseShield');
    }
  } else if (purchase.type === 'bundle') {
    emoji = '🎁';
    title = t('purchaseMixed');
  } else if (purchase.type === 'pass') {
    emoji = '👑';
    title = t('purchasePass');
  } else if (purchase.type === 'score') {
    emoji = '💎';
    title = t('purchaseBox', { n: purchase.reward });
    bigValue = '+' + purchase.reward + ' MHA';
  }

  // Show modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-card">
      <span class="modal-icon">${emoji}</span>
      <h2>${title}</h2>
      ${bigValue ? `<div class="purchase-reward-big">${bigValue}</div>` : ''}
      <button class="modal-btn" onclick="this.closest('.modal-overlay').remove()">OK</button>
    </div>
  `;
  document.body.appendChild(modal);
  SoundManager.gift();

  // Reload score/inventory after 1s
  setTimeout(() => {
    db.ref('players/' + userId).once('value').then(s => {
      const d = s.val();
      if (d) {
        if (typeof d.score === 'number') score = d.score;
        if (d.powerups) {
          inventory.magnet = d.powerups.magnet || 0;
          inventory.x2 = d.powerups.x2 || 0;
          inventory.shield = d.powerups.shield || 0;
        }
        updateUI();
      }
    });
  }, 1500);
}

// --- Daily Reward ---
function checkDailyReward() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (now - lastDailyClaim >= dayMs) {
    document.getElementById('daily-modal').classList.add('active');
  }
}

function claimDaily() {
  const now = Date.now();
  lastDailyClaim = now;
  score += DAILY_REWARD;
  updateUI();
  saveToFirebase();
  SoundManager.gift();
  db.ref('players/' + getUserId() + '/lastDailyClaim').set(now);
  document.getElementById('daily-modal').classList.remove('active');
  showFloatingText('+' + DAILY_REWARD + ' MHA 🎁');
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
  }
}

// --- Tutorial ---
function maybeShowTutorial() {
  if (!localStorage.getItem(TUTORIAL_KEY)) {
    setTimeout(() => document.getElementById('tut-modal').classList.add('active'), 700);
  }
}
function closeTutorial() {
  localStorage.setItem(TUTORIAL_KEY, '1');
  document.getElementById('tut-modal').classList.remove('active');
  SoundManager.click();
}

// --- Mute ---
function toggleMute() {
  const muted = SoundManager.toggle();
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.innerText = muted ? '🔇' : '🔊';
    btn.classList.toggle('muted', muted);
  }
}

// --- UI ---
function updateUI() {
  const scoreEl = document.getElementById('score-val');
  if (scoreEl) scoreEl.innerText = score.toFixed(2);

  const level = getLevel(score);
  const badge = document.getElementById('level-badge');
  const text = document.getElementById('level-text');
  if (badge && text) {
    badge.className = 'level-badge ' + level.class;
    text.innerText = t(level.key);
    const iconEl = badge.querySelector('.icon');
    if (iconEl) iconEl.innerText = level.icon;
  }

  const next = getNextLevel(score);
  const fill = document.getElementById('level-progress-fill');
  const pText = document.getElementById('level-progress-text');
  const pNext = document.getElementById('level-next-target');
  if (next && fill && pText) {
    const range = next.min - level.min;
    const progress = score - level.min;
    fill.style.width = Math.min(100, (progress / range) * 100) + '%';
    pText.innerText = formatNum(progress);
    if (pNext) pNext.innerText = formatNum(range);
  } else if (fill && pText) {
    fill.style.width = '100%';
    pText.innerText = t('maxLevel');
    if (pNext) pNext.innerText = '';
  }

  const rank = document.getElementById('rank-badge');
  if (rank) {
    const now = Date.now();
    if (tempMultiplier > 1 && now < tempBoostExpiry) {
      const s = Math.ceil((tempBoostExpiry - now) / 1000);
      rank.style.display = 'inline-block';
      rank.innerText = `🔥 ${tempMultiplier}x (${s}s)`;
    } else {
      rank.style.display = 'none';
    }
  }

  updatePowerupBar();
}

function updatePowerupBar() {
  const bar = document.getElementById('powerup-bar');
  if (!bar) return;
  const now = Date.now();
  let html = '';
  if (now < magnetExpiry) {
    const s = Math.ceil((magnetExpiry - now) / 1000);
    html += `<div class="powerup-chip magnet">🧲 ${s}s</div>`;
  }
  if (now < x2Expiry) {
    const s = Math.ceil((x2Expiry - now) / 1000);
    html += `<div class="powerup-chip x2">✨ ×2 ${s}s</div>`;
  }
  if (now < shieldExpiry) {
    const s = Math.ceil((shieldExpiry - now) / 1000);
    html += `<div class="powerup-chip">🛡️ ${s}s</div>`;
  }
  // Show inventory counts
  const inv = [];
  if (inventory.magnet > 0) inv.push(`🧲×${inventory.magnet}`);
  if (inventory.x2 > 0)     inv.push(`⚡×${inventory.x2}`);
  if (inventory.shield > 0) inv.push(`🛡️×${inventory.shield}`);
  if (inv.length) {
    html += `<div class="powerup-chip" style="font-size:11px;">${inv.join(' ')}</div>`;
  }
  bar.innerHTML = html;
}

function getEffectiveMultiplier() {
  const now = Date.now();
  let m = 1;
  if (tempMultiplier > 1 && now < tempBoostExpiry) m *= tempMultiplier;
  if (now < x2Expiry) m *= 2;
  if (now - lastCatchTime < COMBO_WINDOW_MS) {
    if (comboCount >= 10) m *= 2;
    else if (comboCount >= 5) m *= 1.5;
  }
  return m;
}

// ==========================================
// --- Pause ---
// ==========================================
function togglePause() {
  isPaused = !isPaused;
  const overlay = document.getElementById('pause-overlay');
  const btn = document.getElementById('pause-btn');

  if (isPaused) {
    stopSpawners();
    overlay?.classList.add('active');
    if (btn) { btn.innerText = '▶️'; btn.classList.add('is-active'); }
  } else {
    startSpawners();
    overlay?.classList.remove('active');
    if (btn) { btn.innerText = '⏸️'; btn.classList.remove('is-active'); }
  }
  SoundManager.click();
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
  }
}

function stopSpawners() {
  if (treasureSpawnInterval)    { clearInterval(treasureSpawnInterval);    treasureSpawnInterval = null; }
  if (bigTreasureSpawnInterval) { clearInterval(bigTreasureSpawnInterval); bigTreasureSpawnInterval = null; }
  if (giftSpawnInterval)        { clearInterval(giftSpawnInterval);        giftSpawnInterval = null; }
  if (powerupSpawnInterval)     { clearInterval(powerupSpawnInterval);     powerupSpawnInterval = null; }
}

function startSpawners() {
  if (!treasureSpawnInterval)    treasureSpawnInterval    = setInterval(() => spawnTreasure(false), 800);
  if (!bigTreasureSpawnInterval) bigTreasureSpawnInterval = setInterval(() => spawnTreasure(true), 5000);
  if (!giftSpawnInterval)        giftSpawnInterval        = setInterval(() => maybeSpawnGift(), 12000);
  if (!powerupSpawnInterval)     powerupSpawnInterval     = setInterval(() => maybeSpawnPowerup(), 15000);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('button, input')) {
    e.preventDefault();
    togglePause();
  }
});

// ==========================================
// --- Ads ---
// ==========================================
async function watchTimedAd() {
  if (isPaused) return;
  const now = Date.now();
  if (now - lastAdWatchTime < AD_COOLDOWN_MS) {
    const r = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    const m = Math.floor(r / 60000), s = Math.floor((r % 60000) / 1000);
    alert(`${t('adWait')} ${m}:${s.toString().padStart(2, '0')} ${t('adBefore')}`);
    return;
  }
  const btn = document.getElementById('ad-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await showRewardedAd();
    if (result.success) {
      lastAdWatchTime = Date.now();
      localStorage.setItem('mha_last_ad', lastAdWatchTime.toString());
      tempMultiplier = AD_BOOST_MULTIPLIER;
      tempBoostExpiry = Date.now() + TEMP_BOOST_DURATION_MS;
      updateUI();
      SoundManager.powerup();
      alert(t('adBoost'));
      setTimeout(() => { tempMultiplier = 1; tempBoostExpiry = 0; updateUI(); }, TEMP_BOOST_DURATION_MS);
    } else {
      alert(t('adNoAds'));
    }
  } catch (e) { alert(t('adError')); }
  finally { if (btn) btn.disabled = false; }
}

function startAdCooldownTicker() {
  const stored = parseInt(localStorage.getItem('mha_last_ad') || '0');
  if (stored && stored > lastAdWatchTime) lastAdWatchTime = stored;

  const cd = document.getElementById('ad-cooldown');
  const btn = document.getElementById('ad-btn');
  if (!cd || !btn) return;
  setInterval(() => {
    const now = Date.now();
    const r = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    if (r > 0 && lastAdWatchTime > 0) {
      const m = Math.floor(r / 60000), s = Math.floor((r % 60000) / 1000);
      cd.style.display = 'block';
      cd.innerText = `${m}:${s.toString().padStart(2, '0')}`;
      btn.disabled = true;
    } else {
      cd.style.display = 'none';
      btn.disabled = false;
    }
  }, 1000);
}

// ==========================================
// --- Three.js ---
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);
scene.fog = new THREE.FogExp2(0x020617, 0.03);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x38bdf8, 0.7));
const light = new THREE.DirectionalLight(0x38bdf8, 1.8);
light.position.set(5, 12, 10);
scene.add(light);

const grid = new THREE.GridHelper(100, 50, 0x0c4a6e, 0x082f49);
grid.position.y = -1;
scene.add(grid);

// Bubbles
const bubbleGeo = new THREE.BufferGeometry();
const bubbleCount = 1000;
const bubblePositions = new Float32Array(bubbleCount * 3);
for (let i = 0; i < bubbleCount * 3; i += 3) {
  bubblePositions[i]     = (Math.random() - 0.5) * 100;
  bubblePositions[i + 1] = Math.random() * 40 - 5;
  bubblePositions[i + 2] = (Math.random() - 0.5) * 100;
}
bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
const bubbleMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.15, transparent: true, opacity: 0.6 });
const bubbleField = new THREE.Points(bubbleGeo, bubbleMat);
scene.add(bubbleField);

// Shark
const sharkGroup = new THREE.Group();
const bodyGeo = new THREE.ConeGeometry(0.6, 2, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2, emissive: 0x38bdf8, emissiveIntensity: 0.35 });
const sharkBody = new THREE.Mesh(bodyGeo, bodyMat);
sharkBody.rotation.x = Math.PI / 2;
sharkGroup.add(sharkBody);

const finGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
const finMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.25, emissive: 0x38bdf8, emissiveIntensity: 0.25 });
const sharkFin = new THREE.Mesh(finGeo, finMat);
sharkFin.position.set(0, 0.6, 0.3);
sharkFin.rotation.x = -Math.PI / 4;
sharkGroup.add(sharkFin);

sharkGroup.position.set(0, 0, 4);
scene.add(sharkGroup);

// Treasures
const treasures = [];
function spawnTreasure(isBig = false) {
  if (isPaused) return;
  const size = isBig ? 1.2 : 0.4;
  const color = isBig ? 0xf59e0b : 0x38bdf8;
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((Math.random() - 0.5) * 16, 0, -30);
  mesh.userData = { isBig, speed: 0.15 + Math.random() * 0.1, floatOffset: Math.random() * Math.PI, type: 'pearl' };
  scene.add(mesh);
  treasures.push(mesh);
}

// Gift Boxes
function maybeSpawnGift() {
  if (isPaused) return;
  if (Math.random() > 0.6) return;
  const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((Math.random() - 0.5) * 14, 0, -30);
  mesh.userData = { type: 'gift', speed: 0.22, rot: 0.03 };
  scene.add(mesh);
  treasures.push(mesh);
}

// Power-ups
function maybeSpawnPowerup() {
  if (isPaused) return;
  if (Math.random() > 0.7) return;
  const type = Math.random() < 0.5 ? 'magnet' : 'x2';
  const color = type === 'magnet' ? 0xf472b6 : 0xf59e0b;
  const geo = new THREE.OctahedronGeometry(0.8, 0);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.0, metalness: 0.7, roughness: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((Math.random() - 0.5) * 14, 0, -30);
  mesh.userData = { type: 'powerup', powerType: type, speed: 0.25, rot: 0.05 };
  scene.add(mesh);
  treasures.push(mesh);
}

startSpawners();

// Particles
const particles = [];
function createBubbleBurst(position, colorHex) {
  const pCount = 15;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount * 3);
  const velocities = [];
  for (let i = 0; i < pCount; i++) {
    positions[i * 3]     = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    velocities.push({ x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3, z: (Math.random() - 0.5) * 0.3 });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({ color: colorHex, size: 0.2, transparent: true, opacity: 1 });
  const pSystem = new THREE.Points(pGeo, pMat);
  scene.add(pSystem);
  particles.push({ system: pSystem, velocities, life: 1.0 });
}

camera.position.set(0, 6, 10);
camera.lookAt(0, 0, 0);

let targetTilt = 0;
function moveShark(dx, dz) {
  if (isPaused) return;
  sharkGroup.position.x = Math.max(-8, Math.min(8, sharkGroup.position.x + dx));
  sharkGroup.position.z = Math.max(-2, Math.min(6, sharkGroup.position.z + dz));
  targetTilt = -dx * 0.6;
}

const bindBtn = (id, dx, dz) => {
  const el = document.getElementById(id);
  if (!el) return;
  const h = (e) => { e.preventDefault(); moveShark(dx, dz); };
  el.addEventListener('touchstart', h, { passive: false });
  el.addEventListener('click', h);
};
bindBtn('btn-up', 0, -0.5);
bindBtn('btn-down', 0, 0.5);
bindBtn('btn-left', -0.5, 0);
bindBtn('btn-right', 0.5, 0);

function showFloatingText(text, color) {
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.innerText = text;
  if (color) el.style.color = color;
  el.style.left = (window.innerWidth / 2) + 'px';
  el.style.top = (window.innerHeight / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function showCombo(n) {
  const el = document.createElement('div');
  el.className = 'combo-indicator';
  el.innerText = '🔥 COMBO ×' + n;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function applyBiome(levelIndex) {
  const biome = BIOMES[levelIndex] || BIOMES[1];
  scene.background = new THREE.Color(biome.bg);
  scene.fog.color.setHex(biome.fog);
  bubbleMat.color.setHex(biome.bubble);
}

// --- Catch handler ---
function onCatch(t) {
  const now = Date.now();

  if (now - lastCatchTime < COMBO_WINDOW_MS) {
    comboCount++;
  } else {
    comboCount = 1;
  }
  lastCatchTime = now;
  if (comboCount === 5 || comboCount === 10) {
    SoundManager.combo(comboCount);
    showCombo(comboCount);
  }

  const eff = getEffectiveMultiplier();

  if (t.userData.type === 'gift') {
    const roll = Math.random();
    let reward = 0;
    if (roll < 0.5) reward = 10;
    else if (roll < 0.8) reward = 50;
    else if (roll < 0.95) reward = 100;
    else reward = 250;
    score += reward;
    SoundManager.gift();
    showFloatingText('🎁 +' + reward + ' MHA', '#fbbf24');
    createBubbleBurst(t.position, 0xfbbf24);
  } else if (t.userData.type === 'powerup') {
    if (t.userData.powerType === 'magnet') {
      magnetExpiry = now + POWERUP_DURATION_MS;
      showFloatingText('🧲 ON!', '#f472b6');
    } else {
      x2Expiry = now + POWERUP_DURATION_MS;
      showFloatingText('✨ ×2 ON!', '#f59e0b');
    }
    SoundManager.powerup();
    createBubbleBurst(t.position, t.userData.powerType === 'magnet' ? 0xf472b6 : 0xf59e0b);
  } else {
    const reward = t.userData.isBig ? (1.0 * eff) : (0.01 * eff);
    score += reward;
    if (t.userData.isBig) {
      SoundManager.bigBite();
      showFloatingText('+' + (1.0 * eff).toFixed(2) + ' MHA 🌟');
      createBubbleBurst(t.position, 0xf59e0b);
    } else {
      SoundManager.smallBite();
      createBubbleBurst(t.position, 0x38bdf8);
    }
  }

  updateUI();
  scheduleSave();

  const newLevel = getLevel(score);
  if (lastLevel && newLevel.min > lastLevel.min) {
    const idx = LEVELS.indexOf(newLevel) + 1;
    applyBiome(idx);
    SoundManager.levelUp();
    showFloatingText('🎉 ' + newLevel.icon + ' ' + t(newLevel.key) + '!');
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
  }
  lastLevel = newLevel;
}

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);

  if (isPaused) {
    renderer.render(scene, camera);
    return;
  }

  grid.position.z += 0.1;
  if (grid.position.z > 2) grid.position.z = 0;

  const sp = bubbleField.geometry.attributes.position.array;
  for (let i = 2; i < bubbleCount * 3; i += 3) {
    sp[i] += 0.2;
    if (sp[i] > 10) sp[i] = -90;
  }
  bubbleField.geometry.attributes.position.needsUpdate = true;

  sharkGroup.rotation.z += (targetTilt - sharkGroup.rotation.z) * 0.1;
  targetTilt *= 0.9;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.04;
    p.system.material.opacity = p.life;
    const pp = p.system.geometry.attributes.position.array;
    for (let j = 0; j < p.velocities.length; j++) {
      pp[j * 3]     += p.velocities[j].x;
      pp[j * 3 + 1] += p.velocities[j].y;
      pp[j * 3 + 2] += p.velocities[j].z;
    }
    p.system.geometry.attributes.position.needsUpdate = true;
    if (p.life <= 0) { scene.remove(p.system); particles.splice(i, 1); }
  }

  const magnetActive = Date.now() < magnetExpiry;

  for (let i = treasures.length - 1; i >= 0; i--) {
    const t = treasures[i];
    t.position.z += t.userData.speed;
    t.rotation.x += t.userData.rot || 0.02;
    t.rotation.y += t.userData.rot || 0.02;

    if (t.userData.isBig) t.position.y = Math.sin(Date.now() * 0.005 + t.userData.floatOffset) * 0.3;
    if (t.userData.type === 'gift') t.position.y = Math.sin(Date.now() * 0.003) * 0.4;

    if (magnetActive && t.userData.type === 'pearl') {
      const dx = sharkGroup.position.x - t.position.x;
      const dy = sharkGroup.position.y - t.position.y;
      const dz = sharkGroup.position.z - t.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 9 && dist > 0.5) {
        t.position.x += dx / dist * 0.15;
        t.position.y += dy / dist * 0.15;
        t.position.z += dz / dist * 0.15;
      }
    }

    if (sharkGroup.position.distanceTo(t.position) < 1.2) {
      onCatch(t);
      scene.remove(t);
      treasures.splice(i, 1);
      continue;
    }
    if (t.position.z > 8) { scene.remove(t); treasures.splice(i, 1); }
  }

  renderer.render(scene, camera);
}
animate();

// UI tick
uiInterval = setInterval(() => {
  if (!isPaused) updateUI();
}, 500);

// Initialize mute button state
(function initMuteBtn() {
  const btn = document.getElementById('mute-btn');
  if (btn && SoundManager.isMuted()) {
    btn.innerText = '🔇';
    btn.classList.add('muted');
  }
})();

// Save on unload
window.addEventListener('beforeunload', () => { if (!isPaused) saveToFirebase(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isPaused) {
    togglePause();
    saveToFirebase();
  }
});

// Set initial level reference
setTimeout(() => { lastLevel = getLevel(score); }, 1500);

// ==========================================
// 🛒 Store (Powerups + Boxes)
// ==========================================
const STORE_ITEMS = [
  { id: 'magnet_60' },
  { id: 'boost_x2' },
  { id: 'shield_combo' },
  { id: 'box_bronze' },
  { id: 'box_silver' },
  { id: 'box_gold' },
  { id: 'box_magnet5' },
  { id: 'box_mixed' },
  { id: 'pass_monthly' }
];

// Product metadata (title/desc keys + price for display)
const STORE_META = {
  'magnet_60':    { icon: '🧲', titleKey: 'prod_magnet_60',    descKey: 'prod_magnet_60_desc',    price: 2  },
  'boost_x2':     { icon: '⚡', titleKey: 'prod_boost_x2',     descKey: 'prod_boost_x2_desc',     price: 2  },
  'shield_combo': { icon: '🛡️', titleKey: 'prod_shield_combo', descKey: 'prod_shield_combo_desc', price: 5  },
  'box_bronze':   { icon: '💎', titleKey: 'prod_box_bronze',   descKey: 'prod_box_bronze_desc',   price: 5  },
  'box_silver':   { icon: '💠', titleKey: 'prod_box_silver',   descKey: 'prod_box_silver_desc',   price: 10  },
  'box_gold':     { icon: '👑', titleKey: 'prod_box_gold',     descKey: 'prod_box_gold_desc',     price: 25 },
  'box_magnet5':  { icon: '📦', titleKey: 'prod_box_magnet5',  descKey: 'prod_box_magnet5_desc',  price: 5  },
  'box_mixed':    { icon: '🎁', titleKey: 'prod_box_mixed',    descKey: 'prod_box_mixed_desc',    price: 10 },
  'pass_monthly': { icon: '👑', titleKey: 'prod_pass_monthly', descKey: 'prod_pass_monthly_desc', price: 50 }
};

function renderStore() {
  const grid = document.getElementById('store-grid');
  if (!grid) return;
  grid.innerHTML = STORE_ITEMS.map(item => {
    const meta = STORE_META[item.id];
    return `
      <div class="store-item" onclick="buyProduct('${item.id}')">
        <div class="si-icon">${meta.icon}</div>
        <div class="si-body">
          <div class="si-title">${t(meta.titleKey)}</div>
          <div class="si-desc">${t(meta.descKey)}</div>
        </div>
        <div class="si-price">
          <div class="num">${meta.price}</div>
          <div class="lbl">${t('priceLabel')}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openStore() {
  SoundManager.click();
  renderStore();
  document.getElementById('store-modal').classList.add('active');
}

function closeStore() {
  SoundManager.click();
  document.getElementById('store-modal').classList.remove('active');
}

async function buyProduct(productId) {
  SoundManager.click();
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData;

  if (!tg || !tg.openInvoice || !initData) {
    alert(t('payNotTg'));
    return;
  }

  const payModal = document.getElementById('pay-modal');
  if (payModal) payModal.classList.add('active');

  try {
    const res = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, initData, lang: getLang() })
    });
    const data = await res.json();

    if (payModal) payModal.classList.remove('active');

    if (!data.url) {
      alert('❌ ' + (data.error || t('payError')));
      return;
    }

    tg.openInvoice(data.url, (status) => {
      if (status === 'paid') {
        SoundManager.gift();
        alert(t('paySuccess'));
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        setTimeout(() => location.reload(), 1500);
      } else if (status === 'failed') {
        alert(t('payFail'));
      }
    });
  } catch (e) {
    console.error(e);
    if (payModal) payModal.classList.remove('active');
    alert(t('payNetErr'));
  }
}
