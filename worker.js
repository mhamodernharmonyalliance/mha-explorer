export default {
  async fetch(request, env) {export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ خدمة tonconnect-manifest.json يدوياً (يتجاوز مشكلة ASSETS)
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
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    // بقية الملفات من ASSETS
    return env.ASSETS.fetch(request);
  }
};
    return env.ASSETS.fetch(request);
  }
};
