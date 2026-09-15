const FIREBASE_DB = "https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_SIGNIN = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

const MAX_ENTITY = 80;
const MAX_DESC = 1500;
const ALLOWED_TG = /^https?:\/\/(t\.me|telegram\.me)\//i;

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
  if (!res.ok) throw new Error("signin_failed | " + text);

  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("signin_parse | " + text); }

  tokenCache.token = data.idToken;
  tokenCache.expiry = now + (parseInt(data.expiresIn, 10) - 60) * 1000;
  return data.idToken;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function handleDebug(env) {
  const result = { step: "start" };

  if (!env.FB_API_KEY) return jsonResponse({ error: "FB_API_KEY missing" }, 500);
  if (!env.FB_EMAIL) return jsonResponse({ error: "FB_EMAIL missing" }, 500);
  if (!env.FB_PASSWORD) return jsonResponse({ error: "FB_PASSWORD missing" }, 500);

  result.step = "vars_ok";
  result.email = env.FB_EMAIL;
  result.apiKeyPrefix = env.FB_API_KEY.substring(0, 10) + "...";

  try {
    tokenCache = { token: null, expiry: 0 };
    const token = await getToken(env);
    result.step = "signin_ok";
    result.tokenPrefix = token.substring(0, 20) + "...";

    const testRes = await fetch(`${FIREBASE_DB}/ads.json?auth=${token}&limitToLast=1`);
    const testText = await testRes.text();
    result.step = "read_test";
    result.readStatus = testRes.status;
    result.readBody = testText.substring(0, 300);

    const writeRes = await fetch(`${FIREBASE_DB}/_debug_test.json?auth=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ts: Date.now() })
    });
    const writeText = await writeRes.text();
    result.step = "write_test";
    result.writeStatus = writeRes.status;
    result.writeBody = writeText.substring(0, 300);

    if (writeRes.ok) {
      await fetch(`${FIREBASE_DB}/_debug_test.json?auth=${token}`, { method: "DELETE" });
      result.step = "all_ok";
    } else {
      result.step = "write_failed";
    }

    return jsonResponse(result);
  } catch (e) {
    result.step = "caught";
    result.error = String(e && e.message ? e.message : e);
    return jsonResponse(result, 500);
  }
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
    if (entity.length > MAX_ENTITY || description.length > MAX_DESC) {
      return jsonResponse({ error: "too_long" }, 400);
    }
    if (!ALLOWED_TG.test(telegram)) {
      return jsonResponse({ error: "invalid_telegram" }, 400);
    }

    const token = await getToken(env);
    const now = Date.now();

    const adsRes = await fetch(`${FIREBASE_DB}/ads.json?auth=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, description, telegram, authorId, createdAt: now })
    });
    const adsText = await adsRes.text();
    if (!adsRes.ok) return jsonResponse({ error: "ads_write_failed", detail: adsText }, 500);

    let adsData;
    try { adsData = JSON.parse(adsText); } catch (e) {
      return jsonResponse({ error: "ads_parse_failed", detail: adsText }, 500);
    }
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
  try {
    const body = await request.json();
    const id = (body.id || "").toString().trim();
    const authorId = (body.authorId || "").toString().trim();
    const deleteKey = (body.deleteKey || "").toString().trim();

    if (!id || (!authorId && !deleteKey)) {
      return jsonResponse({ error: "missing_fields" }, 400);
    }
    if (!/^-[A-Za-z0-9_-]{10,40}$/.test(id)) {
      return jsonResponse({ error: "invalid_id" }, 400);
    }

    const token = await getToken(env);

    const adRes = await fetch(`${FIREBASE_DB}/ads/${id}.json?auth=${token}`);
    if (!adRes.ok) throw new Error("ads_read_failed");
    const ad = await adRes.json();
    if (!ad) return jsonResponse({ error: "not_found" }, 404);

    const byAuthor = authorId && ad.authorId === authorId;
    let byKey = false;
    if (!byAuthor && deleteKey) {
      const keyRes = await fetch(`${FIREBASE_DB}/keys/${id}.json?auth=${token}`);
      if (keyRes.ok) {
        const storedKey = await keyRes.json();
        byKey = storedKey === deleteKey;
      }
    }

    if (!byAuthor && !byKey) return jsonResponse({ error: "not_allowed" }, 403);

    const delAd = await fetch(`${FIREBASE_DB}/ads/${id}.json?auth=${token}`, { method: "DELETE" });
    if (!delAd.ok) throw new Error("ads_delete_failed");

    await fetch(`${FIREBASE_DB}/keys/${id}.json?auth=${token}`, { method: "DELETE" }).catch(() => {});

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: "server_error", detail: String(e && e.message ? e.message : e) }, 500);
  }
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

    if (url.pathname === "/api/debug") {
      return handleDebug(env);
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
