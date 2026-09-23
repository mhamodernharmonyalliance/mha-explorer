/* ==========================================
   Cloudflare Worker - PWhy BoomBoom Backend
   ========================================== */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    // التعامل مع طلبات Preflight (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // 1. مسار الفحص المباشر (Health Check)
      if (url.pathname === '/' || url.pathname === '/api/health') {
        return jsonResponse({
          ok: true,
          hasToken: !!env.BOT_TOKEN,
          hasFirebase: !!env.FIREBASE_URL,
        });
      }

      // 2. مسار جلب قائمة المنتجات
      if (url.pathname === '/api/products') {
        const products = getProductsList();
        return jsonResponse({ ok: true, products });
      }

      // 3. مسار جلب بيانات المستخدم
      if (url.pathname === '/api/me' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.initData) {
          return jsonResponse({ ok: false, error: 'Missing initData' }, 400);
        }
        
        // استخراج بيانات المستخدم بأسلوب مبسط
        const user = parseInitDataUser(body.initData);
        return jsonResponse({
          ok: true,
          user: user || { firstName: 'Player' },
          data: { credits: 0, purchases: [] }
        });
      }

      // 4. مسار إنشاء فاتورة نجوم تليجرام (Telegram Stars Invoice)
      if (url.pathname === '/api/create-invoice' && request.method === 'POST') {
        if (!env.BOT_TOKEN) {
          return jsonResponse({ ok: false, error: 'Bot token configuration is missing' }, 500);
        }

        const body = await request.json().catch(() => ({}));
        const { productId, initData, lang } = body;

        const product = getProductsList().find(p => p.id === productId);
        if (!product) {
          return jsonResponse({ ok: false, error: 'Product not found' }, 404);
        }

        const user = parseInitDataUser(initData);
        const title = product.title?.[lang] || product.title?.ar || product.title?.en || product.id;
        const description = product.desc?.[lang] || product.desc?.ar || product.desc?.en || 'PWhy BoomBoom Purchase';

        // طلب إنشاء الفاتورة من Telegram API
        const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title,
            description: description,
            payload: JSON.stringify({ productId, userId: user?.id || 0, at: Date.now() }),
            provider_token: "", // يجب أن تكون فارغة لنجوم تليجرام
            currency: "XTR",   // رمز عملة النجوم
            prices: [{ label: title, amount: product.price }]
          })
        });

        const tgData = await tgRes.json();
        if (!tgData.ok) {
          return jsonResponse({ ok: false, error: tgData.description || 'Failed from Telegram API' }, 400);
        }

        return jsonResponse({ ok: true, url: tgData.result });
      }

      // 5. مسار استقبال الـ Webhook الخاص بتليجرام
      if (url.pathname === '/webhook' && request.method === 'POST') {
        const update = await request.json().catch(() => ({}));

        // أ) الموافقة التلقائية على PreCheckout
        if (update.pre_checkout_query) {
          await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pre_checkout_query_id: update.pre_checkout_query.id,
              ok: true
            })
          });
          return jsonResponse({ ok: true });
        }

        // ب) معالجة نجاح عملية الدفع (Successful Payment)
        if (update.message?.successful_payment) {
          const payment = update.message.successful_payment;
          const payload = JSON.parse(payment.invoice_payload || '{}');
          
          // هنا يمكن إضافة منطق حفظ المشتريات في Firebase
          return jsonResponse({ ok: true, received: true });
        }

        return jsonResponse({ ok: true });
      }

      return jsonResponse({ ok: false, error: 'Route not found' }, 404);

    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  }
};

// ==================== HELPER FUNCTIONS ====================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders
    }
  });
}

function parseInitDataUser(initDataStr) {
  try {
    const params = new URLSearchParams(initDataStr);
    const userStr = params.get('user');
    if (!userStr) return null;
    const u = JSON.parse(userStr);
    return {
      id: u.id,
      firstName: u.first_name,
      username: u.username
    };
  } catch (e) {
    return null;
  }
}

function getProductsList() {
  return [
    {
      id: 'stars_10',
      price: 10,
      title: { ar: '⚡ شحنة 10,000 فورية', en: '⚡ Instant 10k Energy' },
      desc: { ar: 'احصل على 10,000 نقطة فوراً', en: 'Get 10,000 points instantly' }
    },
    {
      id: 'multitap_boost',
      price: 50,
      title: { ar: '🚀 قوة نقر مضاعفة (+5)', en: '🚀 Multitap Boost (+5)' },
      desc: { ar: 'زيادة دائمة لقوة الضغطة', en: 'Permanent click power boost' }
    },
    {
      id: 'vip_pass',
      price: 100,
      title: { ar: '👑 اشتراك VIP شهري', en: '👑 Monthly VIP Pass' },
      desc: { ar: 'مكافآت يومية مضاعفة', en: 'Double daily rewards' }
    }
  ];
}
