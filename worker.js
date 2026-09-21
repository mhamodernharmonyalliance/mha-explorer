/* ==========================================
   MHASpace Worker - Static + Webhook + Invoice
   ========================================== */

const FIREBASE = 'https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app';

// قائمة المنتجات — عدّل الأسعار كما تريد
const PRODUCTS = {
  'boost_500':    { title: '💎 باقة 500 MHA',   desc: '+500 MHA فوراً',      price: 50,  type: 'score', value: 500 },
  'boost_5000':   { title: '💰 باقة 5000 MHA',  desc: '+5000 MHA فوراً',     price: 300, type: 'score', value: 5000 },
  'skin_gold':    { title: '🥇 قرش ذهبي',        desc: 'شكل ذهبي حصري',        price: 100, type: 'skin',  value: 'gold' },
  'skin_dragon':  { title: '🐉 قرش التنين',      desc: 'شكل ناري أسطوري',      price: 250, type: 'skin',  value: 'dragon' },
  'pass_monthly': { title: '👑 Shark Pass (شهر)', desc: 'مزايا حصرية 30 يوم',   price: 500, type: 'pass',  value: 30 }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS
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
    if (url.pathname === '/api/products') {
      return jsonResponse({ products: PRODUCTS });
       if (url.pathname === '/reward' && request.method === 'GET') {
  return handleReward(request, env);
       }
    }
    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true, hasToken: !!env.BOT_TOKEN });
    }

    // Static assets
    return env.ASSETS.fetch(request);
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

    const user = JSON.parse(params.get('user') || 'null');
    return user;
  } catch (e) { return null; }
}

// --- Create Invoice ---
async function handleCreateInvoice(request, env) {
  try {
    const { productId, initData } = await request.json();
    if (!productId || !initData) return jsonResponse({ error: 'Missing data' }, 400);

    const user = await validateInitData(initData, env.BOT_TOKEN);
    if (!user || !user.id) return jsonResponse({ error: 'Auth failed' }, 401);

    const product = PRODUCTS[productId];
    if (!product) return jsonResponse({ error: 'Unknown product' }, 404);

    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: product.title,
        description: product.desc,
        payload: JSON.stringify({ productId, userId: String(user.id) }),
        currency: 'XTR',
        prices: [{ label: product.title, amount: product.price }]
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('createInvoiceLink error:', data);
      return jsonResponse({ error: data.description || 'Failed' }, 500);
    }
    return jsonResponse({ url: data.result });
  } catch (e) {
    console.error(e);
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
      const product = PRODUCTS[payload.productId];
      const userId = payload.userId || String(update.message.from.id);

      if (product) {
        await applyProduct(env, userId, product);
        // Notify user
        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: update.message.chat.id,
            text: `✅ تم الشراء بنجاح!\n🎁 ${product.title}\nشكراً لدعمك 🦈`
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

// --- Apply Product to Firebase ---
async function applyProduct(env, userId, product) {
  const base = `${FIREBASE}/players/${userId}`;

  if (product.type === 'score') {
    const snap = await fetch(`${base}.json`).then(r => r.json()).catch(() => null);
    const cur = (snap && typeof snap.score === 'number') ? snap.score : 0;
    await fetch(`${base}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: cur + product.value, lastActive: Date.now() })
    });
  } else if (product.type === 'skin') {
    await fetch(`${base}/skins/${product.value}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owned: true, at: Date.now() })
    });
  } else if (product.type === 'pass') {
    const expiry = Date.now() + product.value * 24 * 60 * 60 * 1000;
    await fetch(`${base}/pass.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true, expiry })
    });
  }

  // Log purchase
  await fetch(`${FIREBASE}/purchases.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, type: product.type, value: product.value, at: Date.now() })
  });
                  }
