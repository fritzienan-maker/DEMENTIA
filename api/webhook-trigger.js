/**
 * /api/webhook-trigger.js — Forward a payload to a GHL Automation Webhook
 *
 * POST /api/webhook-trigger
 *   body: any JSON — forwarded verbatim to GHL_WEBHOOK_URL
 *
 * Use this to trigger GHL AI workflows, automations, or Zapier/Make integrations.
 * The webhook URL lives in env — never exposed to the browser.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[webhook-trigger] GHL_WEBHOOK_URL env var is missing');
    return res.status(500).json({ error: 'GHL_WEBHOOK_URL not configured' });
  }

  // Validate payload is not empty
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  try {
    console.log('[webhook-trigger] Forwarding payload to GHL webhook:', Object.keys(payload));

    const r = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    // GHL webhooks sometimes return plain text, handle gracefully
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    console.log(`[webhook-trigger] GHL responded ${r.status}`);
    return res.status(r.ok ? 200 : r.status).json({ ok: r.ok, status: r.status, ...data });

  } catch (err) {
    console.error('[webhook-trigger] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
