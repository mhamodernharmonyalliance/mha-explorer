/* ==========================================
   MHASpace v5 - Economic Redesign
   8 Levels + Shark Colors + Star Packs
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

let comboCount = 0;
let lastCatchTime = 0;
let shieldExpiry = 0;
let magnetExpiry = 0;
let x2Expiry = 0;
let x5Expiry = 0;

let inventory = { magnet: 0, x2: 0, shield: 0 };

let treasureSpawnInterval = null;
let bigTreasureSpawnInterval = null;
let giftSpawnInterval = null;
let powerupSpawnInterval = null;
let uiInterval = null;

let lastDailyClaim = 0;
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

// --- Levels & Shark Colors ---
const LEVELS = [
  { min: 0,     key: 'levelDrop',     icon: "💧", class: "level-1", shark: 'silver'   },
  { min: 20000, key: 'levelBronze',   icon: "🥉", class: "level-2", shark: 'bronze'   },
  { min: 38000, key: 'levelPlatinum', icon: "🥈", class: "level-3", shark: 'platinum' },
  { min: 54000, key: 'levelGold',     icon: "🥇", class: "level-4", shark: 'gold'     },
  { min: 68000, key: 'levelEmerald',  icon: "💚", class: "level-5", shark: 'emerald'  },
  { min: 80000, key: 'levelSapphire', icon: "💙", class: "level-6", shark: 'sapphire' },
  { min: 90000, key: 'levelAmethyst', icon: "💜", class: "level-7", shark: 'amethyst' },
  { min: 98000, key: 'levelDiamond',  icon: "💎", class: "level-8", shark: 'diamond'  }
];

const BIOMES = {
  1: { bg: 0x020617, fog: 0x020617, bubble: 0xcbd5e1 },
  2: { bg: 0x1f0f05, fog: 0x1f0f05, bubble: 0xcd7f32 },
  3: { bg: 0x1a1a1a, fog: 0x1a1a1a, bubble: 0xe5e7eb },
  4: { bg: 0x2a1f05, fog: 0x2a1f05, bubble: 0xffd700 },
  5: { bg: 0x052e1a, fog: 0x052e1a, bubble: 0x10b981 },
  6: { bg: 0x052a4a, fog: 0x052a4a, bubble: 0x3b82f6 },
  7: { bg: 0x1a0a2e, fog: 0x1a0a2e, bubble: 0x8b5cf6 },
  8: { bg: 0x0a1a2a, fog: 0x0a1a2a, bubble: 0x67e8f9 }
};

const SHARK_COLORS = {
  silver:   { body: 0xcbd5e1, emissive: 0x38bdf8, fin: 0xe2e8f0 },
  bronze:   { body: 0xcd7f32, emissive: 0xf59e0b, fin: 0xb87333 },
  platinum: { body: 0xe5e7eb, emissive: 0xffffff, fin: 0xf3f4f6 },
  gold:     { body: 0xffd700, emissive: 0xfbbf24, fin: 0xffe97a },
  emerald:  { body: 0x10b981, emissive: 0x34d399, fin: 0x6ee7b7 },
  sapphire: { body: 0x3b82f6, emissive: 0x60a5fa, fin: 0x93c5fd },
  amethyst: { body: 0x8b5cf6, emissive: 0xa78bfa, fin: 0xc4b5fd },
  diamond:  { body: 0xf0f9ff, emissive: 0x67e8f9, fin: 0xffffff }
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
    AdController = window.Adsgram.init({ blockId: "0" });
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
        activeBuffs: {}
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

// --- Save ---
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

      // استرجع الـ Buffs النشطة
      if (data.activeBuffs && typeof data.activeBuffs === 'object') {
        const now = Date.now();
        if (data.activeBuffs.magnet > now) magnetExpiry = data.activeBuffs.magnet;
        if (data.activeBuffs.x2 > now)     x2Expiry = data.activeBuffs.x2;
        if (data.activeBuffs.x5 > now)     { x5Expiry = data.activeBuffs.x5; tempMultiplier = 5; tempBoostExpiry = data.activeBuffs.x5; }
        if (data.activeBuffs.shield > now) shieldExpiry = data.activeBuffs.shield;
      }

      // آخر شراء غير معروض
      if (data.lastPurchase && !data.lastPurchase.shown) {
        db.ref('players/' + userId + '/lastPurchase/shown').set(true);
        applyPurchaseBuffs(data.lastPurchase);
        setTimeout(() => showPackReward(data.lastPurchase), 800);
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

    // 🎨 طبّق لون القرش الحالي
    const currentLevel = getLevel(score);
    updateSharkColor(currentLevel.key);
    applyBiome(LEVELS.indexOf(currentLevel) + 1);

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

// ⏰ مؤقت أمان
setTimeout(() => {
  const s = document.getElementById('splash-loader');
  if (s && !s.classList.contains('hide')) {
    s.classList.add('hide');
    setTimeout(() => s?.remove(), 500);
  }
}, 6000);

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

// --- 🎁 Apply Purchase Buffs ---
function applyPurchaseBuffs(purchase) {
  if (!purchase || !purchase.buffs) return;
  const now = Date.now();

  if (purchase.buffs.magnet) {
    magnetExpiry = Math.max(magnetExpiry, now) + purchase.buffs.magnet;
    db.ref('players/' + getUserId() + '/activeBuffs/magnet').set(magnetExpiry);
  }
  if (purchase.buffs.x2) {
    x2Expiry = Math.max(x2Expiry, now) + purchase.buffs.x2;
    db.ref('players/' + getUserId() + '/activeBuffs/x2').set(x2Expiry);
  }
  if (purchase.buffs.x5) {
    x5Expiry = Math.max(x5Expiry, now) + purchase.buffs.x5;
    tempMultiplier = 5;
    tempBoostExpiry = x5Expiry;
    db.ref('players/' + getUserId() + '/activeBuffs/x5').set(x5Expiry);
  }
  if (purchase.buffs.shield) {
    shieldExpiry = Math.max(shieldExpiry, now) + purchase.buffs.shield;
    db.ref('players/' + getUserId() + '/activeBuffs/shield').set(shieldExpiry);
  }

  updateUI();
  SoundManager.powerup();
}

function showPackReward(purchase) {
  const mha = purchase.mha || 0;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-card">
      <span class="modal-icon">🎉</span>
      <h2>${t('packSuccess')}</h2>
      <div class="purchase-reward-big">+${mha.toLocaleString()} MHA</div>
      <p>${t('buffsActivated')}</p>
      <button class="modal-btn" onclick="this.closest('.modal-overlay').remove()">${t('ok')}</button>
    </div>
  `;
  document.body.appendChild(modal);
  SoundManager.gift();
}

// --- Daily ---
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

// --- Pause ---
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

// --- Ads ---
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

// 🎨 Update shark color by level
function updateSharkColor(levelKey) {
  const level = LEVELS.find(l => l.key === levelKey) || LEVELS[0];
  const colors = SHARK_COLORS[level.shark] || SHARK_COLORS.silver;

  bodyMat.color.setHex(colors.body);
  bodyMat.emissive.setHex(colors.emissive);
  finMat.color.setHex(colors.fin);
  finMat.emissive.setHex(colors.emissive);

  bodyMat.needsUpdate = true;
  finMat.needsUpdate = true;
}

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
    updateSharkColor(newLevel.key);  // 🎨 تغيير لون القرش
    SoundManager.levelUp();
    showFloatingText('🎉 ' + newLevel.icon + ' ' + t(newLevel.key) + '!');
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
  }
  lastLevel = newLevel;
}

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

uiInterval = setInterval(() => {
  if (!isPaused) updateUI();
}, 500);

(function initMuteBtn() {
  const btn = document.getElementById('mute-btn');
  if (btn && SoundManager.isMuted()) {
    btn.innerText = '🔇';
    btn.classList.add('muted');
  }
})();

window.addEventListener('beforeunload', () => { if (!isPaused) saveToFirebase(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isPaused) {
    togglePause();
    saveToFirebase();
  }
});

setTimeout(() => { lastLevel = getLevel(score); }, 1500);

// ==========================================
// 🛒 Store
// ==========================================
const STORE_ITEMS = [
  { id: 'starter_pack' },
  { id: 'boost_pack' },
  { id: 'power_pack' },
  { id: 'shield_pack' },
  { id: 'pro_pack' },
  { id: 'elite_pack' },
  { id: 'mega_pack' }
];

const STORE_META = {
  'starter_pack': { icon: '📦', titleKey: 'prod_starter_pack', descKey: 'prod_starter_pack_desc', price: 5 },
  'boost_pack':   { icon: '⚡', titleKey: 'prod_boost_pack',   descKey: 'prod_boost_pack_desc',   price: 10 },
  'power_pack':   { icon: '🔥', titleKey: 'prod_power_pack',   descKey: 'prod_power_pack_desc',   price: 15 },
  'shield_pack':  { icon: '🛡️', titleKey: 'prod_shield_pack',  descKey: 'prod_shield_pack_desc',  price: 20 },
  'pro_pack':     { icon: '💎', titleKey: 'prod_pro_pack',     descKey: 'prod_pro_pack_desc',     price: 30 },
  'elite_pack':   { icon: '👑', titleKey: 'prod_elite_pack',   descKey: 'prod_elite_pack_desc',   price: 50 },
  'mega_pack':    { icon: '🏆', titleKey: 'prod_mega_pack',    descKey: 'prod_mega_pack_desc',    price: 100 }
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
