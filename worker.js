const FIREBASE_DB = "https://mhaexplorer-ac7a7-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_SIGNIN = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

const MAX_ENTITY = 80;
const MAX_DESC = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  if (!res.ok) throw new Error("signin_failed");
  const data = await res.json();
  tokenCache.token = data.idToken;
  tokenCache.expiry = now + (parseInt(data.expiresIn, 10) - 60) * 1000;
  return data.idToken;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

async function handlePublish(request, env) {
  try {
    const body = await request.json();
    const entity = (body.entity || "").toString().trim();
    const description = (body.description || "").toString().trim();
    const authorId = (body.authorId || "").toString().trim();
    const deleteKey = (body.deleteKey || "").toString().trim();

    if (!entity || !description || !authorId || !deleteKey) {
      return jsonResponse({ error: "missing_fields" }, 400);
    }
    if (entity.length > MAX_ENTITY || description.length > MAX_DESC) {
      return jsonResponse({ error: "too_long" }, 400);
    }

    if (authorId.length > 64 || deleteKey.length > 64) {
      return jsonResponse({ error: "invalid_meta" }, 400);
    }

    const token = await getToken(env);
    const now = Date.now();

    const adsRes = await fetch(`${FIREBASE_DB}/ads.json?auth=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, description, authorId, createdAt: now })
    });
    if (!adsRes.ok) throw new Error("ads_write_failed");
    const adsData = await adsRes.json();
    const id = adsData.name;

    const keysRes = await fetch(`${FIREBASE_DB}/keys/${id}.json?auth=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deleteKey)
    });
    if (!keysRes.ok) {
      await fetch(`${FIREBASE_DB}/ads/${id}.json?auth=${token}`, { method: "DELETE" });
      throw new Error("keys_write_failed");
    }

    return jsonResponse({ ok: true, id });
  } catch (e) {
    return jsonResponse({ error: "server_error" }, 500);
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
    return jsonResponse({ error: "server_error" }, 500);
  }
}

async function handleBoost(request, env) {
  try {
    const body = await request.json();
    const id = (body.id || "").toString().trim();
    const authorId = (body.authorId || "").toString().trim();

    if (!id || !authorId) {
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

    if (ad.authorId !== authorId) {
      return jsonResponse({ error: "not_allowed" }, 403);
    }

    const now = Date.now();
    const lastBoostAt = ad.lastBoostAt || 0;
    const nextBoostAt = lastBoostAt + DAY_MS;

    if (now < nextBoostAt) {
      return jsonResponse({
        error: "wait",
        waitMs: nextBoostAt - now,
        nextBoostAt: nextBoostAt,
        points: ad.points || 0
      }, 429);
    }

    const newPoints = (ad.points || 0) + 1;
    const updateRes = await fetch(`${FIREBASE_DB}/ads/${id}.json?auth=${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: newPoints, lastBoostAt: now })
    });
    if (!updateRes.ok) throw new Error("boost_failed");

    return jsonResponse({ ok: true, points: newPoints, nextBoostAt: now + DAY_MS });
  } catch (e) {
    return jsonResponse({ error: "server_error" }, 500);
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

    if (url.pathname === "/api/publish") {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      return handlePublish(request, env);
    }

    if (url.pathname === "/api/delete") {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      return handleDelete(request, env);
    }

    if (url.pathname === "/api/boost") {
      if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
      return handleBoost(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
