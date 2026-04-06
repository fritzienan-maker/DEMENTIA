/**
 * DementiaHub — User Context Module
 * ──────────────────────────────────────────────────────────────
 * Shared between caregiver (index.html) and staff (staff.html).
 * Builds a clean identity object and injects it into:
 *   • GoHighLevel chat widget (via iframe URL params + postMessage)
 *   • ElevenLabs Conversational AI widget (via dynamic-variables)
 *   • Local conversation history (keyed by userId)
 * ──────────────────────────────────────────────────────────────
 */

const DHUserContext = (() => {

  // ──────────────────────────────────────────────────────────
  // 1. CONTEXT BUILDERS
  // ──────────────────────────────────────────────────────────

  /** Read caregiver identity from localStorage / sessionStorage (index.html auth). */
  function getCaregiverContext() {
    const uid = sessionStorage.getItem('dh_cg_uid');
    if (!uid) return null;
    const users = JSON.parse(localStorage.getItem('dh_users') || '[]');
    const user  = users.find(u => u.id === uid);
    if (!user) return null;

    const firstName = (user.fullname || 'Caregiver').split(' ')[0];
    return {
      userId:      user.id,
      name:        user.fullname  || 'Caregiver',
      firstName,
      email:       user.email     || '',
      phone:       user.phone     || '',
      role:        'caregiver',
      patientName: user.patientName || null,
      joinedAt:    user.joinedAt  || null,
      sessionKey:  'cg_' + uid.slice(-6),          // readable, non-sensitive token
    };
  }

  /** Read staff identity from sessionStorage (staff.html auth). */
  function getStaffContext() {
    if (sessionStorage.getItem('dsg_auth') !== '1') return null;
    const data = JSON.parse(sessionStorage.getItem('dsg_staff') || 'null');
    if (!data) return null;

    const firstName = data.name.split(' ').slice(-1)[0]; // last name fragment feels natural for staff
    return {
      userId:    data.id,
      name:      data.name,
      firstName: data.name.split(' ')[0],
      email:     data.email || '',
      phone:     data.phone || '',
      role:      'staff',
      staffRole: data.staffRole || 'Helpline Staff',
      sessionKey: 'staff_' + data.id.slice(-6),
    };
  }

  /** Auto-detect the current portal's user. */
  function getCurrentContext() {
    return getCaregiverContext() || getStaffContext() || null;
  }

  // ──────────────────────────────────────────────────────────
  // 2. GHL CHAT INTEGRATION
  // ──────────────────────────────────────────────────────────

  /**
   * Build the GHL chat iframe URL with user context encoded as query params.
   * GHL reads name / email / phone to pre-fill and link the contact record.
   */
  function buildGHLChatUrl(locationId, ctx) {
    const base = `https://api.leadconnectorhq.com/widget/chat/${locationId}`;
    if (!ctx) return base;

    const p = new URLSearchParams();
    if (ctx.name)  p.set('name',  ctx.name);
    if (ctx.email) p.set('email', ctx.email);
    if (ctx.phone) p.set('phone', ctx.phone);

    // Custom metadata that GHL forwards to the conversation contact record
    p.set('dh_user_id',   ctx.userId);
    p.set('dh_role',      ctx.role);
    if (ctx.patientName) p.set('dh_patient', ctx.patientName);
    if (ctx.staffRole)   p.set('dh_staff_role', ctx.staffRole);

    return `${base}?${p.toString()}`;
  }

  /**
   * For the GHL JS Widget (not iframe) approach.
   * Call this BEFORE the GHL widget script loads on the page.
   * Config key: window.LC_Chatbot
   */
  function configureGHLWidget(ctx) {
    if (!ctx) return;
    window.LC_Chatbot = {
      contact: {
        name:  ctx.name,
        email: ctx.email  || undefined,
        phone: ctx.phone  || undefined,
        customFields: {
          dh_user_id:   ctx.userId,
          dh_user_role: ctx.role,
          dh_patient:   ctx.patientName || '',
          dh_staff_role:ctx.staffRole  || '',
        },
      },
    };
  }

  /**
   * Re-identify a returning user after the GHL JS widget has loaded.
   * Safe to call even if the widget API isn't available yet.
   */
  function identifyInGHLWidget(ctx) {
    if (!ctx) return;
    if (window.GHLChatWidget && typeof window.GHLChatWidget.identify === 'function') {
      window.GHLChatWidget.identify({
        name:  ctx.name,
        email: ctx.email || undefined,
        phone: ctx.phone || undefined,
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 3. ELEVENLABS VOICE AI INTEGRATION
  // ──────────────────────────────────────────────────────────

  /**
   * Build the dynamic-variables object injected into the ElevenLabs widget.
   * Your ElevenLabs agent system prompt should reference these with
   * {{user_name}}, {{user_role}}, {{patient_name}} etc.
   */
  function buildElevenLabsVars(ctx) {
    if (!ctx) return {};

    const isCaregiver = ctx.role === 'caregiver';
    return {
      user_name:       ctx.name,
      user_first_name: ctx.firstName,
      user_role:       ctx.role,                                 // 'caregiver' | 'staff'
      patient_name:    ctx.patientName || 'your family member',
      staff_role:      ctx.staffRole || '',
      session_key:     ctx.sessionKey,
      greeting:        isCaregiver
        ? `Hello ${ctx.firstName}, I'm here to support you with dementia caregiving. How can I help you today?`
        : `Hello ${ctx.firstName}, how can I assist you with case management today?`,
      safety_reminder: isCaregiver
        ? 'For life-threatening emergencies, please call 995 immediately.'
        : 'Safety escalation: notify on-call staff and set Escalation Timestamp.',
    };
  }

  /**
   * Inject dynamic variables into an <elevenlabs-convai> element.
   * Call this after the element is rendered in the DOM, before conversation starts.
   */
  function injectElevenLabsVars(widgetEl, ctx) {
    if (!widgetEl || !ctx) return;
    const vars = buildElevenLabsVars(ctx);
    widgetEl.setAttribute('dynamic-variables', JSON.stringify(vars));

    // Also wire up a connect-event listener so variables are re-sent on session start
    widgetEl.addEventListener('elevenlabs-convai:connect', (e) => {
      // Log conversation start tied to userId
      storeConversationEvent(ctx, { type: 'voice_session_start', channel: 'elevenlabs' });
    }, { once: true });
  }

  // ──────────────────────────────────────────────────────────
  // 4. CONVERSATION HISTORY (localStorage, keyed by userId)
  // ──────────────────────────────────────────────────────────

  function _historyKey(userId) { return `dh_conv_${userId}`; }

  /** Append an event/message to the user's conversation history. */
  function storeConversationEvent(ctx, event) {
    if (!ctx) return;
    const key  = _historyKey(ctx.userId);
    const hist = JSON.parse(localStorage.getItem(key) || '[]');
    hist.push({
      ts:         new Date().toISOString(),
      sessionKey: ctx.sessionKey,
      role:       ctx.role,
      ...event,
    });
    // Keep last 200 events per user
    localStorage.setItem(key, JSON.stringify(hist.slice(-200)));
  }

  /** Retrieve full conversation history for a userId. */
  function getConversationHistory(userId) {
    return JSON.parse(localStorage.getItem(_historyKey(userId)) || '[]');
  }

  /** Get only the last N events for a userId. */
  function getRecentHistory(userId, n = 20) {
    return getConversationHistory(userId).slice(-n);
  }

  // ──────────────────────────────────────────────────────────
  // 5. STAFF IDENTITY HELPERS (used by staff.html login)
  // ──────────────────────────────────────────────────────────

  /**
   * Convert a display name into a stable, readable identifier.
   * "Dr. Sarah Chen"  →  "dr-sarah-chen"
   * "Nurse Michael Tan" → "nurse-michael-tan"
   */
  function nameToId(displayName) {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')    // strip punctuation
      .trim()
      .replace(/\s+/g, '-');           // spaces → hyphens
  }

  /**
   * Save staff session after successful login.
   * @param {string} displayName   — from STAFF_LIST, e.g. "Dr. Sarah Chen"
   * @param {string} staffRole     — e.g. "Case Manager"
   * @param {string} [email]       — optional
   */
  function saveStaffSession(displayName, staffRole, email) {
    const data = {
      id:        nameToId(displayName),         // "dr-sarah-chen"
      name:      displayName,
      staffRole: staffRole || 'Helpline Staff',
      email:     email || '',
      loginAt:   new Date().toISOString(),
    };
    sessionStorage.setItem('dsg_auth',  '1');
    sessionStorage.setItem('dsg_staff', JSON.stringify(data));
    return data;
  }

  /** Clear staff session on logout. */
  function clearStaffSession() {
    sessionStorage.removeItem('dsg_auth');
    sessionStorage.removeItem('dsg_staff');
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────
  return {
    // Context readers
    getCaregiverContext,
    getStaffContext,
    getCurrentContext,

    // GHL
    buildGHLChatUrl,
    configureGHLWidget,
    identifyInGHLWidget,

    // ElevenLabs
    buildElevenLabsVars,
    injectElevenLabsVars,

    // History
    storeConversationEvent,
    getConversationHistory,
    getRecentHistory,

    // Staff helpers
    nameToId,
    saveStaffSession,
    clearStaffSession,
  };
})();

window.DHUserContext = DHUserContext;
