/* ==========================================
   MHASpace - Deep Sea Shark Edition (Final)
   Firebase: mhaexplorer-ac7a7 (No Auth - Open Rules)
   TON Connect + Telegram Stars + Adsgram Boost
   ========================================== */

// --- Firebase Setup ---
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

let userWalletAddress = null;
let userWalletApp = null;
let score = 0.00;
let multiplier = 1;
let tempMultiplier = 1;
let tempBoostExpiry = 0;
let isPaused = false;
let isDataLoaded = false;
const maxCap = 7500000;
const RECEIVER_WALLET = "UQAqK_qhqpc_lMlh2SVmaqjbR4XfmkIhPdPVoUukb1aYHTG9";
const MANIFEST_URL = 'https://mha-explorer.mhaapp.workers.dev/tonconnect-manifest.json';
const TEMP_BOOST_DURATION_MS = 60 * 1000;
const AD_COOLDOWN_MS = 5 * 60 * 1000;
let lastAdWatchTime = 0;

// --- Adsgram Init ---
let AdController = null;
if (window.Adsgram) {
  AdController = window.Adsgram.init({ blockId: "48760" });
}

// --- User ID & Referral ---
function getUserId() {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (u && u.id) return u.id.toString();
  if (userWalletAddress) return userWalletAddress;
  return "GUEST_USER";
}

function getReferrerId() {
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  return sp ? sp.toString() : null;
}

// ==========================================
// --- TON Connect (Global Scope) ---
// ==========================================
window.tonConnectUI = null;
window.welcomeTonConnectUI = null;

// ✅ دالة فتح نافذة المحفظة (مُعرَّفة في app.js لضمان النطاق)
window.openTonModal = function() {
  console.log('🔵 زر TON تم الضغط عليه');
  console.log('window.tonConnectUI:', window.tonConnectUI);
  
  if (window.tonConnectUI && typeof window.tonConnectUI.openModal === 'function') {
    try {
      window.tonConnectUI.openModal();
      console.log('✅ تم استدعاء openModal');
    } catch (e) {
      console.error('❌ خطأ في openModal:', e);
      alert('خطأ: ' + e.message);
    }
  } else {
    alert('⚠️ نظام المحفظة لم يُحمّل بعد. انتظر ثانيتين ثم حاول مجدداً.');
  }
};

function initTonConnect() {
  if (typeof TON_CONNECT_UI === 'undefined') {
    console.error('TON Connect SDK لم يتم تحميله بعد. إعادة المحاولة...');
    setTimeout(initTonConnect, 500);
    return;
  }

  // زر TON Connect في الأعلى (يستخدم buttonRootId إن وُجد، وإلا نتجاهل)
  try {
    window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      buttonRootId: 'ton-connect-btn'
    });
    window.tonConnectUI.onStatusChange(handleWalletConnect);
    console.log('✅ TonConnect تم تهيئته بنجاح');
  } catch (e) {
    console.error('❌ فشل تهيئة TonConnect:', e);
  }
}

// استدعاء التهيئة عند تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTonConnect);
} else {
  initTonConnect();
}

// --- معالجة اتصال المحفظة ---
function handleWalletConnect(wallet) {
  if (wallet) {
    userWalletAddress = wallet.account.address;
    userWalletApp = wallet.device?.appName || 'tonkeeper';

    const wm = document.getElementById('welcome-modal');
    if (wm) wm.style.display = 'none';

    const dbStatus = document.getElementById('db-status');
    if (dbStatus) dbStatus.innerText = 'متصل عبر ' + userWalletApp + ' 🔗';

    // تحديث نص الزر إلى "متصل"
    const mainBtn = document.getElementById('main-ton-btn');
    if (mainBtn) {
      mainBtn.innerText = '✅ ' + userWalletApp + ' متصل';
      mainBtn.classList.add('connected');
    }

    saveTonWalletToFirebase(userWalletAddress, userWalletApp);
    processReferralBonusOnConnect();
  } else {
    userWalletAddress = null;
    const wm = document.getElementById('welcome-modal');
    if (wm) wm.style.display = 'flex';

    const dbStatus = document.getElementById('db-status');
    if (dbStatus) dbStatus.innerText = "غير متصل بالمحفظة";

    const mainBtn = document.getElementById('main-ton-btn');
    if (mainBtn) {
      mainBtn.innerText = '🔗 ربط محفظة TON';
      mainBtn.classList.remove('connected');
    }
  }
  saveToFirebase();
}

// --- حفظ المحفظة في Firebase ---
async function saveTonWalletToFirebase(address, appName) {
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const userId = telegramUser ? telegramUser.id.toString() : "GUEST_USER";

  if (!userId || userId === "GUEST_USER") {
    console.warn('لا يوجد مستخدم لتسجيل المحفظة');
    return;
  }

  try {
    await db.ref('players/' + userId).update({
      tonWallet: address,
      walletProvider: appName || 'unknown',
      isVerified: true,
      lastVerifiedAt: new Date().toISOString(),
      lastActive: Date.now()
    });
    console.log('✅ تم حفظ المحفظة في Firebase');
  } catch (error) {
    console.error('❌ خطأ في حفظ المحفظة:', error);
  }
}

// --- Referral Logic ---
function processReferralBonusOnConnect() {
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
      alert('🎁 مفاجأة من الأعماق! لقد حصلت على ' + amount.toLocaleString() + ' MHA مقابل إحالة ناجحة!');
    }
  });
}

// --- Firebase Save/Load ---
function saveToFirebase() {
  if (!isDataLoaded) return;
  const userId = getUserId();
  if (!userId || userId === "GUEST_USER") return;
  db.ref('players/' + userId).update({
    tonWallet: userWalletAddress || "",
    walletProvider: userWalletApp || "unknown",
    tonVerified: !!userWalletAddress,
    score: score,
    multiplier: multiplier,
    lastActive: Date.now()
  });
}

function loadUserDataFromFirebase() {
  const userId = getUserId();
  db.ref('players/' + userId).once('value').then((snap) => {
    const data = snap.val();
    if (data) {
      score = typeof data.score === 'number' ? data.score : 0.00;
      multiplier = data.multiplier || 1;
    }
    isDataLoaded = true;
    const splash = document.getElementById('splash-loader');
    if (splash) splash.style.display = 'none';
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
      rankEl.innerText = 'مستوى القرش (' + multiplier + 'x)';
    }
  }

  const percentage = Math.min(100, (score / maxCap) * 100).toFixed(4);
  const progText = document.getElementById('progress-text');
  if (progText) progText.innerText = percentage;
  const progFill = document.getElementById('progress-fill');
  if (progFill) progFill.style.width = Math.max(1, percentage) + '%';
}

// --- Modal Helpers ---
function openSpeedModal() { document.getElementById('speed-modal').style.display = 'flex'; }
function openStarsModal() { document.getElementById('stars-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function getEffectiveMultiplier() {
  const now = Date.now();
  if (tempMultiplier > 1 && now < tempBoostExpiry) {
    return multiplier * tempMultiplier;
  }
  return multiplier;
}

// --- TON Purchase ---
async function buyMultiplier(multi, tonAmount) {
  if (!userWalletAddress) {
    alert("يرجى ربط محفظة TON أولاً لتأكيد المعاملة!");
    return;
  }
  if (!window.tonConnectUI) {
    alert("نظام المحفظة غير جاهز. يرجى إعادة فتح التطبيق.");
    return;
  }
  const nanoTon = Math.floor(parseFloat(tonAmount) * 1000000000);
  const transaction = {
    validUntil: Math.floor(Date.now() / 1000) + 60,
    messages: [{ address: RECEIVER_WALLET, amount: nanoTon.toString() }]
  };
  try {
    await window.tonConnectUI.sendTransaction(transaction);
    multiplier = multi;
    updateUI();
    saveToFirebase();
    closeModal('speed-modal');
    alert('✅ تم تفعيل سرعة القرش ' + multi + 'x بنجاح عبر TON! 🦈');
  } catch (e) {
    console.error(e);
    alert("تم إلغاء المعاملة أو فشلت.");
  }
}

// --- Stars Purchase ---
async function buyMultiplierStars(multi, starsAmount) {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    alert("هذه الميزة تعمل فقط داخل تطبيق تليجرام!");
    return;
  }
  try {
    const userId = getUserId();
    const response = await fetch(`/create-stars-invoice?userId=${userId}&multi=${multi}&stars=${starsAmount}`);
    if (!response.ok) throw new Error("failed_fetch");
    const data = await response.json();
    if (data && data.invoiceLink) {
      tg.openInvoice(data.invoiceLink, (status) => {
        if (status === 'paid') {
          multiplier = multi;
          updateUI();
          saveToFirebase();
          closeModal('stars-modal');
          alert('⭐ تم تفعيل سرعة القرش ' + multi + 'x بنجاح! 🦈');
        } else if (status === 'cancelled') {
          alert('تم إلغاء عملية الدفع.');
        } else {
          alert('فشل عملية الدفع. يرجى المحاولة مرة أخرى.');
        }
      });
    } else {
      alert("خدمة الدفع بالنجوم غير متاحة حالياً. يرجى استخدام TON.");
    }
  } catch (e) {
    console.error(e);
    alert("حدث خطأ أثناء الاتصال بخادم الدفع.");
  }
}

// --- Timed Ad ---
async function watchTimedAd() {
  const now = Date.now();
  if (now - lastAdWatchTime < AD_COOLDOWN_MS) {
    const remaining = AD_COOLDOWN_MS - (now - lastAdWatchTime);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    alert(`⏳ يرجى الانتظار ${mins}:${secs.toString().padStart(2, '0')} قبل مشاهدة إعلان جديد.`);
    return;
  }
  if (!AdController) {
    alert("⚠️ نظام الإعلانات غير متاح حالياً. حاول لاحقاً.");
    return;
  }
  try {
    const btn = document.getElementById('ad-btn');
    if (btn) btn.disabled = true;
    await AdController.show();
    lastAdWatchTime = Date.now();
    tempMultiplier = 2;
    tempBoostExpiry = Date.now() + TEMP_BOOST_DURATION_MS;
    updateUI();
    alert('🎬 تم تفعيل تعزيز مؤقت 2x لمدة 60 ثانية! 🦈');
    setTimeout(() => {
      tempMultiplier = 1;
      tempBoostExpiry = 0;
      updateUI();
    }, TEMP_BOOST_DURATION_MS);
    if (btn) btn.disabled = false;
  } catch (e) {
    console.warn("Ad skipped:", e);
    alert("يجب عليك مشاهدة الإعلان حتى النهاية للحصول على التعزيز!");
    const btn = document.getElementById('ad-btn');
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
// --- Three.js Engine ---
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
setInterval(() => { if (!isPaused) spawnTreasure(false); }, 800);
setInterval(() => { if (!isPaused) spawnTreasure(true); }, 5000);

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
  if (isPaused) return;
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
  if (!isPaused) {
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
  }
  renderer.render(scene, camera);
}
animate();
