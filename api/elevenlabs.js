/**
 * /api/elevenlabs.js — Secure ElevenLabs API proxy
 *
 * GET /api/elevenlabs?type=conversations           → all call logs (staff)
 * GET /api/elevenlabs?type=conversations&limit=25  → with limit
 * GET /api/elevenlabs?type=conversation&id=conv_xx → single conversation detail
 * GET /api/elevenlabs?type=transcript&id=conv_xx   → transcript for one call
 */
const EL_BASE = 'https://api.elevenlabs.io';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    console.error('[elevenlabs] Missing ELEVENLABS_API_KEY env var');
    return res.status(500).json({ error: 'Server not configured — ELEVENLABS_API_KEY missing' });
  }

  const headers = {
    'xi-api-key':   apiKey,
    'Content-Type': 'application/json',
  };

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, id, limit } = req.query;

  try {
    let url, r, data;

    switch (type) {

      // ── All conversations (staff portal) ──────────────────
      case 'conversations':
        url  = `${EL_BASE}/v1/convai/conversations?agent_id=${agentId}&page_size=${limit || 25}`;
        console.log(`[elevenlabs] Fetching all conversations`);
        r    = await fetch(url, { headers });
        data = await r.json();
        return res.status(r.status).json(data);

      // ── Single conversation detail ─────────────────────────
      case 'conversation':
        if (!id) return res.status(400).json({ error: 'Missing ?id= param' });
        url  = `${EL_BASE}/v1/convai/conversations/${id}`;
        console.log(`[elevenlabs] Fetching conversation: ${id}`);
        r    = await fetch(url, { headers });
        data = await r.json();
        return res.status(r.status).json(data);

      // ── Transcript for a conversation ─────────────────────
      case 'transcript':
        if (!id) return res.status(400).json({ error: 'Missing ?id= param' });
        url  = `${EL_BASE}/v1/convai/conversations/${id}/transcript`;
        console.log(`[elevenlabs] Fetching transcript: ${id}`);
        r    = await fetch(url, { headers });
        data = await r.json();
        return res.status(r.status).json(data);

      default:
        return res.status(400).json({ error: 'Missing or invalid ?type= param. Use: conversations | conversation | transcript' });
    }

  } catch (err) {
    console.error('[elevenlabs]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
