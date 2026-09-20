/* ==========================================
   MHA Explorer - Silver Shark Edition
   Firebase + Adsgram + Levels (No TON)
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

// --- State ---
let score = 0.00;
let tempMultiplier = 1;
let tempBoostExpiry = 0;
let isDataLoaded = false;
let lastLevel = null;
const TEMP_BOOST_DURATION_MS = 90 * 1000;
const AD_COOLDOWN_MS = 3 * 60 * 1000;
const AD_BOOST_MULTIPLIER = 3;
const REFERRAL_BONUS = 100;
let lastAdWatchTime = 0;

// --- Levels (كل 100K) ---
const LEVELS = [
  { min: 0,       name: "قطرة",       icon: "💧", class: "level-1" },
  { min: 100000,  name: "جدول",       icon: "🌊", class: "level-2" },
  { min: 200000,  name: "نهر",        icon: "🏞️", class: "level-3" },
  { min: 300000,  name: "بحيرة",      icon: "🌅", class: "level-4" },
  { min: 500000,  name: "بحر",        icon: "🌊", class: "level-5" },
  { min: 1000000, name: "محيط",       icon: "🐋", class: "level-6" },
  { min: 2000000, name: "أعماق",      icon: "🦈", class: "level-7" },
  { min: 5000000, name: "أسطورة",     icon: "👑", class: "level-8" }
];

function getLevel(s) {
  let cur = LEVELS[0];
  for (const lv of LEVELS) { if (s >= lv.min) cur = lv; else break; }
  return cur;
}
function getNextLevel(s) {
  for (const lv of LEVELS) { if (s < lv.min) return lv; }
  return null;
}

// --- Adsgram ---
let AdController = null;
let adsgramReady = false;
function initAdsgram() {
  if (typeof window.Adsgram === 'undefined') { console.warn('⚠️ Adsgram SDK غير محمّل'); return false; }
  try {
    AdController = window.Adsgram.init({ blockId: "48760" });
    adsgramReady = true;
    console.log('✅ Adsgram جاهز');
    return true;
  } catch (e) { console.error('❌ فشل تهيئة Adsgram:', e); return false; }
}
setTimeout(initAdsgram, 2000);

async function showRewardedAd() {
  if (adsgramReady && AdController) {
    try {
      await AdController.show();
      return { success: true, network: 'adsgram' };
    } catch (e) { console.warn('Adsgram فشل:', e); }
  }
  return { success: false, network: null };
}

// --- User ---
function getUserId() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u && u.id) return u.id.toString();
  return "GUEST_USER";
}
function getUserName() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u) return (u.first_name || '') + ' ' + (u.last_name || '');
  return 'Guest';
}
function getReferrerId() {
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return sp ? sp.toString() : null;
}

// --- Auto Register ---
async function autoRegisterUser() {
  const userId = getUserId();
  if (!userId || userId === "GUEST_USER") return;
  const userRef = db.ref('players/' + userId);
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
      successfulRefsCount: 0
    });
    console.log('✅ مستخدم جديد');
    const referrerId = getReferrerId();
    if (referrerId && referrerId !== userId) {
      await userRef.update({ referredBy: referrerId, referredByProcessed: true });
      await db.ref('players/' + referrerId + '/unclaimedRefBonus').transaction(c => (c || 0) + REFERRAL_BONUS);
      await db.ref('players/' + referrerId + '/successfulRefsCount').transaction(c => (c || 0) + 1);
      console.log('🎁 مكافأة إحالة');
    }
  } else {
    userRef.update({ lastActive: Date.now() });
  }
}

// --- Load/Save ---
function saveToFirebase() {
  if (!isDataLoaded) return;
  const userId = getUserId();
  if (!userId || userId === "GUEST_USER") return;
  db.ref('players/' + userId).update({ score, lastActive: Date.now() });
}

async function loadUserData() {
  await autoRegisterUser();
  const userId = getUserId();
  db.ref('players/' + userId).once('value').then((snap) => {
    const data = snap.val();
    if (data) score = typeof data.score === 'number' ? data.score : 0;
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.style.display = 'none';
    const status = document.getElementById('db-status');
    if (status) status.innerText = 'متصل ✓';
    updateUI();
    checkPendingReferralBonuses(userId);
    startAdCooldownTicker();
  }).catch((e) => {
    console.error(e);
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.style.display = 'none';
  });
}
loadUserData();

function checkPendingReferralBonuses(userId) {
  const ref = db.ref('players/' + userId + '/unclaimedRefBonus');
  ref.once('value').then((snap) => {
    const amount = snap.val();
    if (amount && amount > 0) {
      score += amount;
      ref.remove();
      updateUI();
      saveToFirebase();
      alert('🎁 مفاجأة! حصلت على ' + amount + ' MHA مقابل إحالة ناجحة!');
    }
  });
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
    text.innerText = level.name;
    const iconEl = badge.querySelector('.icon');
    if (iconEl) iconEl.innerText = level.icon;
  }

  const next = getNextLevel(score);
  const fill = document.getElementById('level-progress-fill');
  const pText = document.getElementById('level-progress-text');
  if (next && fill && pText) {
    const range = next.min - level.min;
    const progress = score - level.min;
    fill.style.width = Math.min(100, (progress / range) * 100) + '%';
    pText.innerText = Math.floor(progress).toLocaleString();
  } else if (fill && pText) {
    fill.style.width = '100%';
    pText.innerText = 'أعلى مستوى!';
  }

  const rank = document.getElementById('rank-badge');
  if (rank) {
    const now = Date.now();
    if (tempMultiplier > 1 && now < tempBoostExpiry) {
      const s = Math.ceil((tempBoostExpiry - now) / 1000);
      rank.style.display = 'inline-block';
      rank.innerText = `🔥 ${tempMultiplier}x (${s}ث)`;
    } else {
      rank.style.display = 'none';
    }
  }
}

function getEffectiveMultiplier() {
  const now = Date.now();
  if (tempMultiplier > 1 && now < tempBoostExpiry) return tempMultiplier;
  return 1;
}

// --- Timed Ad ---
async function watchTimedAd() {
  const now = Date.now();
  if (now - lastAdWatchTime < AD_COOLDOWN_MS) {
    const r = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    const m = Math.floor(r / 60000), s = Math.floor((r % 60000) / 1000);
    alert(`⏳ انتظر ${m}:${s.toString().padStart(2, '0')} قبل إعلان جديد.`);
    return;
  }
  const btn = document.getElementById('ad-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await showRewardedAd();
    if (result.success) {
      lastAdWatchTime = Date.now();
      tempMultiplier = AD_BOOST_MULTIPLIER;
      tempBoostExpiry = Date.now() + TEMP_BOOST_DURATION_MS;
      updateUI();
      alert(`🎬 تعزيز ${AD_BOOST_MULTIPLIER}x فعال لمدة 90 ثانية!`);
      setTimeout(() => { tempMultiplier = 1; tempBoostExpiry = 0; updateUI(); }, TEMP_BOOST_DURATION_MS);
    } else {
      alert("⚠️ لا توجد إعلانات متاحة. جرب لاحقاً.");
    }
  } catch (e) { console.warn(e); alert("⚠️ خطأ. جرب مرة أخرى."); }
  finally { if (btn) btn.disabled = false; }
}

function startAdCooldownTicker() {
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
// --- Three.js (Deep Sea - Silver Shark) ---
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

// ✅ الشبكة (أغمق لتبرز الشخصية)
const grid = new THREE.GridHelper(100, 50, 0x0c4a6e, 0x082f49);
grid.position.y = -1;
scene.add(grid);

// فقاعات المحيط
const bubbleGeo = new THREE.BufferGeometry();
const bubbleCount = 1000;
const bubblePositions = new Float32Array(bubbleCount * 3);
for (let i = 0; i < bubbleCount * 3; i += 3) {
  bubblePositions[i] = (Math.random() - 0.5) * 100;
  bubblePositions[i + 1] = Math.random() * 40 - 5;
  bubblePositions[i + 2] = (Math.random() - 0.5) * 100;
}
bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
const bubbleMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.15, transparent: true, opacity: 0.6 });
const bubbleField = new THREE.Points(bubbleGeo, bubbleMat);
scene.add(bubbleField);

// 🦈 القرش الفضي
const sharkGroup = new THREE.Group();
const bodyGeo = new THREE.ConeGeometry(0.6, 2, 8);
// ✅ جسم القرش: فضي لامع + توهج سماوي
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0xcbd5e1,
  metalness: 0.9,
  roughness: 0.2,
  emissive: 0x38bdf8,
  emissiveIntensity: 0.35
});
const sharkBody = new THREE.Mesh(bodyGeo, bodyMat);
sharkBody.rotation.x = Math.PI / 2;
sharkGroup.add(sharkBody);

const finGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
// ✅ الزعنفة: فضي أفتح + توهج سماوي
const finMat = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  metalness: 0.8,
  roughness: 0.25,
  emissive: 0x38bdf8,
  emissiveIntensity: 0.25
});
const sharkFin = new THREE.Mesh(finGeo, finMat);
sharkFin.position.set(0, 0.6, 0.3);
sharkFin.rotation.x = -Math.PI / 4;
sharkGroup.add(sharkFin);

sharkGroup.position.set(0, 0, 4);
scene.add(sharkGroup);

// الكنوز (لآلئ)
const treasures = [];
function spawnTreasure(isBig = false) {
  const size = isBig ? 1.2 : 0.4;
  const color = isBig ? 0xf59e0b : 0x38bdf8;
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((Math.random() - 0.5) * 16, 0, -30);
  mesh.userData = { isBig, speed: 0.15 + Math.random() * 0.1, floatOffset: Math.random() * Math.PI };
  scene.add(mesh);
  treasures.push(mesh);
}
setInterval(() => spawnTreasure(false), 800);
setInterval(() => spawnTreasure(true), 5000);

// VFX
const particles = [];
function createBubbleBurst(position, colorHex) {
  const pCount = 15;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount * 3);
  const velocities = [];
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = position.x;
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

function showFloatingText(text) {
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.innerText = text;
  el.style.left = (window.innerWidth / 2) + 'px';
  el.style.top = (window.innerHeight / 2) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
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
      pp[j * 3] += p.velocities[j].x;
      pp[j * 3 + 1] += p.velocities[j].y;
      pp[j * 3 + 2] += p.velocities[j].z;
    }
    p.system.geometry.attributes.position.needsUpdate = true;
    if (p.life <= 0) { scene.remove(p.system); particles.splice(i, 1); }
  }

  for (let i = treasures.length - 1; i >= 0; i--) {
    const t = treasures[i];
    t.position.z += t.userData.speed;
    t.rotation.x += 0.02;
    t.rotation.y += 0.02;
    if (t.userData.isBig) t.position.y = Math.sin(Date.now() * 0.005 + t.userData.floatOffset) * 0.3;

    if (sharkGroup.position.distanceTo(t.position) < 1.2) {
      const eff = getEffectiveMultiplier();
      const reward = t.userData.isBig ? (1.0 * eff) : (0.01 * eff);
      score += reward;
      createBubbleBurst(t.position, t.userData.isBig ? 0xf59e0b : 0x38bdf8);
      if (t.userData.isBig) showFloatingText('قضمة! +' + (1.0 * eff).toFixed(2) + ' MHA 🌟');
      updateUI();
      saveToFirebase();

      const newLevel = getLevel(score);
      if (lastLevel && newLevel.min > lastLevel.min) {
        showFloatingText('🎉 ' + newLevel.icon + ' ' + newLevel.name + '!');
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
      lastLevel = newLevel;

      scene.remove(t);
      treasures.splice(i, 1);
      continue;
    }
    if (t.position.z > 8) { scene.remove(t); treasures.splice(i, 1); }
  }

  if (Date.now() % 1000 < 20) updateUI();
  renderer.render(scene, camera);
}
animate();
