/**
 * /api/contacts.js — Create or list GHL contacts
 *
 * GET  /api/contacts          → returns paginated contact list
 * POST /api/contacts          → creates a new contact
 *   body: { name, email, phone }
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.error('[contacts] Missing env vars — GHL_API_KEY or GHL_LOCATION_ID');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };

  // ── GET: list contacts ─────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const limit = req.query.limit || 25;
      const r = await fetch(
        `${GHL_BASE}/contacts/?locationId=${locationId}&limit=${limit}`,
        { headers }
      );
      const data = await r.json();
      console.log(`[contacts] Fetched ${data.contacts?.length ?? 0} contacts`);
      return res.status(r.status).json(data);
    } catch (err) {
      console.error('[contacts GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: create contact ───────────────────────────────────
  if (req.method === 'POST') {
    const { name, email, phone } = req.body || {};

    // Validate — at least one identifier required
    if (!name && !email && !phone) {
      return res.status(400).json({ error: 'Provide at least one of: name, email, phone' });
    }

    // Build payload, only include fields that were provided
    const payload = { locationId };
    if (name)  payload.name  = String(name).trim();
    if (email) payload.email = String(email).trim().toLowerCase();
    if (phone) payload.phone = String(phone).trim();

    try {
      const r = await fetch(`${GHL_BASE}/contacts/`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload),
      });
      const data = await r.json();
      console.log(`[contacts POST] Created contact: ${data.contact?.id ?? 'unknown'}`);
      return res.status(r.status).json(data);
    } catch (err) {
      console.error('[contacts POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
