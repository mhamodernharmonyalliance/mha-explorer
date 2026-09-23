/* ==========================================
   MHASpace Worker v4 - Full
   Products + Powerups + Boxes + i18n
   (Shark Pass removed)
   ========================================== */

const FIREBASE = 'https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app';

const PRODUCTS = {
  'magnet_60':    { price: 2,  type: 'powerup', value: 'magnet', count: 1,
                    title: { en: '🧲 Magnet (60s)',    ar: '🧲 مغناطيس (60ث)' },
                    desc:  { en: 'Attracts all nearby pearls', ar: 'يجذب كل اللآلئ القريبة' } },
  'boost_x2':     { price: 2,  type: 'powerup', value: 'x2', count: 1,
                    title: { en: '⚡ x2 Boost (30s)',  ar: '⚡ مضاعف ×2 (30ث)' },
                    desc:  { en: 'Double earnings for 30s', ar: 'ضاعف أرباحك لـ 30ث' } },
  'shield_combo': { price: 5,  type: 'powerup', value: 'shield', count: 1,
                    title: { en: '🛡️ Combo Shield (5m)', ar: '🛡️ درع Combo (5د)' },
                    desc:  { en: 'Protects combo for 5 min', ar: 'يحمي الـ Combo لـ 5 دقائق' } },
  'box_bronze':   { price: 5,  type: 'box', value: { min: 100,  max: 500 },
                    title: { en: '💎 Bronze Box', ar: '💎 صندوق برونزي' },
                    desc:  { en: 'Random 100 - 500 MHA', ar: 'عشوائي 100 - 500 MHA' } },
  'box_silver':   { price: 10, type: 'box', value: { min: 500,  max: 1500 },
                    title: { en: '💠 Silver Box', ar: '💠 صندوق فضي' },
                    desc:  { en: 'Random 500 - 1500 MHA', ar: 'عشوائي 500 - 1500 MHA' } },
  'box_gold':     { price: 25, type: 'box', value: { min: 2000, max: 8000 },
                    title: { en: '👑 Gold Box', ar: '👑 صندوق ذهبي' },
                    desc:  { en: 'Random 2000 - 8000 MHA', ar: 'عشوائي 2000 - 8000 MHA' } },
  'box_magnet5':  { price: 5,  type: 'powerup', value: 'magnet', count: 5,
                    title: { en: '📦 Magnet Bundle (5x)', ar: '📦 صندوق مغناطيس (5×)' },
                    desc:  { en: 'Get 5 magnets instantly', ar: 'احصل على 5 مغانط فوراً' } },
  'box_mixed':    { price: 10, type: 'bundle', value: 'mixed',
                    title: { en: '🎁 Mixed Bundle', ar: '🎁 صندوق مختلط' },
                    desc:  { en: 'Magnet + x2 + Shield', ar: 'مغناطيس + مضاعف + درع' } }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // --- Routes ---
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/api/create-invoice' && request.method === 'POST') {
      return handleCreateInvoice(request, env);
    }
    if (url.pathname === '/api/save-score' && request.method === 'POST') {
      return handleSaveScore(request, env);
    }
    if (url.pathname === '/reward' && request.method === 'GET') {
      return handleReward(request, env);
    }
    if (url.pathname === '/api/products') {
      return jsonResponse({ products: PRODUCTS });
    }
    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true, hasToken: !!env.BOT_TOKEN });
    }

    // Static assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return fetch(request);
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

// --- Validate Telegram initData ---
async function validateInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const enc = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw', enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const secret = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
    const hmacKey = await crypto.subtle.importKey(
      'raw', secret,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== hash) return null;
    return JSON.parse(params.get('user') || 'null');
  } catch (e) { return null; }
}

// --- Create Invoice ---
async function handleCreateInvoice(request, env) {
  try {
    const { productId, initData, lang } = await request.json();
    if (!productId || !initData) return jsonResponse({ error: 'Missing data' }, 400);

    const user = await validateInitData(initData, env.BOT_TOKEN);
    if (!user || !user.id) return jsonResponse({ error: 'Auth failed' }, 401);

    const product = PRODUCTS[productId];
    if (!product) return jsonResponse({ error: 'Unknown product' }, 404);

    const L = (lang === 'ar') ? 'ar' : 'en';
    const titleText = product.title[L] || product.title.en;
    const descText  = product.desc[L]  || product.desc.en;

    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleText,
        description: descText,
        payload: JSON.stringify({ productId, userId: String(user.id) }),
        currency: 'XTR',
        prices: [{ label: titleText, amount: product.price }]
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('createInvoiceLink:', data);
      return jsonResponse({ error: data.description || 'Failed' }, 500);
    }
    return jsonResponse({ url: data.result });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// --- Webhook ---
async function handleWebhook(request, env) {
  try {
    const update = await request.json();

    // Pre-checkout
    if (update.pre_checkout_query) {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        })
      });
      return new Response('OK');
    }

    // Successful payment
    if (update.message?.successful_payment) {
      const p = update.message.successful_payment;
      let payload = {};
      try { payload = JSON.parse(p.invoice_payload); } catch (e) {}

      const productId = payload.productId;
      const product = PRODUCTS[productId];
      const userId = payload.userId || String(update.message.from.id);

      if (product) {
        await applyProduct(env, userId, product, productId);

        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: `✅ Thank you!\n🎁 ${product.title.en}\nYour purchase has been applied 🦈`
          })
        });
      }
    }
    return new Response('OK');
  } catch (e) {
    console.error('webhook:', e);
    return new Response('OK');
  }
}

// --- Apply Product ---
async function applyProduct(env, userId, product, productId) {
  const base = `${FIREBASE}/players/${userId}`;
  const now  = Date.now();

  const snap = await fetch(`${base}.json`).then(r => r.json()).catch(() => null) || {};
  const currentScore = (typeof snap.score === 'number') ? snap.score : 0;
  const powerups = snap.powerups || {};

  let lastPurchase = null;

  // ================= BOX =================
  if (product.type === 'box') {
    const min = product.value.min;
    const max = product.value.max;
    const reward = Math.floor(Math.random() * (max - min + 1)) + min;

    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: currentScore + reward,
        lastActive: now,
        lastPurchase: {
          productId,
          type: 'box',
          reward,
          at: now
        }
      })
    });
    lastPurchase = { type: 'box', reward };
  }

  // ================= POWERUP =================
  else if (product.type === 'powerup') {
    const key = product.value;
    const count = product.count || 1;
    const newCount = (typeof powerups[key] === 'number' ? powerups[key] : 0) + count;

    await fetch(`${base}/powerups/${key}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCount)
    });
    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastActive: now,
        lastPurchase: {
          productId,
          type: 'powerup',
          powerupType: key,
          count,
          at: now
        }
      })
    });
    lastPurchase = { type: 'powerup', powerupType: key, count };
  }

  // ================= BUNDLE =================
  else if (product.type === 'bundle') {
    const grants = { magnet: 1, x2: 1, shield: 1 };
    for (const key of Object.keys(grants)) {
      const newCount = (typeof powerups[key] === 'number' ? powerups[key] : 0) + grants[key];
      await fetch(`${base}/powerups/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCount)
      });
    }
    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastActive: now,
        lastPurchase: {
          productId,
          type: 'bundle',
          bundle: 'mixed',
          at: now
        }
      })
    });
    lastPurchase = { type: 'bundle', bundle: 'mixed' };
  }

  // ================= PASS (legacy, unused) =================
  else if (product.type === 'pass') {
    const expiry = now + product.value * 24 * 60 * 60 * 1000;
    await fetch(`${base}/pass.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true, expiry })
    });
    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastActive: now,
        lastPurchase: { productId, type: 'pass', expiry, at: now }
      })
    });
    lastPurchase = { type: 'pass' };
  }

  // ================= SCORE (legacy) =================
  else if (product.type === 'score') {
    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: currentScore + product.value,
        lastActive: now,
        lastPurchase: { productId, type: 'score', reward: product.value, at: now }
      })
    });
    lastPurchase = { type: 'score', reward: product.value };
  }

  // Log purchase
  await fetch(`${FIREBASE}/purchases.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      productId,
      type: product.type,
      value: product.value,
      at: now
    })
  });

  return lastPurchase;
}

// --- Save Score (Server-side) ---
async function handleSaveScore(request, env) {
  try {
    const { score: newScore, initData } = await request.json();
    const user = await validateInitData(initData, env.BOT_TOKEN);
    if (!user || !user.id) return jsonResponse({ error: 'Auth failed' }, 401);
    if (typeof newScore !== 'number' || newScore < 0 || !isFinite(newScore)) {
      return jsonResponse({ error: 'Invalid score' }, 400);
    }

    const base = `${FIREBASE}/players/${user.id}`;
    const snap = await fetch(`${base}.json`).then(r => r.json()).catch(() => null);
    const currentScore = (snap && typeof snap.score === 'number') ? snap.score : 0;
    const diff = newScore - currentScore;
    if (diff < -0.01 || diff > 500) {
      return jsonResponse({ error: 'Score validation failed', current: currentScore }, 400);
    }

    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: newScore, lastActive: Date.now() })
    });
    return jsonResponse({ ok: true, score: newScore });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// --- Adsgram Reward ---
async function handleReward(request, env) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return new Response('Missing userId', { status: 400 });

    const timestamp = Date.now();

    await fetch(`${FIREBASE}/ad_rewards.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, at: timestamp, source: 'adsgram' })
    });

    const counterRef = `${FIREBASE}/players/${userId}/adCount.json`;
    const snap = await fetch(counterRef).then(r => r.json()).catch(() => 0);
    const currentCount = typeof snap === 'number' ? snap : 0;

    await fetch(`${FIREBASE}/players/${userId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adCount: currentCount + 1, lastAdAt: timestamp })
    });

    return new Response('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (e) {
    return new Response('OK', { status: 200 });
  }
}
