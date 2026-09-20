export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ خدمة المانيفست
    if (url.pathname === '/tonconnect-manifest.json') {
      return new Response(JSON.stringify({
        url: "https://mha-explorer.mhaapp.workers.dev",
        name: "MHASpace Game",
        iconUrl: "https://mha-explorer.mhaapp.workers.dev/mha-logo.png",
        termsOfUseUrl: "https://mha-explorer.mhaapp.workers.dev",
        privacyPolicyUrl: "https://mha-explorer.mhaapp.workers.dev"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        }
      });
    }

    // 🔍 صفحة تشخيص جديدة
    if (url.pathname === '/diagnostic') {
      const html = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>تشخيص النظام</title>
          <style>
            body { background: #030712; color: #fff; font-family: monospace; padding: 20px; direction: ltr; }
            .box { background: #1e1e1e; padding: 15px; border-radius: 8px; margin: 10px 0; }
            .ok { color: #4caf50; } .err { color: #ff6b6b; } .warn { color: #ffa500; }
          </style>
        </head>
        <body>
          <h2 style="color: #38bdf8;">🔍 تشخيص النظام</h2>
          <div id="log" class="box">جاري الفحص...</div>

          <script src="https://telegram.org/js/telegram-web-app.js"><\/script>
          <script src="https://cdn.jsdelivr.net/npm/@tonconnect/ui@2.0.9/dist/tonconnect-ui.min.js"><\/script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
          <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"><\/script>
          <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"><\/script>
          <script src="https://sad.adsgram.ai/js/sad-index.js"><\/script>

          <script>
            setTimeout(() => {
              const log = document.getElementById('log');
              let html = '';
              
              const checks = [
                ['Telegram WebApp', typeof window.Telegram !== 'undefined'],
                ['Telegram.WebApp.initData', !!window.Telegram?.WebApp?.initData],
                ['TON Connect UI', typeof TON_CONNECT_UI !== 'undefined'],
                ['TONConnectUI class', typeof TON_CONNECT_UI?.TonConnectUI !== 'undefined'],
                ['Three.js', typeof THREE !== 'undefined'],
                ['Firebase', typeof firebase !== 'undefined'],
                ['Adsgram', typeof window.Adsgram !== 'undefined']
              ];
              
              checks.forEach(([name, ok]) => {
                html += '<div>' + (ok ? '✅' : '❌') + ' ' + name + '</div>';
              });
              
              // اختبار المانيفست
              fetch('https://mha-explorer.mhaapp.workers.dev/tonconnect-manifest.json')
                .then(r => r.json())
                .then(d => {
                  html += '<div class="ok">✅ المانيفست: ' + d.name + '</div>';
                  log.innerHTML = html;
                })
                .catch(e => {
                  html += '<div class="err">❌ المانيفست: ' + e.message + '</div>';
                  log.innerHTML = html;
                });

              // اختبار تهيئة TON Connect
              try {
                if (typeof TON_CONNECT_UI !== 'undefined') {
                  const testDiv = document.createElement('div');
                  testDiv.id = 'test-ton-btn';
                  testDiv.style.cssText = 'position:absolute;top:-9999px;';
                  document.body.appendChild(testDiv);
                  
                  const testUI = new TON_CONNECT_UI.TonConnectUI({
                    manifestUrl: 'https://mha-explorer.mhaapp.workers.dev/tonconnect-manifest.json',
                    buttonRootId: 'test-ton-btn'
                  });
                  html += '<div class="ok">✅ TON Connect تمت تهيئته بنجاح</div>';
                }
              } catch (e) {
                html += '<div class="err">❌ فشل TON Connect: ' + e.message + '</div>';
              }
              
              log.innerHTML = html;
            }, 4000);
          <\/script>
        </body>
        </html>
      `;
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
