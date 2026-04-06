/**
 * /api/contacts.js — Create, list, or search GHL contacts
 *
 * GET  /api/contacts                    → list contacts
 * GET  /api/contacts?email=x            → search by email
 * GET  /api/contacts?phone=x            → search by phone
 * POST /api/contacts                    → create new contact
 *   body: { name, email, phone, patientName }
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
    console.error('[contacts] Missing env vars');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-07-28',
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };

  // ── GET: list or search contacts ───────────────────────────
  if (req.method === 'GET') {
    try {
      const { email, phone, limit } = req.query;
      let url;

      if (email) {
        // Search by email
        url = `${GHL_BASE}/contacts/search?locationId=${locationId}&email=${encodeURIComponent(email)}`;
        console.log(`[contacts] Searching by email: ${email}`);
      } else if (phone) {
        // Search by phone
        url = `${GHL_BASE}/contacts/search?locationId=${locationId}&phone=${encodeURIComponent(phone)}`;
        console.log(`[contacts] Searching by phone: ${phone}`);
      } else {
        // List all
        url = `${GHL_BASE}/contacts/?locationId=${locationId}&limit=${limit || 25}`;
        console.log(`[contacts] Listing contacts`);
      }

      const r    = await fetch(url, { headers });
      const data = await r.json();
      console.log(`[contacts GET] Result count: ${data.contacts?.length ?? data.count ?? 0}`);
      return res.status(r.status).json(data);
    } catch (err) {
      console.error('[contacts GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: create contact ───────────────────────────────────
  if (req.method === 'POST') {
    const { name, email, phone, patientName } = req.body || {};

    if (!name && !email && !phone) {
      return res.status(400).json({ error: 'Provide at least one of: name, email, phone' });
    }

    // Split full name into first + last
    const nameParts = (name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    const payload = {
      locationId,
      firstName,
      lastName,
      name: (name || '').trim(),
    };
    if (email)       payload.email = String(email).trim().toLowerCase();
    if (phone)       payload.phone = String(phone).trim();

    // Store patient name in GHL custom field if provided
    if (patientName) {
      payload.customFields = [
        { key: 'patient_name', value: String(patientName).trim() }
      ];
    }

    try {
      const r    = await fetch(`${GHL_BASE}/contacts/`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(payload),
      });
      const data = await r.json();
      console.log(`[contacts POST] Created: ${data.contact?.id ?? 'unknown'} — ${name}`);
      return res.status(r.status).json(data);
    } catch (err) {
      console.error('[contacts POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
