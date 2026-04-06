// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════
const CFG = {
  locationId:        'Idf9v4q6aqh5KhzXip6e',
  elevenLabsAgentId: 'agent_7801kkd50dzsez4tfv4qme5mn6br',
  logo:              'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/dementia-singapore-logo.png',
};

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
const S = {
  opps:      null,
  convos:    null,
  calendars: null,
  filter:    'all',
  kbViewed:  JSON.parse(localStorage.getItem('dh_kb_viewed') || '[]'),
};

// ══════════════════════════════════════════════════════════════
// GHL DATA
// ══════════════════════════════════════════════════════════════
async function loadGHLData() {
  try {
    const { opps, convos, calendars } = await DHAPI.loadDashboardData();
    S.opps      = opps;
    S.convos    = convos;
    S.calendars = calendars;
  } catch(e) {
    console.error('[loadGHLData]', e.message);
    S.opps = []; S.convos = []; S.calendars = [];
  }
  render();
}

async function postNote(contactId, text) { return DHAPI.addNote(contactId, text); }
async function scheduleCallback(calId, contactId, start, end) {
  return DHAPI.scheduleAppointment(calId, contactId, start, end);
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function esc(v) {
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-SG',{month:'short',day:'numeric',year:'numeric'}) : '—';
}
function timeAgo(iso) {
  if (!iso) return '—';
  const h = (Date.now()-new Date(iso).getTime())/3600000;
  if (h<1) return Math.round(h*60)+'m ago';
  if (h<24) return Math.round(h)+'h ago';
  return Math.round(h/24)+'d ago';
}

// ══════════════════════════════════════════════════════════════
// SLA & FILTER
// ══════════════════════════════════════════════════════════════
function getSLA(op) {
  const h = (Date.now()-new Date(op.updatedAt||op.createdAt).getTime())/3600000;
  if (h<24) return { label:'On Track', cls:'badge-track', h };
  if (h<48) return { label:'Due Soon',  cls:'badge-due',   h };
  return           { label:'Overdue',   cls:'badge-over',  h };
}
function getStatus(op) {
  const st = (op.status||'').toLowerCase();
  const sg = (op.pipelineStageName||'').toLowerCase();
  if (st==='won'||st==='lost') return 'resolved';
  if (/triage|progress|active|contact|open/i.test(sg)) return 'active';
  return 'new';
}
function getFiltered(opps) {
  switch(S.filter) {
    case 'active':   return opps.filter(o=>getStatus(o)==='active');
    case 'new':      return opps.filter(o=>getStatus(o)==='new');
    case 'resolved': return opps.filter(o=>getStatus(o)==='resolved');
    default:         return opps;
  }
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
function getUsers()   { return JSON.parse(localStorage.getItem('dh_users')||'[]'); }
function saveUsers(u) { localStorage.setItem('dh_users', JSON.stringify(u)); }
function getCurrentUser() {
  const id = sessionStorage.getItem('dh_cg_uid');
  return id ? getUsers().find(u=>u.id===id)||null : null;
}
async function hashPass(p) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function registerUser(fullname, email, phone, pass, patientName) {
  const users = getUsers();
  if (users.find(u=>u.email===email)) return { error:'Email already registered.' };
  if (pass.length<8) return { error:'Password must be at least 8 characters.' };
  const user = {
    id: Date.now().toString(), fullname, email, phone,
    patientName: patientName||null, role:'caregiver',
    hash: await hashPass(pass), joinedAt: new Date().toISOString(),
  };
  users.push(user); saveUsers(users);
  sessionStorage.setItem('dh_cg_uid', user.id);
  // Sync to GHL
  try {
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ name: fullname, email, phone, patientName }),
    });
  } catch(e) { console.warn('[register] GHL sync failed:', e.message); }
  DHUserContext.configureGHLWidget(DHUserContext.getCaregiverContext());
  return { ok:true, user };
}
async function loginUser(email, pass) {
  const user = getUsers().find(u=>u.email===email);
  if (!user || user.hash !== await hashPass(pass)) return { error:'Invalid email or password.' };
  sessionStorage.setItem('dh_cg_uid', user.id);
  DHUserContext.configureGHLWidget(DHUserContext.getCaregiverContext());
  return { ok:true, user };
}
function logoutUser() {
  sessionStorage.removeItem('dh_cg_uid');
  S.opps=null; S.convos=null; S.calendars=null;
  location.hash=''; render();
}

// ══════════════════════════════════════════════════════════════
// ROUTING
// ══════════════════════════════════════════════════════════════
function getView() { return location.hash.replace('#','')||'dashboard'; }
window.addEventListener('hashchange', render);

// ══════════════════════════════════════════════════════════════
// CSS INJECTION
// ══════════════════════════════════════════════════════════════
(function injectCSS() {
  const s = document.createElement('style');
  s.textContent = `
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Plus Jakarta Sans',sans-serif}
    body{background:#F0F4F6;color:#1e293b}
    /* ── Layout ── */
    .dh-shell{display:flex;min-height:100vh}
    .dh-sidebar{width:260px;min-width:260px;background:#003D44;display:flex;flex-direction:column;padding:24px 16px;position:fixed;top:0;left:0;height:100vh;z-index:100;overflow-y:auto}
    .dh-main{margin-left:260px;min-height:100vh;background:#F0F4F6;width:calc(100% - 260px)}
    .dh-content{padding:28px 32px}
    /* ── Sidebar ── */
    .dh-logo-wrap{display:flex;align-items:center;gap:10px;margin-bottom:28px;padding:0 4px}
    .dh-logo-wrap img{height:36px;object-fit:contain}
    .dh-user-card{background:rgba(255,255,255,0.08);border-radius:14px;padding:14px;margin-bottom:24px;display:flex;align-items:center;gap:12px}
    .dh-avatar{width:40px;height:40px;border-radius:50%;background:#006D77;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0}
    .dh-user-name{color:#fff;font-size:13px;font-weight:600;line-height:1.3}
    .dh-user-role{color:rgba(255,255,255,0.4);font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
    .dh-nav-section{font-size:9px;font-weight:700;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:.1em;padding:0 10px;margin:16px 0 6px}
    .dh-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;text-decoration:none;margin-bottom:2px;cursor:pointer;transition:all .15s}
    .dh-nav-item:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8)}
    .dh-nav-item.active{background:#006D77;color:#fff}
    .dh-nav-icon{width:18px;height:18px;flex-shrink:0;opacity:0.7}
    .dh-nav-item.active .dh-nav-icon{opacity:1}
    .dh-sidebar-footer{margin-top:auto;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px}
    .dh-logout{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:rgba(248,113,113,.7);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .dh-logout:hover{background:rgba(248,113,113,.1);color:#f87171}
    /* ── Top bar ── */
    .dh-topbar{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
    .dh-topbar-title{font-size:18px;font-weight:700;color:#0f172a}
    .dh-topbar-sub{font-size:12px;color:#64748b;margin-top:2px}
    .dh-status-pill{display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;padding:5px 14px;font-size:11px;color:#15803d;font-weight:600}
    .dh-pulse-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    /* ── Cards ── */
    .dh-card{background:#fff;border-radius:16px;padding:20px 22px;border:1px solid #e8edf2}
    .dh-card-title{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .dh-card-title svg{width:16px;height:16px;color:#006D77;flex-shrink:0}
    /* ── Stat cards ── */
    .dh-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
    .dh-stat{background:#fff;border-radius:14px;padding:16px 18px;border:1px solid #e8edf2}
    .dh-stat-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
    .dh-stat-icon svg{width:18px;height:18px}
    .dh-stat-num{font-size:26px;font-weight:800;color:#0f172a;line-height:1}
    .dh-stat-label{font-size:11px;color:#64748b;font-weight:500;margin-top:4px}
    /* ── Badges ── */
    .dh-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .badge-track{background:#dcfce7;color:#15803d}
    .badge-due{background:#fef9c3;color:#a16207}
    .badge-over{background:#fee2e2;color:#b91c1c}
    .badge-active{background:#dbeafe;color:#1d4ed8}
    .badge-new{background:#f1f5f9;color:#475569}
    .badge-resolved{background:#d1fae5;color:#065f46}
    /* ── Table ── */
    .dh-table{width:100%;border-collapse:collapse;font-size:12.5px}
    .dh-table th{text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;border-bottom:2px solid #f1f5f9;font-weight:700}
    .dh-table td{padding:12px;border-bottom:1px solid #f8fafc;color:#374151;vertical-align:middle}
    .dh-table tr:last-child td{border-bottom:none}
    .dh-table tr:hover td{background:#fafcff}
    /* ── Buttons ── */
    .dh-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:10px;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;text-decoration:none}
    .dh-btn-primary{background:#003D44;color:#fff}
    .dh-btn-primary:hover{background:#006D77}
    .dh-btn-ghost{background:#f1f5f9;color:#475569}
    .dh-btn-ghost:hover{background:#e2e8f0}
    .dh-btn-danger{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
    /* ── Input ── */
    .dh-input{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;transition:border .2s;background:#f8fafc;color:#1e293b;font-family:inherit}
    .dh-input:focus{border-color:#006D77;box-shadow:0 0 0 3px rgba(0,109,119,.1);background:#fff}
    .dh-select{width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#374151;font-family:inherit}
    .dh-select:focus{border-color:#006D77}
    /* ── Auth ── */
    .dh-auth-bg{min-height:100vh;background:linear-gradient(135deg,#003D44 0%,#006D77 60%,#004D53 100%);display:flex;align-items:center;justify-content:center;padding:24px}
    .dh-auth-card{background:#fff;border-radius:24px;padding:40px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.18)}
    .dh-auth-logo{display:flex;align-items:center;justify-content:center;margin-bottom:28px}
    .dh-auth-logo img{height:44px;object-fit:contain}
    /* ── Filter chips ── */
    .dh-filters{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
    .dh-filter{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;transition:all .15s}
    .dh-filter.active{background:#003D44;color:#fff;border-color:#003D44}
    .dh-filter:hover:not(.active){border-color:#006D77;color:#006D77}
    /* ── Quick actions ── */
    .dh-qaction{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;transition:all .15s;width:100%;text-align:left}
    .dh-qaction:hover{border-color:#006D77;background:#f0fafa}
    .dh-qaction-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .dh-qaction-icon svg{width:16px;height:16px}
    .dh-qaction-title{font-size:12px;font-weight:600;color:#1e293b}
    .dh-qaction-sub{font-size:10px;color:#94a3b8;margin-top:1px}
    .dh-qaction.danger:hover{border-color:#ef4444;background:#fef2f2}
    /* ── KB cards ── */
    .dh-kb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .dh-kb-card{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px;cursor:pointer;transition:all .15s}
    .dh-kb-card:hover{border-color:#006D77;background:#f0fafa}
    .dh-kb-card.read{border-color:#bbf7d0;background:#f0fdf4}
    .dh-kb-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#006D77;margin-bottom:6px}
    .dh-kb-title{font-size:12px;font-weight:600;color:#1e293b;line-height:1.4}
    .dh-kb-link{font-size:10px;color:#006D77;font-weight:600;margin-top:6px}
    /* ── Modal ── */
    .dh-modal-overlay{position:fixed;inset:0;background:rgba(0,61,68,.5);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
    .dh-modal{background:#fff;border-radius:20px;padding:28px;width:100%;max-width:460px;box-shadow:0 24px 60px rgba(0,0,0,.15)}
    .dh-modal-title{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:4px}
    .dh-modal-sub{font-size:12px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:20px}
    /* ── Alert ── */
    .dh-alert-error{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px}
    .dh-alert-success{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px}
    /* ── Emergency banner ── */
    .dh-emergency{background:#fff;border:1.5px solid #fca5a5;border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:14px;margin-bottom:20px}
    .dh-emergency-icon{width:36px;height:36px;border-radius:9px;background:#fef2f2;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .dh-emergency-icon svg{width:18px;height:18px;color:#dc2626}
    .dh-emergency-text{font-size:13px;font-weight:600;color:#b91c1c}
    .dh-emergency-sub{font-size:11px;color:#ef4444;margin-top:2px}
    /* ── Spinner ── */
    .dh-spinner{width:18px;height:18px;border:2px solid #e2e8f0;border-top-color:#006D77;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}
    /* ── Mobile ── */
    .dh-mob-bar{display:none;background:#003D44;padding:14px 20px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:99}
    @media(max-width:768px){
      .dh-sidebar{display:none}
      .dh-main{margin-left:0;width:100%}
      .dh-content{padding:16px}
      .dh-mob-bar{display:flex}
      .dh-stats{grid-template-columns:repeat(2,1fr)}
      .dh-kb-grid{grid-template-columns:repeat(2,1fr)}
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════
// RENDER ENTRY
// ══════════════════════════════════════════════════════════════
function render() {
  const user = getCurrentUser();
  const app  = document.getElementById('app');
  if (!user) {
    const path = location.hash.replace('#','');
    app.innerHTML = path==='register' ? renderRegister() : renderLogin();
    if (path==='register') document.getElementById('regForm').addEventListener('submit', handleRegister);
    else document.getElementById('loginForm').addEventListener('submit', handleLogin);
    return;
  }
  app.innerHTML = renderShell(user, getView());
}

// ══════════════════════════════════════════════════════════════
// AUTH SCREENS
// ══════════════════════════════════════════════════════════════
function renderLogin(msg) {
  return `<div class="dh-auth-bg"><div class="dh-auth-card">
    <div class="dh-auth-logo"><img src="${CFG.logo}" alt="Dementia Singapore" onerror="this.style.display='none'"></div>
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a">Welcome back</h1>
      <p style="color:#64748b;font-size:13px;margin-top:4px">Sign in to your caregiver portal</p>
    </div>
    ${msg?`<div class="dh-alert-error">${esc(msg)}</div>`:''}
    <form id="loginForm" style="display:flex;flex-direction:column;gap:14px">
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Email address</label>
        <input id="loginEmail" class="dh-input" type="email" required placeholder="your@email.com" autocomplete="email">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Password</label>
        <input id="loginPass" class="dh-input" type="password" required placeholder="Your password" autocomplete="current-password">
      </div>
      <button type="submit" class="dh-btn dh-btn-primary" style="width:100%;justify-content:center;padding:12px;font-size:14px;margin-top:4px">Sign In</button>
    </form>
    <p style="text-align:center;font-size:13px;color:#64748b;margin-top:20px">New caregiver? <a href="#register" style="color:#006D77;font-weight:700;text-decoration:none">Create account</a></p>
  </div></div>`;
}
async function handleLogin(e) {
  e.preventDefault();
  const res = await loginUser(document.getElementById('loginEmail').value, document.getElementById('loginPass').value);
  if (res.error) { document.getElementById('app').innerHTML = renderLogin(res.error); document.getElementById('loginForm').addEventListener('submit', handleLogin); }
  else { location.hash='dashboard'; loadGHLData(); render(); }
}

function renderRegister(msg) {
  return `<div class="dh-auth-bg"><div class="dh-auth-card">
    <div class="dh-auth-logo"><img src="${CFG.logo}" alt="Dementia Singapore" onerror="this.style.display='none'"></div>
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a">Create your account</h1>
      <p style="color:#64748b;font-size:13px;margin-top:4px">Join the DementiaHub caregiver network</p>
    </div>
    ${msg?`<div class="dh-alert-error">${esc(msg)}</div>`:''}
    <form id="regForm" style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Full name</label>
        <input id="regName" class="dh-input" type="text" required placeholder="e.g. Jane Smith" autocomplete="name">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Email address</label>
        <input id="regEmail" class="dh-input" type="email" required placeholder="jane@email.com" autocomplete="email">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Phone number <span style="color:#94a3b8;font-weight:400;text-transform:none">(optional)</span></label>
        <input id="regPhone" class="dh-input" type="tel" placeholder="+65 9XXX XXXX" autocomplete="tel">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Name of person you care for <span style="color:#94a3b8;font-weight:400;text-transform:none">(optional)</span></label>
        <input id="regPatient" class="dh-input" type="text" placeholder="e.g. Mum, Dad, Mary Tan">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Password</label>
        <input id="regPass" class="dh-input" type="password" required placeholder="Min. 8 characters" minlength="8" autocomplete="new-password">
      </div>
      <button type="submit" class="dh-btn dh-btn-primary" style="width:100%;justify-content:center;padding:12px;font-size:14px;margin-top:4px">Create Account</button>
    </form>
    <p style="text-align:center;font-size:13px;color:#64748b;margin-top:20px">Already registered? <a href="#login" style="color:#006D77;font-weight:700;text-decoration:none">Sign in</a></p>
  </div></div>`;
}
async function handleRegister(e) {
  e.preventDefault();
  const res = await registerUser(
    document.getElementById('regName').value,
    document.getElementById('regEmail').value,
    document.getElementById('regPhone').value,
    document.getElementById('regPass').value,
    document.getElementById('regPatient').value,
  );
  if (res.error) { document.getElementById('app').innerHTML = renderRegister(res.error); document.getElementById('regForm').addEventListener('submit', handleRegister); }
  else { location.hash='dashboard'; loadGHLData(); render(); }
}

// ══════════════════════════════════════════════════════════════
// SHELL
// ══════════════════════════════════════════════════════════════
function renderShell(user, view) {
  const init   = (user.fullname||'U')[0].toUpperCase();
  const navItems = [
    { view:'dashboard', label:'Dashboard',  icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` },
    { view:'resources', label:'Resources',  icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>` },
  ];
  const navHtml = navItems.map(n => `
    <a class="dh-nav-item${view===n.view?' active':''}" href="#${n.view}">
      <span class="dh-nav-icon">${n.icon}</span>${n.label}
    </a>`).join('');

  let content = '';
  if (view==='dashboard') content = renderDashboard(user);
  else if (view==='resources') content = renderResources();

  const ctx    = DHUserContext.getCaregiverContext();
  const elVars = ctx ? JSON.stringify(DHUserContext.buildElevenLabsVars(ctx)) : '{}';

  return `
  <div class="dh-mob-bar">
    <img src="${CFG.logo}" style="height:28px;object-fit:contain;filter:brightness(0) invert(1)" alt="Logo" onerror="this.style.display='none'">
    <div style="display:flex;gap:16px;align-items:center">
      <a href="#dashboard" style="color:rgba(255,255,255,.6);font-size:12px;text-decoration:none">Dashboard</a>
      <a href="#resources" style="color:rgba(255,255,255,.6);font-size:12px;text-decoration:none">Resources</a>
      <span onclick="logoutUser()" style="color:#f87171;font-size:12px;cursor:pointer">Sign out</span>
    </div>
  </div>

  <div class="dh-shell">
    <div class="dh-sidebar">
      <div class="dh-logo-wrap">
        <img src="${CFG.logo}" alt="Dementia Singapore" style="filter:brightness(0) invert(1)" onerror="this.style.display='none'">
      </div>
      <div class="dh-user-card">
        <div class="dh-avatar">${init}</div>
        <div>
          <div class="dh-user-name">${esc(user.fullname)}</div>
          <div class="dh-user-role">Caregiver</div>
        </div>
      </div>
      <div class="dh-nav-section">Navigation</div>
      ${navHtml}
      ${user.patientName?`
      <div class="dh-nav-section">Caring For</div>
      <div style="padding:10px 12px;background:rgba(255,255,255,0.06);border-radius:10px;margin-bottom:4px">
        <div style="color:rgba(255,255,255,.8);font-size:13px;font-weight:600">${esc(user.patientName)}</div>
        <div style="color:rgba(255,255,255,.35);font-size:10px;margin-top:2px">Your care recipient</div>
      </div>`:''}
      <div class="dh-nav-section">Emergency</div>
      <a href="tel:6377-0700" class="dh-nav-item" style="color:rgba(248,113,113,.8)">
        <span class="dh-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span>
        Helpline: 6377 0700
      </a>
      <div class="dh-sidebar-footer">
        <div class="dh-logout" onclick="logoutUser()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </div>
      </div>
    </div>

    <div class="dh-main">
      <div class="dh-topbar">
        <div>
          <div class="dh-topbar-title">Good ${getGreeting()}, ${esc(user.fullname.split(' ')[0])}</div>
          <div class="dh-topbar-sub">${new Date().toLocaleDateString('en-SG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
        <div class="dh-status-pill">
          <div class="dh-pulse-dot"></div>
          Support available 24/7
        </div>
      </div>
      <div class="dh-content">${content}</div>
    </div>
  </div>

  <div id="modal-root"></div>

  <!-- ElevenLabs Widget -->
  <div style="position:fixed;bottom:24px;right:28px;z-index:200;">
    ${ctx?`<elevenlabs-convai
      id="dh-el-widget"
      agent-id="${esc(CFG.elevenLabsAgentId)}"
      dynamic-variables='${elVars}'
      style="display:block;width:380px;">
    </elevenlabs-convai>`:''}
  </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h<12) return 'morning';
  if (h<17) return 'afternoon';
  return 'evening';
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderDashboard(user) {
  const opps     = S.opps;
  const loading  = opps===null;
  const total    = !loading ? opps.length : 0;
  const active   = !loading ? opps.filter(o=>getStatus(o)==='active').length : 0;
  const resolved = !loading ? opps.filter(o=>getStatus(o)==='resolved').length : 0;
  const overdue  = !loading ? opps.filter(o=>getSLA(o).h>=48).length : 0;
  const filtered = !loading ? getFiltered(opps) : [];

  // ── Emergency banner ──
  const emergencyBanner = `
    <div class="dh-emergency">
      <div class="dh-emergency-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div style="flex:1">
        <div class="dh-emergency-text">24/7 Dementia Helpline</div>
        <div class="dh-emergency-sub">For urgent support call 6377 0700 · Life-threatening emergencies: 995</div>
      </div>
      <a href="tel:6377-0700" class="dh-btn dh-btn-danger" style="font-size:11px;padding:7px 16px;flex-shrink:0">Call Now</a>
    </div>`;

  // ── Stats ──
  const stats = `
    <div class="dh-stats">
      <div class="dh-stat">
        <div class="dh-stat-icon" style="background:#eff6ff">
          <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="dh-stat-num">${loading?'…':total}</div>
        <div class="dh-stat-label">Total cases</div>
      </div>
      <div class="dh-stat">
        <div class="dh-stat-icon" style="background:#fff7ed">
          <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="dh-stat-num">${loading?'…':active}</div>
        <div class="dh-stat-label">Active support</div>
      </div>
      <div class="dh-stat">
        <div class="dh-stat-icon" style="background:#fef2f2">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="dh-stat-num">${loading?'…':overdue}</div>
        <div class="dh-stat-label">Need attention</div>
      </div>
      <div class="dh-stat">
        <div class="dh-stat-icon" style="background:#f0fdf4">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="dh-stat-num">${loading?'…':resolved}</div>
        <div class="dh-stat-label">Resolved</div>
      </div>
    </div>`;

  // ── Case rows ──
  let caseRows = '';
  if (loading) {
    caseRows = `<tr><td colspan="4" style="text-align:center;padding:40px"><div class="dh-spinner" style="margin:0 auto 10px"></div><div style="color:#94a3b8;font-size:13px">Loading your cases…</div></td></tr>`;
  } else if (!filtered.length) {
    caseRows = `<tr><td colspan="4" style="text-align:center;padding:40px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin:0 auto 10px;display:block"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <div style="color:#94a3b8;font-size:13px;font-weight:500">No cases found</div>
    </td></tr>`;
  } else {
    caseRows = filtered.map((op,i) => {
      const sla    = getSLA(op);
      const status = getStatus(op);
      const stBadge = status==='resolved'
        ? '<span class="dh-badge badge-resolved">Resolved</span>'
        : status==='active'
          ? '<span class="dh-badge badge-active">Active</span>'
          : '<span class="dh-badge badge-new">New</span>';
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:8px;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0369a1;flex-shrink:0">
              ${(op.contact?.name||'?')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-size:13px;font-weight:600;color:#1e293b">${esc(op.contact?.name||'Unknown')}</div>
              <div style="font-size:10px;color:#94a3b8">${esc(op.contact?.phone||op.contact?.email||'')}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size:12px;font-weight:500;color:#374151;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(op.name||'—')}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${esc(op.pipelineStageName||'')}</div>
        </td>
        <td>${stBadge}</td>
        <td>
          <span class="dh-badge ${sla.cls}">${sla.label}</span>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${timeAgo(op.updatedAt)}</div>
        </td>
        <td>
          <div style="display:flex;gap:6px;justify-content:flex-end">
            <button onclick="openNoteModal(${i})" class="dh-btn dh-btn-ghost" style="padding:6px 10px;font-size:11px" title="Add note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Note
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── AI Assistant card ──
  const aiCard = `
    <div class="dh-card" style="background:linear-gradient(135deg,#003D44,#006D77);border:none;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <img src="${CFG.logo}" style="height:28px;filter:brightness(0) invert(1);object-fit:contain" onerror="this.style.display='none'">
        <div>
          <div style="color:#fff;font-size:13px;font-weight:700">AI Care Assistant</div>
          <div style="color:rgba(255,255,255,.5);font-size:10px">Available 24/7 — voice or text</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:5px">
          <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite"></div>
          <span style="color:#4ade80;font-size:10px;font-weight:600">Online</span>
        </div>
      </div>
      <p style="color:rgba(255,255,255,.65);font-size:12px;line-height:1.6;margin-bottom:14px">
        Get instant support for caregiving questions, safety concerns, or just someone to talk to. Click the widget at the bottom right to start.
      </p>
      <button onclick="document.getElementById('dh-el-widget').scrollIntoView({behavior:'smooth'})" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:9px 16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;width:100%;text-align:center">
        Open AI Assistant
      </button>
    </div>`;

  // ── Quick actions ──
  const quickActions = `
    <div class="dh-card" style="margin-bottom:14px">
      <div class="dh-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Quick actions
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="openNoteModal(null)" class="dh-qaction">
          <div class="dh-qaction-icon" style="background:#eff6ff"><svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
          <div><div class="dh-qaction-title">Add a case note</div><div class="dh-qaction-sub">Sync to your support record</div></div>
        </button>
        <button onclick="openCallbackModal(null)" class="dh-qaction">
          <div class="dh-qaction-icon" style="background:#f0fdf4"><svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div><div class="dh-qaction-title">Request a callback</div><div class="dh-qaction-sub">Book a time with our team</div></div>
        </button>
        <a href="tel:6377-0700" class="dh-qaction">
          <div class="dh-qaction-icon" style="background:#fef9c3"><svg viewBox="0 0 24 24" fill="none" stroke="#a16207" stroke-width="2" width="16" height="16"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
          <div><div class="dh-qaction-title">Dementia helpline</div><div class="dh-qaction-sub">6377 0700 · Mon–Sat</div></div>
        </a>
        <a href="tel:995" class="dh-qaction danger">
          <div class="dh-qaction-icon" style="background:#fef2f2"><svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <div><div class="dh-qaction-title" style="color:#dc2626">Emergency — call 995</div><div class="dh-qaction-sub">Life-threatening situations only</div></div>
        </a>
      </div>
    </div>`;

  // ── Knowledge base ──
  const kb = [
    { icon:'🧠', title:'Understanding Dementia Stages',     tag:'Education',  key:'stages'   },
    { icon:'❤️', title:'Caregiver Burnout Warning Signs',   tag:'Wellbeing',  key:'burnout'  },
    { icon:'💊', title:'Medication Management Guide',        tag:'Medical',    key:'meds'     },
    { icon:'🏠', title:'Home Safety Checklist',              tag:'Safety',     key:'home'     },
    { icon:'👥', title:'CARA Registration Process',          tag:'Admin',      key:'cara'     },
    { icon:'📞', title:'Singapore Helplines Directory',      tag:'Emergency',  key:'helplines'},
  ];
  const kbCards = kb.map(r => {
    const v = S.kbViewed.includes(r.key);
    return `<div onclick="markKBViewed('${r.key}')" class="dh-kb-card${v?' read':''}">
      <div class="dh-kb-tag">${v?'✓ Read':r.tag}</div>
      <div class="dh-kb-title">${r.title}</div>
      <div class="dh-kb-link">${v?'Review again →':'Learn more →'}</div>
    </div>`;
  }).join('');

  return `
    ${emergencyBanner}
    ${stats}
    <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;margin-bottom:16px">
      <div class="dh-card">
        <div class="dh-card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          My support cases
        </div>
        <div class="dh-filters">
          ${['all','active','new','resolved'].map(f=>`
            <button class="dh-filter${S.filter===f?' active':''}" onclick="setFilter('${f}')">
              ${f==='all'?'All ('+total+')':f==='active'?'Active ('+active+')':f==='new'?'New':f==='resolved'?'Resolved ('+resolved+')':f}
            </button>`).join('')}
        </div>
        <div style="overflow-x:auto">
          <table class="dh-table">
            <thead><tr>
              <th>Contact</th><th>Case</th><th>Status</th><th>Last updated</th><th style="text-align:right">Actions</th>
            </tr></thead>
            <tbody>${caseRows}</tbody>
          </table>
        </div>
      </div>
      <div>
        ${aiCard}
        ${quickActions}
      </div>
    </div>
    <div class="dh-card">
      <div class="dh-card-title" style="justify-content:space-between">
        <span style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Knowledge base
        </span>
        <span style="font-size:10px;font-weight:700;color:#006D77;text-transform:uppercase;letter-spacing:.05em">${S.kbViewed.length}/${kb.length} Read</span>
      </div>
      <div class="dh-kb-grid">${kbCards}</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// RESOURCES
// ══════════════════════════════════════════════════════════════
function renderResources() {
  const items = [
    ['Understanding Dementia','Learn the stages, signs, and how to respond with care.','Education'],
    ['Caregiver Self-Care','Maintaining your own wellbeing while supporting others.','Wellbeing'],
    ['Medication Guide','Safely managing medications for someone with dementia.','Medical'],
    ['Home Safety','Make the home safer and more dementia-friendly.','Safety'],
    ['Support Groups','Find local and online communities near you.','Community'],
    ['Emergency Contacts','Key helplines and crisis resources in Singapore.','Emergency'],
    ['Daily Routines','Structuring days to reduce anxiety and confusion.','Daily Care'],
    ['Communication Tips','Communicate effectively with a person with dementia.','Skills'],
  ];
  return `
    <div style="margin-bottom:24px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a">Resources</h1>
      <p style="color:#64748b;margin-top:4px;font-size:13px">Guides and information to support your caregiving journey.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      ${items.map(([t,d,tag])=>`
        <div class="dh-card" style="cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.08)'" onmouseout="this.style.boxShadow='none'">
          <div style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 10px;border-radius:20px;margin-bottom:10px">${tag}</div>
          <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;line-height:1.4">${t}</h3>
          <p style="color:#64748b;font-size:12px;line-height:1.6;margin-bottom:12px">${d}</p>
          <span style="color:#006D77;font-size:12px;font-weight:600">Learn more →</span>
        </div>`).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════
function setFilter(f) { S.filter=f; render(); }

function markKBViewed(key) {
  if (!S.kbViewed.includes(key)) {
    S.kbViewed.push(key);
    localStorage.setItem('dh_kb_viewed', JSON.stringify(S.kbViewed));
    render();
  }
}

// ── Note Modal ──
let _noteIdx = null;
function openNoteModal(idx) {
  _noteIdx = idx;
  const op   = idx!==null ? (S.opps||[])[idx] : null;
  const name = op?.contact?.name||'';
  document.getElementById('modal-root').innerHTML=`
    <div class="dh-modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dh-modal">
        <div class="dh-modal-title">Add case note</div>
        <div class="dh-modal-sub">Syncing to: ${esc(name||'your support record')}</div>
        ${!name?`<div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Contact ID</label>
          <input id="noteContactId" class="dh-input" placeholder="GHL Contact ID">
        </div>`:''}
        <textarea id="noteText" class="dh-input" style="resize:none;height:120px;margin-bottom:8px" placeholder="Describe the update or situation…"></textarea>
        <div id="noteResult"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button id="noteBtn" onclick="submitNote()" class="dh-btn dh-btn-primary" style="flex:1;justify-content:center">Save note</button>
          <button onclick="closeModal()" class="dh-btn dh-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function submitNote() {
  const text = document.getElementById('noteText').value.trim();
  const btn  = document.getElementById('noteBtn');
  const res  = document.getElementById('noteResult');
  const op   = _noteIdx!==null ? (S.opps||[])[_noteIdx] : null;
  const cid  = op?.contact?.id||(document.getElementById('noteContactId')?.value||'').trim();
  if (!text) { res.innerHTML='<div class="dh-alert-error">Please enter a note.</div>'; return; }
  if (!cid)  { res.innerHTML='<div class="dh-alert-error">No contact found.</div>'; return; }
  btn.innerHTML='<span class="dh-spinner"></span>'; btn.disabled=true;
  try {
    await postNote(cid, text);
    res.innerHTML='<div class="dh-alert-success">Note saved successfully.</div>';
    document.getElementById('noteText').value='';
    setTimeout(closeModal, 1500);
  } catch(e) { res.innerHTML=`<div class="dh-alert-error">Failed: ${esc(e.message)}</div>`; }
  finally { btn.innerHTML='Save note'; btn.disabled=false; }
}

// ── Callback Modal ──
let _cbIdx = null;
function openCallbackModal(idx) {
  _cbIdx = idx;
  const op  = idx!==null ? (S.opps||[])[idx] : null;
  const cid = op?.contact?.id||'';
  const today = new Date().toISOString().split('T')[0];
  const calOpts = S.calendars?.length
    ? S.calendars.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
    : '<option value="">No calendars available</option>';
  document.getElementById('modal-root').innerHTML=`
    <div class="dh-modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dh-modal">
        <div class="dh-modal-title">Request a callback</div>
        <div class="dh-modal-sub">Our team will call you at your chosen time</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Calendar</label>
            <select id="cbCal" class="dh-select">${calOpts}</select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Date</label>
              <input id="cbDate" class="dh-input" type="date" min="${today}" value="${today}">
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Time</label>
              <input id="cbTime" class="dh-input" type="time" value="10:00">
            </div>
          </div>
        </div>
        <div id="cbResult" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button id="cbBtn" onclick="submitCallback2('${cid}')" class="dh-btn dh-btn-primary" style="flex:1;justify-content:center">Book callback</button>
          <button onclick="closeModal()" class="dh-btn dh-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function submitCallback2(cid) {
  const cal  = document.getElementById('cbCal').value;
  const date = document.getElementById('cbDate').value;
  const time = document.getElementById('cbTime').value;
  const btn  = document.getElementById('cbBtn');
  const res  = document.getElementById('cbResult');
  if (!cal||!date||!time) { res.innerHTML='<div class="dh-alert-error">Please fill all fields.</div>'; return; }
  const start = new Date(date+'T'+time+':00').toISOString();
  const end   = new Date(new Date(start).getTime()+30*60000).toISOString();
  btn.innerHTML='<span class="dh-spinner"></span>'; btn.disabled=true;
  try {
    await scheduleCallback(cal, cid||'', start, end);
    res.innerHTML='<div class="dh-alert-success">Callback booked. Our team will contact you shortly.</div>';
    setTimeout(closeModal, 2000);
  } catch(e) { res.innerHTML=`<div class="dh-alert-error">Failed: ${esc(e.message)}</div>`; }
  finally { btn.innerHTML='Book callback'; btn.disabled=false; }
}

function closeModal() { document.getElementById('modal-root').innerHTML=''; }

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
render();
if (getCurrentUser()) loadGHLData();
