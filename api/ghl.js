/**
 * /api/ghl.js — Secure GHL API proxy
 *
 * All requests from the frontend to GoHighLevel are routed through here.
 * The GHL API key lives only in process.env — never in the browser.
 *
 * Frontend usage:
 *   GET  /api/ghl?path=/conversations/search%3FlocationId=...
 *   POST /api/ghl   body: { path: '/opportunities/search', body: {...} }
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';

module.exports = async function handler(req, res) {
  // ── CORS (tighten origin in production if needed) ──────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Guard: require API key ─────────────────────────────────
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.error('[ghl proxy] GHL_API_KEY env var is missing');
    return res.status(500).json({ error: 'Server not configured — GHL_API_KEY missing' });
  }

  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };

  try {
    let ghlRes;

    // ── GET ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { path } = req.query;
      if (!path) return res.status(400).json({ error: 'Missing ?path= query param' });

      console.log(`[ghl proxy] GET ${path}`);
      ghlRes = await fetch(GHL_BASE + path, { headers: ghlHeaders });

    // ── POST / PUT / PATCH ─────────────────────────────────────
    } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const { path, body } = req.body || {};
      if (!path) return res.status(400).json({ error: 'Missing path in request body' });

      console.log(`[ghl proxy] ${req.method} ${path}`);
      ghlRes = await fetch(GHL_BASE + path, {
        method:  req.method,
        headers: ghlHeaders,
        body:    JSON.stringify(body || {}),
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Forward GHL response ───────────────────────────────────
    const data = await ghlRes.json().catch(() => ({}));
    return res.status(ghlRes.status).json(data);

  } catch (err) {
    console.error('[ghl proxy] Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
