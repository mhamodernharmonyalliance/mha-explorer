/* ==========================================
   PWhy BoomBoom - Combined Game & Stars JS
   ========================================== */

const WORKER_URL = 'https://mhaapp.workers.dev';[span_0](start_span)[span_0](end_span)[span_1](start_span)[span_1](end_span)

let userData = null;
let products = [];

// Game State Variables
let score = parseInt(localStorage.getItem('boomboom_score')) || 0;
let energy = parseInt(localStorage.getItem('boomboom_energy')) || 1000;
let maxEnergy = parseInt(localStorage.getItem('boomboom_max_energy')) || 1000;
let pointsPerClick = parseInt(localStorage.getItem('boomboom_ppc')) || 1;

// ==================== LANGUAGE HELPER ====================
function getLang() {
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  return tgLang === 'ar' ? 'ar' : 'en';
}

function t(key) {
  const lang = getLang();
  const dict = {
    guest: { ar: 'لاعب pwhy', en: 'pwhy Player' },
    loading: { ar: 'جاري تحميل المنتجات...', en: 'Loading products...' },
    priceLabel: { ar: '⭐ نجمة', en: '⭐ Stars' },
    noPurchases: { ar: 'لا توجد مشتريات سابقة', en: 'No purchase history' },
    payNotTg: { ar: 'يجب فتح اللعبة داخل تطبيق تليجرام للشراء!', en: 'Open in Telegram to buy!' },
    payError: { ar: 'فشل في إنشاء فاتورة الشراء', en: 'Failed to create invoice' },
    paySuccess: { ar: 'تمت عملية الشراء بنجاح! 🎉', en: 'Purchase successful! 🎉' },
    payFail: { ar: 'تم إلغاء أو فشل عملية الشراء', en: 'Payment canceled or failed' },
    payNetErr: { ar: 'حدث خطأ في الاتصال بالشبكة', en: 'Network error occurred' }
  };
  return dict[key]?.[lang] || dict[key]?.en || key;
}

// ==================== INIT ====================
(async function init() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.themeParams?.bg_color) {
      document.body.style.background = tg.themeParams.bg_color;
    }
  }

  setupGameEvents();

  try {
    await loadUser();
    await loadProducts();
    hideSplash();
    showApp();
    renderUser();
    renderProducts();
    renderHistory();
  } catch (e) {
    console.error('Init error:', e);
    hideSplash();
    showApp();
    renderUser();
  }
})();

// ==================== API ====================
async function loadUser() {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    userData = {
      user: { firstName: t('guest') },
      data: { credits: score, purchases: [] }
    };
    return;
  }

  const res = await fetch(`${WORKER_URL}/api/me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData })
  });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'Auth failed');
  userData = result;

  if (userData.data?.credits !== undefined) {
    score = userData.data.credits;
    updateUI();
  }
}

async function loadProducts() {
  const res = await fetch(`${WORKER_URL}/api/products`);
  const data = await res.json();
  products = data.products || [];
}

// ==================== GAME LOGIC ====================
function setupGameEvents() {
  const clickArea = document.getElementById('click-area');
  if (!clickArea) return;

  clickArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) {
      handleTap(e.touches[i].clientX, e.touches[i].clientY);
    }
  });

  clickArea.addEventListener('click', (e) => {
    if (e.pointerType === 'mouse') {
      handleTap(e.clientX, e.clientY);
    }
  });

  setInterval(() => {
    if (energy < maxEnergy) {
      energy = Math.min(maxEnergy, energy + 2);
      updateUI();
    }
  }, 1000);

  updateUI();
}

function handleTap(x, y) {
  if (energy < pointsPerClick) return;

  score += pointsPerClick;
  energy -= pointsPerClick;
  updateUI();

  if (window.sounds && typeof window.sounds.tap === 'function') {
    window.sounds.tap();
  }

  const tg = window.Telegram?.WebApp;
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.impactOccurred('medium');
  }

  createFloatingNumber(x, y);
}

function createFloatingNumber(x, y) {
  const num = document.createElement('div');
  num.className = 'floating-num';
  num.textContent = `+${pointsPerClick}`;
  num.style.left = `${x - 15}px`;
  num.style.top = `${y - 30}px`;
  document.body.appendChild(num);

  setTimeout(() => num.remove(), 800);
}

function updateUI() {
  const scoreEl = document.getElementById('score');
  const scoreHeaderEl = document.getElementById('score-header');
  const energyEl = document.getElementById('energy');
  const maxEnergyEl = document.getElementById('max-energy');
  const energyBarEl = document.getElementById('energy-bar');

  if (scoreEl) scoreEl.textContent = score.toLocaleString();
  if (scoreHeaderEl) scoreHeaderEl.textContent = score.toLocaleString();
  if (energyEl) energyEl.textContent = energy;
  if (maxEnergyEl) maxEnergyEl.textContent = maxEnergy;

  if (energyBarEl) {
    const energyPercent = (energy / maxEnergy) * 100;
    energyBarEl.style.width = `${energyPercent}%`;
  }

  localStorage.setItem('boomboom_score', score);
  localStorage.setItem('boomboom_energy', energy);
  localStorage.setItem('boomboom_max_energy', maxEnergy);
  localStorage.setItem('boomboom_ppc', pointsPerClick);
}

window.buyUpgrade = function(type) {
  if (type === 'tap' && score >= 100) {
    score -= 100;
    pointsPerClick += 1;
    if (window.sounds && typeof window.sounds.claim === 'function') window.sounds.claim();
    showAlert('🎉', 'نجاح', 'تمت ترقية قوة النقر بنجاح!');
  } else if (type === 'energy' && score >= 200) {
    score -= 200;
    maxEnergy += 500;
    energy += 500;
    if (window.sounds && typeof window.sounds.claim === 'function') window.sounds.claim();
    showAlert('🎉', 'نجاح', 'تمت ترقية حد الطاقة بنجاح!');
  } else {
    if (window.sounds && typeof window.sounds.error === 'function') window.sounds.error();
    showAlert('⚠️', 'تنبيه', 'عذراً، لا تمتلك رصيد كافي من الـ Booms!');
  }
  updateUI();
};

// ==================== UI RENDER ====================
function hideSplash() {
  const s = document.getElementById('splash');
  if (s) s.classList.add('hidden');
  setTimeout(() => s?.remove(), 500);
}

function showApp() {
  document.getElementById('app')?.classList.remove('hidden');
}

function renderUser() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const name = tgUser?.first_name || userData?.user?.firstName || t('guest');
  
  const userNameEl = document.getElementById('user-name');
  if (userNameEl) userNameEl.textContent = name;

  const userAvatarEl = document.getElementById('user-avatar');
  if (userAvatarEl && name) {
    userAvatarEl.textContent = name[0].toUpperCase();
  }
}

function renderProducts() {
  const container = document.getElementById('products-container');
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `<div class="text-center text-slate-400 py-4 text-xs">${t('loading')}</div>`;
    return;
  }

  container.innerHTML = products.map(p => {
    const lang = getLang();
    const title = p.title?.[lang] || p.title?.en || p.id;
    const desc = p.desc?.[lang] || p.desc?.en || '';
    const icon = extractIcon(title) || '⭐';
    const titleText = stripIcon(title);

    return `
      <div class="bg-slate-900 p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-2xl">${icon}</div>
          <div>
            <h4 class="font-bold text-sm">${titleText}</h4>
            <p class="text-xs text-slate-400">${desc}</p>
            <span class="text-xs text-yellow-400 font-semibold mt-1 block">السعر: ${p.price} ${t('priceLabel')}</span>
          </div>
        </div>
        <button onclick="buyProduct('${p.id}')" class="bg-yellow-400 text-slate-950 px-4 py-2 rounded-xl font-bold text-xs hover:bg-yellow-300 active:scale-95 transition">
          شراء ⭐
        </button>
      </div>
    `;
  }).join('');
}

function renderHistory() {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  if (!section || !list) return;

  const purchases = userData?.data?.purchases || [];
  if (!purchases.length) {
    section.classList.remove('hidden');
    list.innerHTML = `<div class="text-slate-500 text-center py-3 text-xs">${t('noPurchases')}</div>`;
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = purchases.slice().reverse().map(p => {
    const date = new Date(p.at).toLocaleDateString();
    return `
      <div class="flex justify-between items-center py-2 border-b border-slate-800 text-xs text-slate-300">
        <span>${p.productId}</span>
        <span class="opacity-60">${date}</span>
      </div>
    `;
  }).join('');
}

function extractIcon(title) {
  const match = title?.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : null;
}

function stripIcon(title) {
  return title ? title.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim() : '';
}

// ==================== BUY WITH TELEGRAM STARS ====================
async function buyProduct(productId) {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData;

  if (!tg || !tg.openInvoice || !initData) {
    if (window.sounds && typeof window.sounds.error === 'function') window.sounds.error();
    showAlert('⚠️', 'تنبيه', t('payNotTg'));
    return;
  }

  const payModal = document.getElementById('pay-modal');
  if (payModal) payModal.classList.add('active');

  try {
    const res = await fetch(`${WORKER_URL}/api/create-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, initData, lang: getLang() })
    });
    const data = await res.json();

    if (payModal) payModal.classList.remove('active');

    if (!data.url) {
      if (window.sounds && typeof window.sounds.error === 'function') window.sounds.error();
      showAlert('❌', 'خطأ', data.error || t('payError'));
      return;
    }

    // فتح نافذة الدفع الرسمية الخاصة بنجوم تليجرام
    tg.openInvoice(data.url, (status) => {
      if (status === 'paid') {
        if (window.sounds && typeof window.sounds.claim === 'function') window.sounds.claim();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        showAlert('🎉', 'نجاح', t('paySuccess'));
        
        // زيادة نقاط فورية للعميل
        score += 10000;
        updateUI();

        setTimeout(() => location.reload(), 2000);
      } else if (status === 'failed') {
        if (window.sounds && typeof window.sounds.error === 'function') window.sounds.error();
        showAlert('⚠️', 'إلغاء', t('payFail'));
      }
    });
  } catch (e) {
    if (payModal) payModal.classList.remove('active');
    if (window.sounds && typeof window.sounds.error === 'function') window.sounds.error();
    showAlert('⚠️', 'خطأ', t('payNetErr'));
  }
}

// ==================== NAVIGATION SWITCHER ====================
window.switchTab = function(tab) {
  const tabGame = document.getElementById('tab-game');
  const tabShop = document.getElementById('tab-shop');
  const navGame = document.getElementById('nav-game');
  const navShop = document.getElementById('nav-shop');

  if (tabGame) tabGame.classList.add('hidden');
  if (tabShop) tabShop.classList.add('hidden');
  if (navGame) navGame.className = 'flex flex-col items-center gap-1 text-slate-500';
  if (navShop) navShop.className = 'flex flex-col items-center gap-1 text-slate-500';

  if (tab === 'game') {
    if (tabGame) tabGame.classList.remove('hidden');
    if (navGame) navGame.className = 'flex flex-col items-center gap-1 text-amber-400';
  } else {
    if (tabShop) tabShop.classList.remove('hidden');
    if (navShop) navShop.className = 'flex flex-col items-center gap-1 text-amber-400';
  }
};

// ==================== ALERTS ====================
function showAlert(icon, title, message) {
  const iconEl = document.getElementById('alert-icon');
  const titleEl = document.getElementById('alert-title');
  const msgEl = document.getElementById('alert-message');
  const modal = document.getElementById('alert-modal');

  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  
  if (modal) {
    modal.classList.add('active');
  } else {
    alert(`${icon} ${title}: ${message}`);
  }
}

function closeAlert() {
  document.getElementById('alert-modal')?.classList.remove('active');
}
