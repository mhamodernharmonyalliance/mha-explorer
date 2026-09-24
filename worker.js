/* ==========================================
   MHASpace Worker v5 - Economic Redesign
   ========================================== */

const FIREBASE = 'https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app';

const PRODUCTS = {
  'starter_pack': {
    price: 5, type: 'pack', mha: 500,
    buffs: { magnet: 5 * 60 * 1000 },
    title: { en: '📦 Starter Pack', ar: '📦 الحزمة المبتدئة' },
    desc:  { en: '+500 MHA + Magnet (5 min)', ar: '+500 MHA + مغناطيس (5 دقائق)' }
  },
  'boost_pack': {
    price: 10, type: 'pack', mha: 1000,
    buffs: { x2: 5 * 60 * 1000 },
    title: { en: '⚡ Boost Pack', ar: '⚡ حزمة التعزيز' },
    desc:  { en: '+1000 MHA + x2 Boost (5 min)', ar: '+1000 MHA + مضاعف ×2 (5 دقائق)' }
  },
  'power_pack': {
    price: 15, type: 'pack', mha: 1500,
    buffs: { x5: 5 * 60 * 1000 },
    title: { en: '🔥 Power Pack', ar: '🔥 حزمة القوة' },
    desc:  { en: '+1500 MHA + x5 Boost (5 min)', ar: '+1500 MHA + مضاعف ×5 (5 دقائق)' }
  },
  'shield_pack': {
    price: 20, type: 'pack', mha: 2000,
    buffs: { shield: 10 * 60 * 1000 },
    title: { en: '🛡️ Shield Pack', ar: '🛡️ حزمة الدرع' },
    desc:  { en: '+2000 MHA + Combo Shield (10 min)', ar: '+2000 MHA + درع Combo (10 دقائق)' }
  },
  'pro_pack': {
    price: 30, type: 'pack', mha: 3000,
    buffs: { magnet: 10 * 60 * 1000, x2: 10 * 60 * 1000 },
    title: { en: '💎 Pro Pack', ar: '💎 حزمة المحترفين' },
    desc:  { en: '+3000 MHA + Magnet & x2 (10 min)', ar: '+3000 MHA + مغناطيس و ×2 (10 دقائق)' }
  },
  'elite_pack': {
    price: 50, type: 'pack', mha: 5000,
    buffs: { magnet: 10 * 60 * 1000, x5: 10 * 60 * 1000 },
    title: { en: '👑 Elite Pack', ar: '👑 حزمة النخبة' },
    desc:  { en: '+5000 MHA + Magnet & x5 (10 min)', ar: '+5000 MHA + مغناطيس و ×5 (10 دقائق)' }
  },
  'mega_pack': {
    price: 100, type: 'pack', mha: 10000,
    buffs: {
      magnet: 10 * 60 * 1000,
      x5: 10 * 60 * 1000,
      shield: 10 * 60 * 1000
    },
    title: { en: '🏆 Mega Pack', ar: '🏆 الحزمة الأسطورية' },
    desc:  { en: '+10000 MHA + ALL Buffs (10 min)', ar: '+10000 MHA + كل المزايا (10 دقائق)' }
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') return handleWebhook(request, env);
    if (url.pathname === '/api/create-invoice' && request.method === 'POST') return handleCreateInvoice(request, env);
    if (url.pathname === '/api/save-score' && request.method === 'POST') return handleSaveScore(request, env);
    if (url.pathname === '/reward' && request.method === 'GET') return handleReward(request, env);
    if (url.pathname === '/api/products') return jsonResponse({ products: PRODUCTS });
    if (url.pathname === '/api/health') return jsonResponse({ ok: true, hasToken: !!env.BOT_TOKEN });

    if (env.ASSETS) return env.ASSETS.fetch(request);
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

async function validateInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('\n');
    const enc = new TextEncoder();
    const secretKey = await crypto.subtle.importKey(
      'raw', enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', secretKey, enc.encode(botToken));
    const hmacKey = await crypto.subtle.importKey(
      'raw', secret,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== hash) return null;
    return JSON.parse(params.get('user') || 'null');
  } catch (e) { return null; }
}

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
    if (!data.ok) return jsonResponse({ error: data.description || 'Failed' }, 500);
    return jsonResponse({ url: data.result });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleWebhook(request, env) {
  try {
    const update = await request.json();

    if (update.pre_checkout_query) {
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true })
      });
      return new Response('OK');
    }

    if (update.message?.successful_payment) {
      const p = update.message.successful_payment;
      let payload = {};
      try { payload = JSON.parse(p.invoice_payload); } catch (e) {}

      const product = PRODUCTS[payload.productId];
      const userId = payload.userId || String(update.message.from.id);

      if (product) {
        await applyProduct(env, userId, product, payload.productId);

        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: `✅ Thank you!\n🎁 ${product.title.en}\n+${product.mha} MHA added • Buffs activated! 🦈`
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

async function applyProduct(env, userId, product, productId) {
  const base = `${FIREBASE}/players/${userId}`;
  const now  = Date.now();

  const snap = await fetch(`${base}.json`).then(r => r.json()).catch(() => null) || {};
  const currentScore = (typeof snap.score === 'number') ? snap.score : 0;
  const currentBuffs = snap.activeBuffs || {};

  const newScore = currentScore + product.mha;

  const newBuffs = { ...currentBuffs };
  for (const [buffType, durationMs] of Object.entries(product.buffs || {})) {
    const currentExpiry = newBuffs[buffType] || 0;
    newBuffs[buffType] = Math.max(currentExpiry, now) + durationMs;
  }

  await fetch(`${base}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      score: newScore,
      activeBuffs: newBuffs,
      lastActive: now,
      lastPurchase: {
        productId,
        mha: product.mha,
        buffs: product.buffs,
        at: now,
        shown: false
      }
    })
  });

  await fetch(`${FIREBASE}/purchases.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId, productId, mha: product.mha, price: product.price, at: now
    })
  });

  return { mha: product.mha, buffs: product.buffs };
}

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

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (e) {
    return new Response('OK', { status: 200 });
  }
}
