/**
 * api-client.js — DementiaHub Frontend API Client
 *
 * ALL GHL calls go through /api/ghl (Vercel serverless proxy).
 * The GHL API key is NEVER in the browser — it lives in Vercel env vars.
 *
 * Usage: included via <script src="api-client.js"> before index.js / staff.js
 * Exposes: window.DHAPI
 */

const DHAPI = (() => {

  // ── Core proxy helpers ──────────────────────────────────────

  async function _get(ghlPath) {
    const url = '/api/ghl?path=' + encodeURIComponent(ghlPath);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI GET ${ghlPath}] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  async function _post(ghlPath, body = {}) {
    const res = await fetch('/api/ghl', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: ghlPath, body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI POST ${ghlPath}] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  async function _patch(ghlPath, body = {}) {
    const res = await fetch('/api/ghl', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: ghlPath, body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI PATCH ${ghlPath}] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  // ── Location ID (read from meta tag injected by each page) ──
  // Each HTML page has: <meta name="dh-location-id" content="Idf9v4q6aqh5KhzXip6e">
  // This means the location ID is in HTML (not secret) — only the API key is hidden.
  function _locationId() {
    const meta = document.querySelector('meta[name="dh-location-id"]');
    if (!meta || !meta.content) throw new Error('Missing <meta name="dh-location-id"> on page');
    return meta.content;
  }

  // ═══════════════════════════════════════════════════════════
  // OPPORTUNITIES (Cases)
  // ═══════════════════════════════════════════════════════════

  async function getOpportunities(limit = 25) {
    const data = await _post('/opportunities/search', {
      locationId: _locationId(),
      limit,
    });
    return data.opportunities || [];
  }

  async function updateOpportunity(oppId, fields) {
    return _patch(`/opportunities/${oppId}`, fields);
  }

  // ═══════════════════════════════════════════════════════════
  // CONVERSATIONS
  // ═══════════════════════════════════════════════════════════

  async function getConversations(limit = 15) {
    const data = await _get(
      `/conversations/search?locationId=${_locationId()}&limit=${limit}`
    );
    return data.conversations || [];
  }

  // ═══════════════════════════════════════════════════════════
  // CALENDARS
  // ═══════════════════════════════════════════════════════════

  async function getCalendars() {
    const data = await _get(`/calendars/?locationId=${_locationId()}`);
    return data.calendars || [];
  }

  async function scheduleAppointment(calendarId, contactId, startTime, endTime) {
    return _post('/calendars/events/appointments', {
      calendarId,
      locationId: _locationId(),
      contactId,
      startTime,
      endTime,
      title: 'Caregiver Callback',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════════════════════

  async function createContact(name, email, phone) {
    const res = await fetch('/api/contacts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, phone }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI createContact] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  async function getContacts(limit = 25) {
    const res = await fetch(`/api/contacts?limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI getContacts] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  async function addNote(contactId, text) {
    return _post(`/contacts/${contactId}/notes`, { body: text });
  }

  // ═══════════════════════════════════════════════════════════
  // WEBHOOK TRIGGER (GHL Automations / AI Workflows)
  // ═══════════════════════════════════════════════════════════

  async function triggerWebhook(payload) {
    const res = await fetch('/api/webhook-trigger', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`[DHAPI triggerWebhook] ${res.status}: ${err.error || res.statusText}`);
    }
    return res.json();
  }

  // ═══════════════════════════════════════════════════════════
  // BULK LOAD (used by both dashboards on login)
  // ═══════════════════════════════════════════════════════════

  /**
   * Loads opportunities, conversations, and calendars in parallel.
   * Returns { opps, convos, calendars } — each defaults to [] on error.
   */
  async function loadDashboardData() {
    const [oppsRes, convosRes, calsRes] = await Promise.allSettled([
      getOpportunities(25),
      getConversations(15),
      getCalendars(),
    ]);
    return {
      opps:      oppsRes.status   === 'fulfilled' ? oppsRes.value   : [],
      convos:    convosRes.status === 'fulfilled' ? convosRes.value : [],
      calendars: calsRes.status   === 'fulfilled' ? calsRes.value   : [],
    };
  }

  // ── Public surface ──────────────────────────────────────────
  return {
    // Opportunities
    getOpportunities,
    updateOpportunity,
    // Conversations
    getConversations,
    // Calendars
    getCalendars,
    scheduleAppointment,
    // Contacts
    createContact,
    getContacts,
    // Notes
    addNote,
    // Webhook
    triggerWebhook,
    // Bulk
    loadDashboardData,
  };

})();

window.DHAPI = DHAPI;
