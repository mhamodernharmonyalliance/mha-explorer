/* ==========================================
   MHASpace - Ad-Only Edition (No TON/Stars)
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
const maxCap = 7500000;
const TEMP_BOOST_DURATION_MS = 90 * 1000;  // 90 ثانية
const AD_COOLDOWN_MS = 3 * 60 * 1000;      // 3 دقائق
const AD_BOOST_MULTIPLIER = 3;             // 3x
let lastAdWatchTime = 0;

// --- Adsgram ---
let AdController = null;
if (window.Adsgram) {
  AdController = window.Adsgram.init({ blockId: "48760" });
}

// --- User ID ---
function getUserId() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u && u.id) return u.id.toString();
  return "GUEST_USER";
}

function getReferrerId() {
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return sp ? sp.toString() : null;
}

// --- Firebase Save/Load ---
function saveToFirebase() {
  if (!isDataLoaded) return;
  const userId = getUserId();
  if (!userId || userId === "GUEST_USER") return;
  db.ref('players/' + userId).update({
    score: score,
    multiplier: 1,
    lastActive: Date.now()
  });
}

function loadUserDataFromFirebase() {
  const userId = getUserId();
  db.ref('players/' + userId).once('value').then((snap) => {
    const data = snap.val();
    if (data) {
      score = typeof data.score === 'number' ? data.score : 0.00;
    }
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.style.display = 'none';
    const dbStatus = document.getElementById('db-status');
    if (dbStatus) dbStatus.innerText = 'متصل ✓';
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
loadUserDataFromFirebase();

// --- Referral ---
function processReferralBonus() {
  const currentUserId = getUserId();
  const referrerId = getReferrerId();
  if (!referrerId || referrerId === currentUserId) return;
  const refCheckRef = db.ref('players/' + currentUserId + '/referredByProcessed');
  refCheckRef.once('value').then((snap) => {
    if (!snap.exists() || !snap.val()) {
      db.ref('players/' + referrerId + '/unclaimedRefBonus').transaction(c => (c || 0) + 100);
      db.ref('players/' + referrerId + '/successfulRefsCount').transaction(c => (c || 0) + 1);
      refCheckRef.set(true);
      db.ref('players/' + currentUserId + '/referredBy').set(referrerId);
    }
  });
}

function checkPendingReferralBonuses(userId) {
  const bonusRef = db.ref('players/' + userId + '/unclaimedRefBonus');
  bonusRef.once('value').then((snap) => {
    const amount = snap.val();
    if (amount && amount > 0) {
      score = Math.min(maxCap, score + amount);
      bonusRef.remove();
      updateUI();
      saveToFirebase();
      alert('🎁 مفاجأة! حصلت على ' + amount + ' MHA مقابل إحالة ناجحة!');
    }
  });
}

// معالجة الإحالة عند التحميل
setTimeout(processReferralBonus, 1500);

// --- UI Update ---
function updateUI() {
  const scoreEl = document.getElementById('score-val');
  if (scoreEl) scoreEl.innerText = score.toFixed(2);

  const rankEl = document.getElementById('rank-badge');
  if (rankEl) {
    const now = Date.now();
    if (tempMultiplier > 1 && now < tempBoostExpiry) {
      const secsLeft = Math.ceil((tempBoostExpiry - now) / 1000);
      rankEl.classList.add('temp-boost');
      rankEl.innerText = `🔥 ${tempMultiplier}x (${secsLeft}ث)`;
    } else {
      rankEl.classList.remove('temp-boost');
      rankEl.innerText = 'مستوى القرش (1x)';
    }
  }

  const percentage = Math.min(100, (score / maxCap) * 100).toFixed(4);
  const progText = document.getElementById('progress-text');
  if (progText) progText.innerText = percentage;
  const progFill = document.getElementById('progress-fill');
  if (progFill) progFill.style.width = Math.max(1, percentage) + '%';
}

// --- Effective Multiplier ---
function getEffectiveMultiplier() {
  const now = Date.now();
  if (tempMultiplier > 1 && now < tempBoostExpiry) return tempMultiplier;
  return 1;
}

// --- Timed Ad ---
async function watchTimedAd() {
  const now = Date.now();
  if (now - lastAdWatchTime < AD_COOLDOWN_MS) {
    const remaining = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    alert(`⏳ انتظر ${mins}:${secs.toString().padStart(2, '0')} قبل إعلان جديد.`);
    return;
  }
  if (!AdController) {
    alert("⚠️ نظام الإعلانات غير متاح حالياً.");
    return;
  }
  const btn = document.getElementById('ad-btn');
  if (btn) btn.disabled = true;

  try {
    await AdController.show();
    lastAdWatchTime = Date.now();
    tempMultiplier = AD_BOOST_MULTIPLIER;
    tempBoostExpiry = Date.now() + TEMP_BOOST_DURATION_MS;
    updateUI();
    alert(`🎬 تعزيز ${AD_BOOST_MULTIPLIER}x فعال لمدة 90 ثانية! 🦈`);

    setTimeout(() => {
      tempMultiplier = 1;
      tempBoostExpiry = 0;
      updateUI();
    }, TEMP_BOOST_DURATION_MS);

    if (btn) btn.disabled = false;
  } catch (e) {
    console.warn("Ad skipped:", e);
    alert("يجب مشاهدة الإعلان حتى النهاية!");
    if (btn) btn.disabled = false;
  }
}

function startAdCooldownTicker() {
  const cdEl = document.getElementById('ad-cooldown');
  const adBtn = document.getElementById('ad-btn');
  if (!cdEl || !adBtn) return;
  setInterval(() => {
    const now = Date.now();
    const remaining = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    if (remaining > 0 && lastAdWatchTime > 0) {
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      cdEl.style.display = 'block';
      cdEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
      adBtn.disabled = true;
    } else {
      cdEl.style.display = 'none';
      adBtn.disabled = false;
    }
  }, 1000);
}

// ==========================================
// --- Three.js Engine (Deep Sea Shark) ---
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

scene.add(new THREE.AmbientLight(0x38bdf8, 0.6));
const light = new THREE.DirectionalLight(0x38bdf8, 1.5);
light.position.set(5, 12, 10);
scene.add(light);

const grid = new THREE.GridHelper(100, 50, 0x0284c7, 0x0f172a);
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

// 🦈 القرش
const sharkGroup = new THREE.Group();
const bodyGeo = new THREE.ConeGeometry(0.6, 2, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.4 });
const sharkBody = new THREE.Mesh(bodyGeo, bodyMat);
sharkBody.rotation.x = Math.PI / 2;
sharkGroup.add(sharkBody);

const finGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
const finMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
const sharkFin = new THREE.Mesh(finGeo, finMat);
sharkFin.position.set(0, 0.6, 0.3);
sharkFin.rotation.x = -Math.PI / 4;
sharkGroup.add(sharkFin);

sharkGroup.position.set(0, 0, 4);
scene.add(sharkGroup);

// الكنوز
const treasures = [];
function spawnTreasure(isBoss = false) {
  const size = isBoss ? 1.2 : 0.4;
  const color = isBoss ? 0xf59e0b : 0x38bdf8;
  const geo = new THREE.SphereGeometry(size, 16, 16);
  const mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((Math.random() - 0.5) * 16, 0, -30);
  mesh.userData = { isBoss: isBoss, speed: 0.15 + Math.random() * 0.1, floatOffset: Math.random() * Math.PI };
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
    velocities.push({
      x: (Math.random() - 0.5) * 0.3,
      y: (Math.random() - 0.5) * 0.3,
      z: (Math.random() - 0.5) * 0.3
    });
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
  const handler = (e) => { e.preventDefault(); moveShark(dx, dz); };
  el.addEventListener('touchstart', handler, { passive: false });
  el.addEventListener('click', handler);
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

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  grid.position.z += 0.1;
  if (grid.position.z > 2) grid.position.z = 0;

  const positions = bubbleField.geometry.attributes.position.array;
  for (let i = 2; i < bubbleCount * 3; i += 3) {
    positions[i] += 0.2;
    if (positions[i] > 10) positions[i] = -90;
  }
  bubbleField.geometry.attributes.position.needsUpdate = true;

  sharkGroup.rotation.z += (targetTilt - sharkGroup.rotation.z) * 0.1;
  targetTilt *= 0.9;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.04;
    p.system.material.opacity = p.life;
    const pPos = p.system.geometry.attributes.position.array;
    for (let j = 0; j < p.velocities.length; j++) {
      pPos[j * 3] += p.velocities[j].x;
      pPos[j * 3 + 1] += p.velocities[j].y;
      pPos[j * 3 + 2] += p.velocities[j].z;
    }
    p.system.geometry.attributes.position.needsUpdate = true;
    if (p.life <= 0) {
      scene.remove(p.system);
      particles.splice(i, 1);
    }
  }

  for (let i = treasures.length - 1; i >= 0; i--) {
    const t = treasures[i];
    t.position.z += t.userData.speed;
    t.rotation.x += 0.02;
    t.rotation.y += 0.02;
    if (t.userData.isBoss) {
      t.position.y = Math.sin(Date.now() * 0.005 + t.userData.floatOffset) * 0.3;
    }
    if (sharkGroup.position.distanceTo(t.position) < 1.2) {
      const effMult = getEffectiveMultiplier();
      const reward = t.userData.isBoss ? (1.0 * effMult) : (0.01 * effMult);
      score = Math.min(maxCap, score + reward);
      createBubbleBurst(t.position, t.userData.isBoss ? 0xf59e0b : 0x38bdf8);
      if (t.userData.isBoss) showFloatingText('قضمة! +' + (1.0 * effMult).toFixed(2) + ' MHA 🌟');
      updateUI();
      saveToFirebase();
      scene.remove(t);
      treasures.splice(i, 1);
      continue;
    }
    if (t.position.z > 8) {
      scene.remove(t);
      treasures.splice(i, 1);
    }
  }

  if (Date.now() % 1000 < 20) updateUI();
  renderer.render(scene, camera);
}
animate();
