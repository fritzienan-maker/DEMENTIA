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
  convos:   null,
  kbViewed: JSON.parse(localStorage.getItem('dh_kb_viewed') || '[]'),
  kbFilter: 'all',
};

// ══════════════════════════════════════════════════════════════
// GHL DATA — only fetch conversations for this caregiver
// ══════════════════════════════════════════════════════════════
async function loadGHLData() {
  try {
    const { convos } = await DHAPI.loadDashboardData();
    S.convos = convos;
  } catch(e) {
    console.error('[loadGHLData]', e.message);
    S.convos = [];
  }
  render();
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
function getGreeting() {
  const h = new Date().getHours();
  if (h<12) return 'Good morning';
  if (h<17) return 'Good afternoon';
  return 'Good evening';
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
  S.convos=null;
  location.hash=''; render();
}

// ══════════════════════════════════════════════════════════════
// ROUTING
// ══════════════════════════════════════════════════════════════
function getView() { return location.hash.replace('#','')||'home'; }
window.addEventListener('hashchange', render);

// ══════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════
(function injectCSS() {
  if (document.getElementById('dh-styles')) return;
  const s = document.createElement('style');
  s.id = 'dh-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Plus Jakarta Sans',sans-serif}
    body{background:#F0F4F6;color:#1e293b}
    a{text-decoration:none;color:inherit}
    /* ── Layout ── */
    .dh-shell{display:flex;min-height:100vh}
    .dh-sidebar{width:256px;min-width:256px;background:#003D44;display:flex;flex-direction:column;padding:20px 14px;position:fixed;top:0;left:0;height:100vh;z-index:100;overflow-y:auto}
    .dh-main{margin-left:256px;min-height:100vh;background:#F0F4F6;width:calc(100% - 256px)}
    .dh-content{padding:28px 30px}
    /* ── Sidebar ── */
    .dh-logo-wrap{margin-bottom:24px;padding:4px 6px}
    .dh-logo-wrap img{height:32px;object-fit:contain;filter:brightness(0) invert(1)}
    .dh-user-card{background:rgba(255,255,255,0.07);border-radius:14px;padding:14px;margin-bottom:22px;display:flex;align-items:center;gap:12px}
    .dh-avatar{width:38px;height:38px;border-radius:50%;background:#006D77;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;text-transform:uppercase}
    .dh-user-name{color:#fff;font-size:13px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dh-user-since{color:rgba(255,255,255,0.35);font-size:10px;margin-top:2px}
    .dh-nav-sec{font-size:9px;font-weight:700;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:.1em;padding:0 8px;margin:16px 0 6px}
    .dh-nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;margin-bottom:2px;cursor:pointer;transition:all .15s}
    .dh-nav-item:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8)}
    .dh-nav-item.active{background:#006D77;color:#fff}
    .dh-nav-item svg{width:16px;height:16px;flex-shrink:0;opacity:.7}
    .dh-nav-item.active svg{opacity:1}
    .dh-caring-chip{background:rgba(255,255,255,0.07);border-radius:10px;padding:10px 12px;margin-bottom:4px}
    .dh-caring-label{color:rgba(255,255,255,0.3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    .dh-caring-name{color:rgba(255,255,255,0.8);font-size:13px;font-weight:600}
    .dh-sidebar-footer{margin-top:auto;border-top:1px solid rgba(255,255,255,0.07);padding-top:14px}
    .dh-logout{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:rgba(248,113,113,.7);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .dh-logout:hover{background:rgba(248,113,113,.08);color:#f87171}
    /* ── Topbar ── */
    .dh-topbar{background:#fff;border-bottom:1px solid #e8edf2;padding:14px 30px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
    .dh-topbar-title{font-size:17px;font-weight:800;color:#0f172a}
    .dh-topbar-sub{font-size:11px;color:#94a3b8;margin-top:2px;font-weight:500}
    .dh-online-pill{display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;padding:5px 14px;font-size:11px;color:#15803d;font-weight:600}
    .dh-pulse{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:dhpulse 2s infinite}
    @keyframes dhpulse{0%,100%{opacity:1}50%{opacity:.35}}
    /* ── Cards ── */
    .dh-card{background:#fff;border-radius:16px;padding:20px 22px;border:1px solid #e8edf2}
    .dh-card-title{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    .dh-card-title svg{width:16px;height:16px;color:#006D77;flex-shrink:0}
    /* ── Hero banner ── */
    .dh-hero{border-radius:18px;overflow:hidden;position:relative;margin-bottom:20px;min-height:180px;display:flex;align-items:flex-end}
    .dh-hero-bg{position:absolute;inset:0;background:linear-gradient(135deg,#003D44 0%,#006D77 50%,#1D9E75 100%);z-index:0}
    .dh-hero-img{position:absolute;right:0;top:0;bottom:0;width:45%;object-fit:cover;opacity:.25;z-index:1}
    .dh-hero-content{position:relative;z-index:2;padding:28px 30px;flex:1}
    .dh-hero-greeting{font-size:22px;font-weight:800;color:#fff;margin-bottom:6px;line-height:1.2}
    .dh-hero-sub{font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:18px;line-height:1.6;max-width:480px}
    .dh-hero-btn{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:10px 18px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
    .dh-hero-btn:hover{background:rgba(255,255,255,0.25)}
    .dh-hero-stats{display:flex;gap:24px;margin-top:6px}
    .dh-hero-stat{text-align:left}
    .dh-hero-stat-num{font-size:20px;font-weight:800;color:#fff}
    .dh-hero-stat-label{font-size:10px;color:rgba(255,255,255,.5);font-weight:500;margin-top:1px}
    /* ── Emergency ── */
    .dh-emergency{background:linear-gradient(135deg,#fef2f2,#fff5f5);border:1.5px solid #fca5a5;border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:14px;margin-bottom:20px}
    .dh-emergency svg{width:20px;height:20px;color:#dc2626;flex-shrink:0}
    .dh-emg-title{font-size:13px;font-weight:700;color:#b91c1c}
    .dh-emg-sub{font-size:11px;color:#ef4444;margin-top:2px}
    .dh-emg-btn{margin-left:auto;background:#dc2626;color:#fff;border:none;border-radius:9px;padding:8px 16px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
    /* ── AI card ── */
    .dh-ai-card{background:linear-gradient(135deg,#003D44,#006D77);border-radius:16px;padding:20px;margin-bottom:14px;border:none;position:relative;overflow:hidden}
    .dh-ai-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:3px 10px;font-size:10px;color:rgba(255,255,255,.8);font-weight:600;margin-bottom:10px}
    .dh-ai-title{font-size:16px;font-weight:800;color:#fff;margin-bottom:6px}
    .dh-ai-sub{font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:16px}
    .dh-ai-btn{display:block;width:100%;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:all .15s;margin-bottom:6px}
    .dh-ai-btn:hover{background:rgba(255,255,255,.25)}
    .dh-ai-btn.primary{background:#fff;color:#003D44}
    .dh-ai-btn.primary:hover{background:rgba(255,255,255,.9)}
    /* ── Quick actions ── */
    .dh-qgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .dh-qbtn{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px;border-radius:12px;border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;transition:all .15s;text-align:left}
    .dh-qbtn:hover{border-color:#006D77;background:#f0fafa}
    .dh-qbtn-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center}
    .dh-qbtn-icon svg{width:15px;height:15px}
    .dh-qbtn-title{font-size:12px;font-weight:700;color:#1e293b}
    .dh-qbtn-sub{font-size:10px;color:#94a3b8}
    /* ── History ── */
    .dh-history-item{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #f1f5f9}
    .dh-history-item:last-child{border-bottom:none}
    .dh-history-avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px}
    .dh-history-name{font-size:13px;font-weight:600;color:#1e293b}
    .dh-history-preview{font-size:11px;color:#94a3b8;margin-top:2px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .dh-history-time{font-size:10px;color:#cbd5e1;margin-left:auto;flex-shrink:0;white-space:nowrap;padding-top:2px}
    .dh-unread{background:#003D44;color:#fff;font-size:9px;font-weight:700;border-radius:20px;padding:2px 7px;margin-top:4px;display:inline-block}
    /* ── KB ── */
    .dh-kb-filters{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
    .dh-kb-chip{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:600;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;transition:all .15s}
    .dh-kb-chip.active{background:#003D44;color:#fff;border-color:#003D44}
    .dh-kb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .dh-kb-card{border-radius:14px;overflow:hidden;border:1.5px solid #e8edf2;background:#fff;cursor:pointer;transition:all .2s}
    .dh-kb-card:hover{border-color:#006D77;transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.06)}
    .dh-kb-card.read{border-color:#bbf7d0}
    .dh-kb-img{width:100%;height:100px;object-fit:cover;display:block}
    .dh-kb-img-placeholder{width:100%;height:100px;display:flex;align-items:center;justify-content:center;font-size:28px}
    .dh-kb-body{padding:14px}
    .dh-kb-tag-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
    .dh-kb-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:20px}
    .dh-kb-read-badge{font-size:9px;font-weight:700;color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:20px}
    .dh-kb-title{font-size:13px;font-weight:700;color:#1e293b;line-height:1.4;margin-bottom:6px}
    .dh-kb-desc{font-size:11px;color:#64748b;line-height:1.5;margin-bottom:8px}
    .dh-kb-link{font-size:11px;color:#006D77;font-weight:700}
    /* ── Helplines ── */
    .dh-helpline-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .dh-helpline-card{border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;border:1.5px solid transparent;cursor:pointer;transition:all .15s}
    .dh-helpline-card:hover{transform:translateY(-1px)}
    .dh-helpline-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .dh-helpline-icon svg{width:18px;height:18px}
    .dh-helpline-name{font-size:12px;font-weight:700;color:#1e293b}
    .dh-helpline-num{font-size:13px;font-weight:800;color:#006D77;margin-top:2px}
    .dh-helpline-hours{font-size:10px;color:#94a3b8;margin-top:1px}
    /* ── Auth ── */
    .dh-auth-bg{min-height:100vh;background:linear-gradient(135deg,#003D44 0%,#006D77 55%,#1D9E75 100%);display:flex;align-items:center;justify-content:center;padding:24px}
    .dh-auth-card{background:#fff;border-radius:24px;padding:40px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.2)}
    .dh-auth-logo{display:flex;justify-content:center;margin-bottom:24px}
    .dh-auth-logo img{height:40px;object-fit:contain}
    .dh-input{width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;transition:border .2s;background:#f8fafc;color:#1e293b;font-family:inherit}
    .dh-input:focus{border-color:#006D77;box-shadow:0 0 0 3px rgba(0,109,119,.1);background:#fff}
    .dh-select{width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#374151;font-family:inherit}
    .dh-btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;border-radius:10px;background:#003D44;color:#fff;font-size:14px;font-weight:700;border:none;cursor:pointer;transition:all .15s;font-family:inherit}
    .dh-btn-primary:hover{background:#006D77}
    .dh-btn-ghost{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:10px;background:#f1f5f9;color:#475569;font-size:12px;font-weight:600;border:none;cursor:pointer;transition:all .15s;font-family:inherit}
    .dh-btn-ghost:hover{background:#e2e8f0}
    .dh-alert-error{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:12px}
    .dh-alert-success{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:12px}
    /* ── Modal ── */
    .dh-overlay{position:fixed;inset:0;background:rgba(0,61,68,.5);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
    .dh-modal{background:#fff;border-radius:20px;padding:28px;width:100%;max-width:440px}
    .dh-modal-title{font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px}
    .dh-modal-sub{font-size:12px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:18px}
    .dh-spinner{width:16px;height:16px;border:2px solid #e2e8f0;border-top-color:#006D77;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}
    @keyframes spin{to{transform:rotate(360deg)}}
    /* ── Mobile ── */
    .dh-mob-bar{display:none;background:#003D44;padding:12px 18px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:99}
    @media(max-width:768px){
      .dh-sidebar{display:none}
      .dh-main{margin-left:0;width:100%}
      .dh-content{padding:14px}
      .dh-mob-bar{display:flex}
      .dh-kb-grid{grid-template-columns:repeat(2,1fr)}
      .dh-helpline-grid{grid-template-columns:1fr}
      .dh-hero-img{display:none}
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
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px">Welcome back</h1>
      <p style="color:#64748b;font-size:13px">Sign in to your caregiver portal</p>
    </div>
    ${msg?`<div class="dh-alert-error">${esc(msg)}</div>`:''}
    <form id="loginForm" style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Email address</label>
        <input id="loginEmail" class="dh-input" type="email" required placeholder="your@email.com" autocomplete="email">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Password</label>
        <input id="loginPass" class="dh-input" type="password" required placeholder="Your password" autocomplete="current-password">
      </div>
      <button type="submit" class="dh-btn-primary" style="margin-top:4px">Sign In</button>
    </form>
    <p style="text-align:center;font-size:13px;color:#64748b;margin-top:18px">New caregiver? <a href="#register" style="color:#006D77;font-weight:700">Create account</a></p>
  </div></div>`;
}
async function handleLogin(e) {
  e.preventDefault();
  const res = await loginUser(document.getElementById('loginEmail').value, document.getElementById('loginPass').value);
  if (res.error) {
    document.getElementById('app').innerHTML = renderLogin(res.error);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  } else { location.hash='home'; loadGHLData(); render(); }
}

function renderRegister(msg) {
  return `<div class="dh-auth-bg"><div class="dh-auth-card">
    <div class="dh-auth-logo"><img src="${CFG.logo}" alt="Dementia Singapore" onerror="this.style.display='none'"></div>
    <div style="text-align:center;margin-bottom:22px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px">Create your account</h1>
      <p style="color:#64748b;font-size:13px">Join the DementiaHub caregiver network</p>
    </div>
    ${msg?`<div class="dh-alert-error">${esc(msg)}</div>`:''}
    <form id="regForm" style="display:flex;flex-direction:column;gap:11px">
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Full name</label>
        <input id="regName" class="dh-input" type="text" required placeholder="Jane Smith" autocomplete="name">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Email address</label>
        <input id="regEmail" class="dh-input" type="email" required placeholder="jane@email.com" autocomplete="email">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Phone <span style="color:#94a3b8;font-weight:400;text-transform:none">(optional)</span></label>
        <input id="regPhone" class="dh-input" type="tel" placeholder="+65 9XXX XXXX" autocomplete="tel">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Who are you caring for? <span style="color:#94a3b8;font-weight:400;text-transform:none">(optional)</span></label>
        <input id="regPatient" class="dh-input" type="text" placeholder="e.g. Mum, Dad, Mary Tan">
      </div>
      <div>
        <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Password</label>
        <input id="regPass" class="dh-input" type="password" required placeholder="Min. 8 characters" minlength="8" autocomplete="new-password">
      </div>
      <button type="submit" class="dh-btn-primary" style="margin-top:4px">Create Account</button>
    </form>
    <p style="text-align:center;font-size:13px;color:#64748b;margin-top:18px">Already registered? <a href="#login" style="color:#006D77;font-weight:700">Sign in</a></p>
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
  if (res.error) {
    document.getElementById('app').innerHTML = renderRegister(res.error);
    document.getElementById('regForm').addEventListener('submit', handleRegister);
  } else { location.hash='home'; loadGHLData(); render(); }
}

// ══════════════════════════════════════════════════════════════
// SHELL
// ══════════════════════════════════════════════════════════════
function renderShell(user, view) {
  const init = (user.fullname||'U').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const nav  = [
    { v:'home',      label:'Home',         icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
    { v:'history',   label:'My History',   icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
    { v:'resources', label:'Resources',    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>` },
    { v:'helplines', label:'Helplines',    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>` },
  ];

  let content = '';
  if      (view==='home')      content = renderHome(user);
  else if (view==='history')   content = renderHistory(user);
  else if (view==='resources') content = renderResources();
  else if (view==='helplines') content = renderHelplines();
  else content = renderHome(user);

  const ctx    = DHUserContext.getCaregiverContext();
  const elVars = ctx ? JSON.stringify(DHUserContext.buildElevenLabsVars(ctx)) : '{}';

  return `
  <div class="dh-mob-bar">
    <img src="${CFG.logo}" style="height:26px;object-fit:contain;filter:brightness(0) invert(1)" alt="Logo" onerror="this.style.display='none'">
    <div style="display:flex;gap:14px;align-items:center">
      ${nav.map(n=>`<a href="#${n.v}" style="color:${view===n.v?'#fff':'rgba(255,255,255,.5)'};font-size:11px;font-weight:600">${n.label}</a>`).join('')}
      <span onclick="logoutUser()" style="color:#f87171;font-size:11px;font-weight:600;cursor:pointer">Out</span>
    </div>
  </div>

  <div class="dh-shell">
    <div class="dh-sidebar">
      <div class="dh-logo-wrap">
        <img src="${CFG.logo}" alt="Dementia Singapore" onerror="this.style.display='none'">
      </div>
      <div class="dh-user-card">
        <div class="dh-avatar">${init}</div>
        <div style="min-width:0">
          <div class="dh-user-name">${esc(user.fullname)}</div>
          <div class="dh-user-since">Member since ${fmtDate(user.joinedAt)}</div>
        </div>
      </div>

      ${user.patientName?`
      <div class="dh-caring-chip" style="margin-bottom:16px">
        <div class="dh-caring-label">Caring for</div>
        <div class="dh-caring-name">${esc(user.patientName)}</div>
      </div>`:''}

      <div class="dh-nav-sec">Menu</div>
      ${nav.map(n=>`
        <a class="dh-nav-item${view===n.v?' active':''}" href="#${n.v}">
          ${n.icon}${n.label}
        </a>`).join('')}

      <div class="dh-nav-sec">Emergency</div>
      <a href="tel:6377-0700" class="dh-nav-item" style="color:rgba(248,113,113,.8)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Helpline 6377 0700
      </a>

      <div class="dh-sidebar-footer">
        <div class="dh-logout" onclick="logoutUser()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign out
        </div>
      </div>
    </div>

    <div class="dh-main">
      <div class="dh-topbar">
        <div>
          <div class="dh-topbar-title">${view==='home'?'Dashboard':view==='history'?'My History':view==='resources'?'Resources':'Helplines & Emergency'}</div>
          <div class="dh-topbar-sub">${new Date().toLocaleDateString('en-SG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
        </div>
        <div class="dh-online-pill">
          <div class="dh-pulse"></div>
          Support available 24/7
        </div>
      </div>
      <div class="dh-content">${content}</div>
    </div>
  </div>

  <div id="modal-root"></div>

  <div style="position:fixed;bottom:24px;right:28px;z-index:200;">
    ${ctx?`<elevenlabs-convai
      id="dh-el-widget"
      agent-id="${esc(CFG.elevenLabsAgentId)}"
      dynamic-variables='${elVars}'
      style="display:block;width:380px;">
    </elevenlabs-convai>`:''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// HOME VIEW
// ══════════════════════════════════════════════════════════════
function renderHome(user) {
  const firstName = user.fullname.split(' ')[0];

  const heroBanner = `
    <div class="dh-hero" style="margin-bottom:20px">
      <div class="dh-hero-bg"></div>
      <img class="dh-hero-img" src="https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/image_0.png" alt="" onerror="this.style.display='none'">
      <div class="dh-hero-content">
        <div class="dh-hero-greeting">${getGreeting()}, ${esc(firstName)}.</div>
        <p class="dh-hero-sub">${user.patientName?`You're supporting <strong style="color:#fff">${esc(user.patientName)}</strong> today. We're here with you every step of the way.`:`You're not alone in this journey. Our team and AI assistant are here to help whenever you need.`}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button onclick="document.getElementById('dh-el-widget').scrollIntoView({behavior:'smooth'})" class="dh-hero-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Talk to AI Assistant
          </button>
          <a href="#resources" class="dh-hero-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Browse Resources
          </a>
        </div>
      </div>
    </div>`;

  const emergencyBanner = `
    <div class="dh-emergency">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="flex:1">
        <div class="dh-emg-title">24/7 Dementia Helpline — 6377 0700</div>
        <div class="dh-emg-sub">Mon–Fri 9am–6pm · Sat 9am–1pm · Life-threatening emergency: 995</div>
      </div>
      <a href="tel:6377-0700"><button class="dh-emg-btn">Call now</button></a>
    </div>`;

  const aiCard = `
    <div class="dh-ai-card">
      <div class="dh-ai-badge">
        <div class="dh-pulse"></div>
        AI Assistant Online
      </div>
      <div class="dh-ai-title">Need to talk?</div>
      <div class="dh-ai-sub">Our AI care assistant understands dementia caregiving. Ask questions, share concerns, or get guidance — anytime, in any language.</div>
      <button onclick="document.getElementById('dh-el-widget').scrollIntoView({behavior:'smooth'})" class="dh-ai-btn primary">Open AI Assistant</button>
      <button onclick="openCallbackModal()" class="dh-ai-btn">Request a callback from our team</button>
    </div>`;

  const quickActions = `
    <div class="dh-card" style="margin-bottom:0">
      <div class="dh-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Quick actions
      </div>
      <div class="dh-qgrid">
        <button onclick="openNoteModal()" class="dh-qbtn">
          <div class="dh-qbtn-icon" style="background:#eff6ff"><svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></div>
          <div class="dh-qbtn-title">Add a note</div>
          <div class="dh-qbtn-sub">To your care record</div>
        </button>
        <button onclick="openCallbackModal()" class="dh-qbtn">
          <div class="dh-qbtn-icon" style="background:#f0fdf4"><svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <div class="dh-qbtn-title">Book a callback</div>
          <div class="dh-qbtn-sub">Schedule with our team</div>
        </button>
        <a href="#resources" class="dh-qbtn" style="text-decoration:none">
          <div class="dh-qbtn-icon" style="background:#faf5ff"><svg viewBox="0 0 24 24" fill="none" stroke="#9333ea" stroke-width="2" width="15" height="15"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
          <div class="dh-qbtn-title">Browse resources</div>
          <div class="dh-qbtn-sub">Guides & support articles</div>
        </a>
        <a href="#helplines" class="dh-qbtn" style="text-decoration:none">
          <div class="dh-qbtn-icon" style="background:#fef2f2"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="15" height="15"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
          <div class="dh-qbtn-title">Helplines</div>
          <div class="dh-qbtn-sub">Emergency contacts</div>
        </a>
      </div>
    </div>`;

  // Featured KB cards on home
  const featuredKB = [
    { bg:'#e0f2fe', color:'#0369a1', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo3.jpg', tag:'Getting started', title:'What is Dementia?', desc:'Understand the stages, symptoms and what to expect.', key:'what-is', link:'https://www.dementia.org.sg/understanding-dementia' },
    { bg:'#f0fdf4', color:'#15803d', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo4.jpg', tag:'Caregiver wellbeing', title:'Preventing Burnout', desc:'Recognise the signs early and protect your own health.', key:'burnout', link:'https://www.dementia.org.sg/caregiver-support' },
    { bg:'#fef9c3', color:'#a16207', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo5.jpeg', tag:'Safety', title:'Home Safety Guide', desc:'Simple changes to make the home safer and easier to navigate.', key:'safety', link:'https://www.dementia.org.sg/resources' },
  ];
  const featuredKBHtml = featuredKB.map(r=>{
    const v = S.kbViewed.includes(r.key);
    return `<div class="dh-kb-card${v?' read':''}" onclick="markKBViewed('${r.key}');window.open('${r.link}','_blank')">
      <img class="dh-kb-img" src="${r.img}" alt="${esc(r.title)}" onerror="this.parentNode.querySelector('.dh-kb-img-placeholder').style.display='flex';this.style.display='none'">
      <div class="dh-kb-img-placeholder" style="display:none;background:${r.bg}">📚</div>
      <div class="dh-kb-body">
        <div class="dh-kb-tag-row">
          <span class="dh-kb-tag" style="background:${r.bg};color:${r.color}">${r.tag}</span>
          ${v?'<span class="dh-kb-read-badge">✓ Read</span>':''}
        </div>
        <div class="dh-kb-title">${r.title}</div>
        <div class="dh-kb-link">Read article →</div>
      </div>
    </div>`;
  }).join('');

  // Recent conversations
  const loading = S.convos===null;
  let convoHtml = '';
  if (loading) {
    convoHtml = `<div style="text-align:center;padding:24px"><div class="dh-spinner" style="margin:0 auto 8px"></div><div style="color:#94a3b8;font-size:12px">Loading your conversations…</div></div>`;
  } else if (!S.convos?.length) {
    convoHtml = `<div style="text-align:center;padding:24px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin:0 auto 10px;display:block"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div style="color:#94a3b8;font-size:13px;font-weight:500">No conversations yet</div>
      <div style="color:#cbd5e1;font-size:11px;margin-top:4px">Your chat history will appear here</div>
    </div>`;
  } else {
    convoHtml = S.convos.slice(0,4).map(c=>`
      <div class="dh-history-item">
        <div class="dh-history-avatar" style="background:#e0f2fe">💬</div>
        <div style="flex:1;min-width:0">
          <div class="dh-history-name">${esc(c.contactName||c.fullName||'Support chat')}</div>
          <div class="dh-history-preview">${esc(c.lastMessageBody||c.snippet||'No preview available')}</div>
          ${c.unreadCount?`<span class="dh-unread">${c.unreadCount} new</span>`:''}
        </div>
        <div class="dh-history-time">${timeAgo(c.lastMessageDate||c.dateUpdated)}</div>
      </div>`).join('');
  }

  return `
    ${heroBanner}
    ${emergencyBanner}
    <div style="display:grid;grid-template-columns:1fr 290px;gap:16px;margin-bottom:20px">
      <div>
        <div class="dh-card">
          <div class="dh-card-title" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:8px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Recent conversations
            </span>
            <a href="#history" style="font-size:11px;color:#006D77;font-weight:700">View all →</a>
          </div>
          ${convoHtml}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${aiCard}
        ${quickActions}
      </div>
    </div>
    <div class="dh-card">
      <div class="dh-card-title" style="justify-content:space-between">
        <span style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          Featured resources
        </span>
        <a href="#resources" style="font-size:11px;color:#006D77;font-weight:700">All resources →</a>
      </div>
      <div class="dh-kb-grid">${featuredKBHtml}</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// HISTORY VIEW
// ══════════════════════════════════════════════════════════════
function renderHistory(user) {
  const loading = S.convos===null;
  let content = '';
  if (loading) {
    content = `<div style="text-align:center;padding:60px"><div class="dh-spinner" style="margin:0 auto 10px"></div><div style="color:#94a3b8;font-size:13px">Loading your history…</div></div>`;
  } else if (!S.convos?.length) {
    content = `<div style="text-align:center;padding:60px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin:0 auto 14px;display:block"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div style="color:#1e293b;font-size:16px;font-weight:700;margin-bottom:6px">No conversation history yet</div>
      <div style="color:#94a3b8;font-size:13px;max-width:320px;margin:0 auto;line-height:1.6">Once you start chatting with our AI assistant or support team, your conversations will appear here.</div>
    </div>`;
  } else {
    content = S.convos.map(c=>`
      <div class="dh-history-item" style="cursor:pointer" onclick="">
        <div class="dh-history-avatar" style="background:#e0f2fe;font-size:16px">💬</div>
        <div style="flex:1;min-width:0">
          <div class="dh-history-name">${esc(c.contactName||c.fullName||'Support chat')}</div>
          <div class="dh-history-preview">${esc(c.lastMessageBody||c.snippet||'No preview available')}</div>
          ${c.unreadCount?`<span class="dh-unread">${c.unreadCount} new</span>`:''}
        </div>
        <div style="text-align:right">
          <div class="dh-history-time" style="display:block">${timeAgo(c.lastMessageDate||c.dateUpdated)}</div>
          <span style="font-size:9px;background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;margin-top:4px;display:inline-block">${esc(c.type||'Chat')}</span>
        </div>
      </div>`).join('');
  }

  return `
    <div style="margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:800;color:#0f172a">My History</h2>
      <p style="color:#64748b;font-size:13px;margin-top:4px">Your conversations and support interactions with the DementiaSG team.</p>
    </div>
    <div class="dh-card">${content}</div>`;
}

// ══════════════════════════════════════════════════════════════
// RESOURCES VIEW
// ══════════════════════════════════════════════════════════════
function renderResources() {
  const categories = ['All','Caregivers','Wellbeing','Safety','Medical','Community'];
  const items = [
    { cat:'Caregivers', tag:'bg:#e0f2fe;color:#0369a1', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo3.jpg',  title:'Understanding Dementia Stages',       desc:'Learn about the progression of dementia and what to expect at each stage.', key:'stages',   link:'https://www.dementia.org.sg/understanding-dementia' },
    { cat:'Wellbeing',  tag:'bg:#faf5ff;color:#7e22ce', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo4.jpg',  title:'Caregiver Burnout — Warning Signs',   desc:'Recognise the signs of burnout early and find ways to protect your wellbeing.', key:'burnout',  link:'https://www.dementia.org.sg/caregiver-support' },
    { cat:'Safety',     tag:'bg:#fef9c3;color:#a16207', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo5.jpeg', title:'Home Safety Checklist',                desc:'Practical tips for making your home safer and easier for someone with dementia.', key:'home',     link:'https://www.dementia.org.sg/resources' },
    { cat:'Medical',    tag:'bg:#fef2f2;color:#b91c1c', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/image_0.png', title:'Medication Management Guide',          desc:'Safely manage daily medications and understand common treatments.', key:'meds',     link:'https://www.dementia.org.sg/resources' },
    { cat:'Community',  tag:'bg:#f0fdf4;color:#15803d', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo3.jpg',  title:'CARA Registration Process',            desc:'How to register with CARA for personalised dementia support in Singapore.', key:'cara',     link:'https://cara.sg' },
    { cat:'Caregivers', tag:'bg:#fff7ed;color:#c2410c', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo4.jpg',  title:'Communication Tips',                   desc:'How to communicate effectively with a person living with dementia.', key:'comms',    link:'https://www.dementia.org.sg/resources' },
    { cat:'Safety',     tag:'bg:#fef9c3;color:#a16207', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo5.jpeg', title:'Wandering Prevention Guide',           desc:'Strategies to keep your loved one safe and reduce wandering risks.', key:'wander',   link:'https://www.dementia.org.sg/resources' },
    { cat:'Wellbeing',  tag:'bg:#faf5ff;color:#7e22ce', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/image_0.png', title:'Caregiver Self-Care Handbook',         desc:'Simple practices to maintain your own mental and physical health.', key:'selfcare',  link:'https://www.dementia.org.sg/caregiver-support' },
    { cat:'Community',  tag:'bg:#f0fdf4;color:#15803d', img:'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/photo3.jpg',  title:'Support Groups Near You',              desc:'Connect with other caregivers in your area for shared experiences and advice.', key:'groups',   link:'https://www.dementia.org.sg/community' },
  ];
  const active = S.kbFilter||'all';
  const filtered = active==='all'||active==='All' ? items : items.filter(i=>i.cat.toLowerCase()===active.toLowerCase());

  const cards = filtered.map(r=>{
    const v = S.kbViewed.includes(r.key);
    const [bg,clr] = r.tag.split(';').map(x=>x.split(':')[1]);
    return `<div class="dh-kb-card${v?' read':''}" onclick="markKBViewed('${r.key}');window.open('${r.link}','_blank')">
      <img class="dh-kb-img" src="${r.img}" alt="${esc(r.title)}" onerror="this.parentNode.querySelector('.dh-kb-img-placeholder').style.display='flex';this.style.display='none'">
      <div class="dh-kb-img-placeholder" style="display:none;background:${bg}">📚</div>
      <div class="dh-kb-body">
        <div class="dh-kb-tag-row">
          <span class="dh-kb-tag" style="background:${bg};color:${clr}">${r.cat}</span>
          ${v?'<span class="dh-kb-read-badge">✓ Read</span>':''}
        </div>
        <div class="dh-kb-title">${r.title}</div>
        <div class="dh-kb-desc">${r.desc}</div>
        <div class="dh-kb-link">Read on DementiaSG →</div>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:20px;font-weight:800;color:#0f172a">Resources</h2>
        <p style="color:#64748b;font-size:13px;margin-top:4px">Guides, articles and tools for your caregiving journey.</p>
      </div>
      <span style="font-size:12px;font-weight:700;color:#006D77">${S.kbViewed.length} article${S.kbViewed.length!==1?'s':''} read</span>
    </div>
    <div class="dh-kb-filters">
      ${categories.map(c=>`<button class="dh-kb-chip${(active==='all'&&c==='All')||active===c?' active':''}" onclick="setKBFilter('${c}')">${c}</button>`).join('')}
    </div>
    <div class="dh-kb-grid">${cards||'<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;font-size:13px">No resources in this category.</div>'}</div>`;
}

// ══════════════════════════════════════════════════════════════
// HELPLINES VIEW
// ══════════════════════════════════════════════════════════════
function renderHelplines() {
  const lines = [
    { name:'Dementia Helpline',        num:'6377 0700',    hours:'Mon–Fri 9am–6pm · Sat 9am–1pm', bg:'#e0f2fe', ic:'#0369a1', link:'tel:6377-0700',     icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>` },
    { name:'Police (Missing Person)',  num:'999',           hours:'24 hours, 7 days',              bg:'#faf5ff', ic:'#7e22ce', link:'tel:999',            icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
    { name:'Ambulance / Fire',         num:'995',           hours:'24 hours, 7 days',              bg:'#fef2f2', ic:'#b91c1c', link:'tel:995',            icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` },
    { name:'IMH Crisis Line',          num:'6389 2222',     hours:'24 hours, 7 days',              bg:'#f0fdf4', ic:'#15803d', link:'tel:6389-2222',      icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>` },
    { name:'Samaritans of Singapore',  num:'1800 221 4444', hours:'24 hours, 7 days',              bg:'#fff7ed', ic:'#c2410c', link:'tel:18002214444',    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>` },
    { name:'CARA App (Safe Return)',   num:'cara.sg',       hours:'Register online',               bg:'#e0f2fe', ic:'#0369a1', link:'https://cara.sg',    icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>` },
  ];

  return `
    <div style="margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:800;color:#0f172a">Helplines & Emergency</h2>
      <p style="color:#64748b;font-size:13px;margin-top:4px">Important contacts for dementia support and emergencies in Singapore.</p>
    </div>
    <div class="dh-emergency" style="margin-bottom:20px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20" style="flex-shrink:0;color:#dc2626"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="flex:1">
        <div class="dh-emg-title">If this is a life-threatening emergency, call 995 immediately.</div>
        <div class="dh-emg-sub">Do not wait — get emergency help first, then contact the dementia helpline.</div>
      </div>
      <a href="tel:995"><button class="dh-emg-btn">Call 995</button></a>
    </div>
    <div class="dh-helpline-grid">
      ${lines.map(l=>`
        <a href="${l.link}" target="${l.link.startsWith('http')?'_blank':'_self'}" class="dh-helpline-card dh-card" style="border-color:${l.bg}">
          <div class="dh-helpline-icon" style="background:${l.bg}">${l.icon.replace('stroke="currentColor"',`stroke="${l.ic}"`)}</div>
          <div>
            <div class="dh-helpline-name">${l.name}</div>
            <div class="dh-helpline-num">${l.num}</div>
            <div class="dh-helpline-hours">${l.hours}</div>
          </div>
        </a>`).join('')}
    </div>
    <div class="dh-card" style="margin-top:16px;background:linear-gradient(135deg,#003D44,#006D77);border:none">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
        <div>
          <div style="color:#fff;font-size:15px;font-weight:700;margin-bottom:4px">Not sure who to call?</div>
          <div style="color:rgba(255,255,255,.65);font-size:12px">Talk to our AI assistant — it will guide you to the right support.</div>
        </div>
        <button onclick="document.getElementById('dh-el-widget').scrollIntoView({behavior:'smooth'})" class="dh-hero-btn">Open AI Assistant</button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════
function setKBFilter(f) { S.kbFilter=f; render(); }

function markKBViewed(key) {
  if (!S.kbViewed.includes(key)) {
    S.kbViewed.push(key);
    localStorage.setItem('dh_kb_viewed', JSON.stringify(S.kbViewed));
  }
}

// ── Note Modal ──
function openNoteModal() {
  document.getElementById('modal-root').innerHTML=`
    <div class="dh-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dh-modal">
        <div class="dh-modal-title">Add a note</div>
        <div class="dh-modal-sub">This will be saved to your care record</div>
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Your note</label>
          <textarea id="noteText" class="dh-input" style="resize:none;height:110px" placeholder="Describe what happened, how you are feeling, or any updates…"></textarea>
        </div>
        <div id="noteResult"></div>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button id="noteBtn" onclick="submitNote()" class="dh-btn-primary">Save note</button>
          <button onclick="closeModal()" class="dh-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function submitNote() {
  const text = document.getElementById('noteText').value.trim();
  const btn  = document.getElementById('noteBtn');
  const res  = document.getElementById('noteResult');
  if (!text) { res.innerHTML='<div class="dh-alert-error">Please enter a note.</div>'; return; }
  btn.innerHTML='<span class="dh-spinner"></span> Saving…'; btn.disabled=true;
  try {
    const user = getCurrentUser();
    // Try to find GHL contact by email
    let cid = '';
    try {
      const r = await fetch(`/api/contacts?email=${encodeURIComponent(user.email||'')}`);
      const d = await r.json();
      cid = d.contacts?.[0]?.id || '';
    } catch(e) {}
    if (cid) await DHAPI.addNote(cid, text);
    res.innerHTML='<div class="dh-alert-success">Note saved successfully.</div>';
    document.getElementById('noteText').value='';
    setTimeout(closeModal, 1600);
  } catch(e) {
    res.innerHTML=`<div class="dh-alert-error">Could not save note. Please try again.</div>`;
  } finally { btn.innerHTML='Save note'; btn.disabled=false; }
}

// ── Callback Modal ──
function openCallbackModal() {
  const today = new Date().toISOString().split('T')[0];
  const calOpts = S.calendars?.length
    ? S.calendars.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
    : '<option value="">No calendars available</option>';
  document.getElementById('modal-root').innerHTML=`
    <div class="dh-overlay" onclick="if(event.target===this)closeModal()">
      <div class="dh-modal">
        <div class="dh-modal-title">Request a callback</div>
        <div class="dh-modal-sub">Our team will call you at your chosen time</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Calendar</label>
            <select id="cbCal" class="dh-select">${calOpts}</select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Date</label>
              <input id="cbDate" class="dh-input" type="date" min="${today}" value="${today}">
            </div>
            <div>
              <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Time</label>
              <input id="cbTime" class="dh-input" type="time" value="10:00">
            </div>
          </div>
        </div>
        <div id="cbResult" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;margin-top:16px">
          <button id="cbBtn" onclick="submitCb()" class="dh-btn-primary">Book callback</button>
          <button onclick="closeModal()" class="dh-btn-ghost">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function submitCb() {
  const cal  = document.getElementById('cbCal').value;
  const date = document.getElementById('cbDate').value;
  const time = document.getElementById('cbTime').value;
  const btn  = document.getElementById('cbBtn');
  const res  = document.getElementById('cbResult');
  if (!date||!time) { res.innerHTML='<div class="dh-alert-error">Please select a date and time.</div>'; return; }
  const start = new Date(date+'T'+time+':00').toISOString();
  const end   = new Date(new Date(start).getTime()+30*60000).toISOString();
  btn.innerHTML='<span class="dh-spinner"></span> Booking…'; btn.disabled=true;
  try {
    const user = getCurrentUser();
    let cid = '';
    try {
      const r = await fetch(`/api/contacts?email=${encodeURIComponent(user.email||'')}`);
      const d = await r.json();
      cid = d.contacts?.[0]?.id || '';
    } catch(e) {}
    await DHAPI.scheduleAppointment(cal, cid, start, end);
    res.innerHTML='<div class="dh-alert-success">Callback booked. Our team will contact you shortly.</div>';
    setTimeout(closeModal, 2000);
  } catch(e) {
    res.innerHTML='<div class="dh-alert-error">Could not book callback. Please call us directly on 6377 0700.</div>';
  } finally { btn.innerHTML='Book callback'; btn.disabled=false; }
}

function closeModal() { document.getElementById('modal-root').innerHTML=''; }

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
render();
if (getCurrentUser()) loadGHLData();
