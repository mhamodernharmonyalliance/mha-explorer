// MHA Explorer — Cloudflare Worker (Debug Mode)
const FIREBASE_DB = "https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_SIGNIN = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

let tokenCache = { token: null, expiry: 0 };

async function getToken(env) {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiry) return tokenCache.token;

  const res = await fetch(`${FIREBASE_SIGNIN}?key=${env.FB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.FB_EMAIL,
      password: env.FB_PASSWORD,
      returnSecureToken: true
    })
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error("signin_failed: " + text);
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("signin_parse: " + text); }

  tokenCache.token = data.idToken;
  tokenCache.expiry = now + (parseInt(data.expiresIn, 10) - 60) * 1000;
  return data.idToken;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function handlePublish(request, env) {
  try {
    const body = await request.json();
    const entity = (body.entity || "").toString().trim();
    const description = (body.description || "").toString().trim();
    const telegram = (body.telegram || "").toString().trim();
    const authorId = (body.authorId || "").toString().trim();
    const deleteKey = (body.deleteKey || "").toString().trim();

    if (!entity || !description || !telegram || !authorId || !deleteKey) {
      return jsonResponse({ error: "missing_fields" }, 400);
    }

    const token = await getToken(env);
    const now = Date.now();

    const adsRes = await fetch(`${FIREBASE_DB}/ads.json?auth=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, description, telegram, authorId, createdAt: now })
    });

    const adsText = await adsRes.text();
    if (!adsRes.ok) {
      return jsonResponse({ error: "ads_write_failed", detail: adsText }, 500);
    }

    let adsData;
    try { adsData = JSON.parse(adsText); } catch (e) { return jsonResponse({ error: "ads_parse_failed", detail: adsText }, 500); }
    const id = adsData.name;

    const keysRes = await fetch(`${FIREBASE_DB}/keys/${id}.json?auth=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deleteKey)
    });

    const keysText = await keysRes.text();
    if (!keysRes.ok) {
      await fetch(`${FIREBASE_DB}/ads/${id}.json?auth=${token}`, { method: "DELETE" });
      return jsonResponse({ error: "keys_write_failed", detail: keysText }, 500);
    }

    return jsonResponse({ ok: true, id });
  } catch (e) {
    return jsonResponse({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
}

async function handleDelete(request, env) {
  return jsonResponse({ error: "not_implemented_in_debug" }, 500);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (url.pathname === "/api/publish") {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      return handlePublish(request, env);
    }

    if (url.pathname === "/api/delete") {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      return handleDelete(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
