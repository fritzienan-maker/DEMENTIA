// ════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════
const CFG = {
  locationId:        'Idf9v4q6aqh5KhzXip6e',
  accessKey:         'admin123',
  elevenLabsAgentId: 'agent_7801kkd50dzsez4tfv4qme5mn6br',
  logo:              'https://dementiahub.wibiz.ai/wp-content/uploads/2026/03/dementia-singapore-logo.png',
};

const STAFF_LIST = ['Dr. Sarah Chen','Nurse Michael Tan','Counselor Amy Lim','Case Worker James Ng','Social Worker Lee Min','Unassigned'];

// ════════════════════════════════════════════════════════════
// PIPELINE STAGES — matches GHL exactly
// ════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { id:'new_untriaged',       name:'New - Untriaged',                color:'#6366f1', bg:'#eef2ff' },
  { id:'self_serve_resolved', name:'Self-Serve Resolved',            color:'#22c55e', bg:'#f0fdf4' },
  { id:'needs_staff',         name:'Needs Staff - Awaiting Contact', color:'#f97316', bg:'#fff7ed' },
  { id:'escalation_no_staff', name:'Escalation – No Staff Available',color:'#ef4444', bg:'#fef2f2' },
  { id:'in_progress',         name:'In Progress',                    color:'#3b82f6', bg:'#eff6ff' },
  { id:'callback_scheduled',  name:'Callback Scheduled',             color:'#8b5cf6', bg:'#f5f3ff' },
  { id:'scheduled_followup',  name:'Scheduled / Follow Up',          color:'#0ea5e9', bg:'#f0f9ff' },
  { id:'referred_redirected', name:'Referred / Redirected',          color:'#d97706', bg:'#fffbeb' },
  { id:'closed_resolved',     name:'Closed - Resolved',              color:'#15803d', bg:'#f0fdf4' },
  { id:'closed_unreachable',  name:'Closed - Unreachable',           color:'#64748b', bg:'#f8fafc' },
  { id:'urgent_action',       name:'Urgent - Immediate Action',      color:'#dc2626', bg:'#fef2f2' },
];

function stageNameToId(n) {
  n = (n||'').toLowerCase();
  if (n.includes('untriaged'))                              return 'new_untriaged';
  if (n.includes('self-serve')||n.includes('self serve'))  return 'self_serve_resolved';
  if (n.includes('needs staff'))                            return 'needs_staff';
  if (n.includes('escalation'))                             return 'escalation_no_staff';
  if (n.includes('in progress'))                            return 'in_progress';
  if (n.includes('callback'))                               return 'callback_scheduled';
  if (n.includes('follow'))                                 return 'scheduled_followup';
  if (n.includes('referred')||n.includes('redirected'))    return 'referred_redirected';
  if (n.includes('closed')&&n.includes('resolved'))        return 'closed_resolved';
  if (n.includes('unreachable'))                            return 'closed_unreachable';
  if (n.includes('urgent'))                                 return 'urgent_action';
  return 'new_untriaged';
}

function getStageObj(stageName) {
  return PIPELINE_STAGES.find(s=>s.id===stageNameToId(stageName)) || PIPELINE_STAGES[0];
}

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let ghlOpps       = null;
let activeFilter  = 'all';
let searchQuery   = '';
let sortCol       = 'updated';
let sortDir       = 'desc';
let assignments   = JSON.parse(localStorage.getItem('dsg_assignments') || '{}');
let callbacks     = JSON.parse(localStorage.getItem('dsg_callbacks')   || '[]');
let caseStatuses  = JSON.parse(localStorage.getItem('dsg_case_statuses')|| '{}');
let caseNotes     = JSON.parse(localStorage.getItem('dsg_case_notes')  || '{}');
let cbStatuses    = JSON.parse(localStorage.getItem('dsg_cb_statuses') || '{}');
window._caseView  = window._caseView || 'table';

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
function isAuth() { return sessionStorage.getItem('dsg_auth')==='1'; }
function doLogin(key, staffName, staffRole) {
  if (key !== CFG.accessKey) return false;
  DHUserContext.saveStaffSession(staffName, staffRole);
  DHUserContext.configureGHLWidget(DHUserContext.getStaffContext());
  return true;
}
function doLogout() {
  DHUserContext.clearStaffSession();
  ghlOpps = null;
  render();
}
function getCurrentStaff() { return DHUserContext.getStaffContext(); }

// ════════════════════════════════════════════════════════════
// ROUTING
// ════════════════════════════════════════════════════════════
function getView() { return location.hash.replace('#','')||'overview'; }
window.addEventListener('hashchange', render);

// ════════════════════════════════════════════════════════════
// GHL API
// ════════════════════════════════════════════════════════════
async function fetchGHL() {
  try { ghlOpps = await DHAPI.getOpportunities(25); }
  catch(e) { ghlOpps=[]; console.warn('[fetchGHL]',e.message); }
  render();
}
async function syncNoteToGHL(contactId, text) { return DHAPI.addNote(contactId, text); }

// ════════════════════════════════════════════════════════════
// PIPELINE STAGE MOVE
// ════════════════════════════════════════════════════════════
async function handleStageMove(oppId, targetStageName, selectEl) {
  const original = selectEl.dataset.original || selectEl.value;
  selectEl.dataset.original = targetStageName;
  selectEl.disabled = true;
  selectEl.style.opacity = '0.6';
  try {
    await DHAPI.updateOpportunity(oppId, { pipelineStageName: targetStageName });
    const op = (ghlOpps||[]).find(o=>o.id===oppId);
    if (op) op.pipelineStageName = targetStageName;
    saveHandover(`Stage moved: ${oppId} → "${targetStageName}"`);
    const stage = PIPELINE_STAGES.find(s=>s.name===targetStageName);
    if (stage) {
      selectEl.style.borderColor = stage.color+'50';
      selectEl.style.background  = stage.bg;
      selectEl.style.color       = stage.color;
    }
  } catch(e) {
    console.error('[handleStageMove]',e.message);
    selectEl.value = original;
  } finally {
    selectEl.disabled = false;
    selectEl.style.opacity = '1';
  }
}

function setCaseView(v) { window._caseView=v; render(); }

// ════════════════════════════════════════════════════════════
// DATA ENRICHMENT
// ════════════════════════════════════════════════════════════
const CRIT_KW = ['urgent','critical','emergency','fall','missing','wander','danger','immediate','acute','assault','suicid','harm'];
const WARN_KW = ['anxious','distress','confused','upset','worried','agitated','unsafe','concern'];

function enrich(op, idx) {
  const txt = ((op.name||'')+' '+(op.pipelineStageName||'')).toLowerCase();
  const hrs  = (Date.now()-new Date(op.updatedAt||op.createdAt).getTime())/3600000;
  let urgency = 'low';
  if (CRIT_KW.some(k=>txt.includes(k))||hrs>72) urgency='critical';
  else if (WARN_KW.some(k=>txt.includes(k))||hrs>24) urgency='medium';

  let category = 'General';
  const CAT_MAP = {
    'Safety':   ['fall','missing','wander','danger','harm','suicid','assault'],
    'Medical':  ['medical','health','doctor','hospital','medication','pain','ill'],
    'Emotional':['anxiety','distress','depress','grief','upset','agitated'],
    'Admin':    ['grant','subsidy','cara','registration','form'],
    'Resource': ['resource','centre','facility','service','referral'],
  };
  for (const [cat,kws] of Object.entries(CAT_MAP)) {
    if (kws.some(k=>txt.includes(k))) { category=cat; break; }
  }

  let sla = 'ok';
  if (hrs>4) sla='breach'; else if (hrs>2) sla='warn';

  const caseId    = 'C-'+String(op.id||idx).replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase();
  const assignedTo= assignments[op.id]||'Unassigned';

  const localStatus = caseStatuses[op.id];
  let displayStatus = 'new';
  if (localStatus) {
    const ls = localStatus.toLowerCase().replace(/\s+/g,'');
    if (ls==='resolved')                       displayStatus='resolved';
    else if (ls==='inprogress'||ls==='triaged') displayStatus='triaged';
  } else {
    const stage = (op.pipelineStageName||'').toLowerCase();
    const ghlSt = (op.status||'').toLowerCase();
    if (ghlSt==='won'||ghlSt==='lost')                         displayStatus='resolved';
    else if (/triage|progress|active|contact|open/i.test(stage)) displayStatus='triaged';
  }

  const cbEntry = cbStatuses[op.id];
  const dueSoon = displayStatus!=='resolved'&&(urgency==='critical'||urgency==='high'||(cbEntry&&!cbEntry.done));
  const displayName = op.contact?.name||op.contact?.phone||caseId;

  return {...op, urgency, category, sla, caseId, hrs, assignedTo, displayStatus, dueSoon, displayName};
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) { return iso?new Date(iso).toLocaleString('en-SG',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—'; }
function timeAgo(iso) { if(!iso)return'—'; const h=(Date.now()-new Date(iso).getTime())/3600000; if(h<1)return Math.round(h*60)+'m ago'; if(h<24)return Math.round(h)+'h ago'; return Math.round(h/24)+'d ago'; }
function today() { return new Date().toLocaleDateString('en-SG',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); }
function getHandovers() { return JSON.parse(localStorage.getItem('dsg_handovers')||'[]'); }
function saveHandover(text) {
  const staff = getCurrentStaff();
  const notes = getHandovers();
  notes.unshift({ staff_name:staff?.name||'Staff', staff_role:staff?.staffRole||'', note_content:text, created_at:new Date().toISOString() });
  localStorage.setItem('dsg_handovers', JSON.stringify(notes.slice(0,30)));
}

// ════════════════════════════════════════════════════════════
// RENDER ENTRY
// ════════════════════════════════════════════════════════════
function render() {
  const app = document.getElementById('app');
  if (!isAuth()) {
    app.innerHTML = renderLogin();
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    return;
  }
  app.innerHTML = renderShell(getView());
}

function handleLogin(e) {
  e.preventDefault();
  const key       = document.getElementById('accessKey').value;
  const staffName = document.getElementById('staffName').value;
  const staffRole = document.getElementById('staffRole').value;
  if (!staffName) { showLoginError('Please select your name.'); return; }
  if (doLogin(key, staffName, staffRole)) { fetchGHL(); startAutoRefresh(30000); render(); }
  else showLoginError('Incorrect access key.');
}
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent=msg; el.classList.remove('hidden'); }
}

// ════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════
function renderLogin() {
  const nameOptions = STAFF_LIST.filter(n=>n!=='Unassigned').map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const roleOptions = ['Case Manager','Helpline Staff','Social Worker','Counselor','Nurse','Administrator'].map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
  return `
  <div style="min-height:100vh;background:linear-gradient(135deg,#003D44 0%,#006D77 55%,#1D9E75 100%);display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="background:#fff;border-radius:24px;padding:40px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,.2)">
      <div style="display:flex;justify-content:center;margin-bottom:24px">
        <img src="${CFG.logo}" style="height:40px;object-fit:contain" alt="Dementia Singapore" onerror="this.style.display='none'">
      </div>
      <div style="text-align:center;margin-bottom:28px">
        <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px">AI Command Center</h1>
        <p style="color:#64748b;font-size:13px">Staff access — identify yourself to continue</p>
      </div>
      <div id="loginError" class="hidden" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px">Error</div>
      <form id="loginForm" style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Your name</label>
          <select id="staffName" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#374151;font-family:inherit" required>
            <option value="">— Select your name —</option>${nameOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Your role</label>
          <select id="staffRole" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#374151;font-family:inherit">
            ${roleOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Access key</label>
          <input id="accessKey" type="password" placeholder="Enter access key" style="width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#1e293b;font-family:monospace;letter-spacing:.1em" required>
        </div>
        <button type="submit" style="margin-top:6px;background:#003D44;color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s" onmouseover="this.style.background='#006D77'" onmouseout="this.style.background='#003D44'">Unlock Dashboard →</button>
      </form>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
// SHELL
// ════════════════════════════════════════════════════════════
function renderShell(activeV) {
  const nav = [
    {section:'Monitor'},
    {view:'overview', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', label:'Overview'},
    {view:'cases',    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', label:'Case Management'},
    {section:'Operations'},
    {view:'handover', icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', label:'Staff Handover'},
  ];

  const navHtml = nav.map(n => {
    if (n.section) return `<div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:.1em;padding:0 10px;margin:16px 0 6px">${n.section}</div>`;
    return `<a href="#${n.view}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:${activeV===n.view?'#fff':'rgba(255,255,255,.5)'};font-size:13px;font-weight:500;text-decoration:none;margin-bottom:2px;background:${activeV===n.view?'#006D77':'transparent'};transition:all .15s" onmouseover="if('${activeV}'!=='${n.view}')this.style.background='rgba(255,255,255,.06)'" onmouseout="if('${activeV}'!=='${n.view}')this.style.background='transparent'">
      <span style="width:16px;height:16px;flex-shrink:0;opacity:${activeV===n.view?'1':'.6'}">${n.icon}</span>${n.label}
    </a>`;
  }).join('');

  const enriched = (ghlOpps||[]).map(enrich);
  const critCount = enriched.filter(o=>o.urgency==='critical').length;
  const staff = getCurrentStaff();
  const init  = staff ? staff.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : 'S';

  let content = '';
  if      (activeV==='overview') content=renderOverview(enriched);
  else if (activeV==='cases')    content=renderCases(enriched);
  else if (activeV==='handover') content=renderHandover();

  return `
  <div style="display:none;background:#003D44;padding:12px 18px;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:99" id="mobBar">
    <img src="${CFG.logo}" style="height:26px;filter:brightness(0) invert(1);object-fit:contain" alt="Logo" onerror="this.style.display='none'">
    <div style="display:flex;gap:14px">
      <a href="#overview" style="color:rgba(255,255,255,.6);font-size:11px;font-weight:600;text-decoration:none">Overview</a>
      <a href="#cases"    style="color:rgba(255,255,255,.6);font-size:11px;font-weight:600;text-decoration:none">Cases</a>
      <span onclick="doLogout()" style="color:#f87171;font-size:11px;font-weight:600;cursor:pointer">Out</span>
    </div>
  </div>

  <div style="display:flex;min-height:100vh">
    <div style="width:256px;min-width:256px;background:#003D44;display:flex;flex-direction:column;padding:20px 14px;position:fixed;top:0;left:0;height:100vh;z-index:100;overflow-y:auto">
      <div style="margin-bottom:24px;padding:4px 6px">
        <img src="${CFG.logo}" style="height:32px;object-fit:contain;filter:brightness(0) invert(1)" alt="Dementia Singapore" onerror="this.style.display='none'">
      </div>
      <div style="background:rgba(255,255,255,.07);border-radius:14px;padding:12px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
        <div style="width:38px;height:38px;border-radius:50%;background:#006D77;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${init}</div>
        <div style="min-width:0">
          <div style="color:#fff;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(staff?.name||'Staff')}</div>
          <div style="color:rgba(255,255,255,.35);font-size:10px;margin-top:1px">${esc(staff?.staffRole||'Helpline Staff')}</div>
        </div>
        ${critCount?`<span style="background:#dc2626;color:#fff;font-size:9px;font-weight:800;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto">${critCount}</span>`:''}
      </div>
      <nav style="flex:1">${navHtml}</nav>
      <div style="border-top:1px solid rgba(255,255,255,.07);padding-top:12px">
        <div onclick="fetchGHL()" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;color:rgba(255,255,255,.4);font-size:12px;cursor:pointer;transition:all .15s" onmouseover="this.style.color='rgba(255,255,255,.7)'" onmouseout="this.style.color='rgba(255,255,255,.4)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Refresh data
        </div>
        <div onclick="doLogout()" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;color:rgba(248,113,113,.7);font-size:12px;cursor:pointer;transition:all .15s" onmouseover="this.style.color='#f87171'" onmouseout="this.style.color='rgba(248,113,113,.7)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out
        </div>
        <div style="padding:8px 12px;font-size:9px;color:rgba(255,255,255,.15);font-weight:700;text-transform:uppercase;letter-spacing:.06em">AI Command Center v4.0</div>
      </div>
    </div>

    <div style="margin-left:256px;min-height:100vh;background:#F0F4F6;width:calc(100% - 256px)">
      <div style="background:#fff;border-bottom:1px solid #e8edf2;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50">
        <div>
          <div style="font-size:17px;font-weight:800;color:#0f172a">${activeV==='overview'?'AI Command Center':activeV==='cases'?'Case Management':'Staff Handover'}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px">${today()}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;padding:5px 14px;font-size:11px;color:#15803d;font-weight:600">
            <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:dhpulse 2s infinite"></div>
            GHL Live
          </div>
          <button onclick="fetchGHL()" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;color:#475569">↺ Refresh</button>
        </div>
      </div>
      <div style="padding:26px 28px">${content}</div>
    </div>
  </div>

  <!-- Global Note Modal -->
  <div id="noteModal" class="hidden" style="position:fixed;inset:0;background:rgba(0,61,68,.6);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border-radius:20px;padding:28px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,.2)">
      <div style="font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px">Add case note</div>
      <div id="modalName" style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:18px">Contact</div>
      <textarea id="noteText" style="width:100%;height:110px;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;resize:none;background:#f8fafc;font-family:inherit;color:#1e293b" placeholder="Describe the care update or situation…"></textarea>
      <div id="noteErr" class="hidden" style="color:#dc2626;font-size:12px;font-weight:600;margin-top:6px"></div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button id="noteBtn" onclick="submitNote()" style="flex:1;background:#003D44;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Sync to GHL</button>
        <button onclick="closeNoteModal()" style="padding:11px 20px;background:#f1f5f9;color:#475569;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
      </div>
    </div>
  </div>

  <div id="modal-root"></div>

  <style>
    @keyframes dhpulse{0%,100%{opacity:1}50%{opacity:.35}}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spinner{width:18px;height:18px;border:2px solid #e2e8f0;border-top-color:#006D77;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}
    .flt-btn{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;transition:all .15s}
    .flt-btn:hover{border-color:#006D77;color:#006D77}
    .flt-btn.active{background:#003D44;color:#fff;border-color:#003D44}
    .flt-btn.danger{border-color:#fca5a5;color:#dc2626;background:#fef2f2}
    .flt-btn.danger.active{background:#dc2626;color:#fff}
    .dh-select{padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:12px;outline:none;background:#f8fafc;color:#374151;cursor:pointer;font-family:inherit}
    .hidden{display:none!important}
    @media(max-width:900px){
      #mobBar{display:flex!important}
      .dh-sidebar{display:none}
    }
  </style>`;
}

// ════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════
function renderOverview(enriched) {
  const loading  = ghlOpps===null;
  const total    = enriched.length;
  const critical = enriched.filter(o=>o.urgency==='critical').length;
  const active   = enriched.filter(o=>o.displayStatus!=='resolved').length;
  const resolved = enriched.filter(o=>o.status==='won'||o.status==='lost').length;
  const dueSoon  = enriched.filter(o=>o.dueSoon&&o.displayStatus!=='resolved').length;
  const pending  = Object.values(cbStatuses).filter(c=>!c.done).length+callbacks.length;

  // Safety banner
  const safetyOps = enriched.filter(o=>o.urgency==='critical');
  const safetyBanner = safetyOps.length ? `
    <div style="background:linear-gradient(135deg,#fef2f2,#fff5f5);border:1.5px solid #fca5a5;border-radius:16px;padding:16px 20px;display:flex;align-items:flex-start;gap:14px;margin-bottom:20px">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:#b91c1c;margin-bottom:4px">Safety Alert — ${safetyOps.length} critical case${safetyOps.length>1?'s':''} need immediate attention</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          ${safetyOps.slice(0,3).map(o=>`<span style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700;color:#b91c1c">${esc(o.caseId)} · ${esc((o.contact?.name||'Case').split(' ')[0])}</span>`).join('')}
        </div>
      </div>
      <a href="#cases" onclick="setFilter('critical')" style="background:#dc2626;color:#fff;border:none;border-radius:9px;padding:8px 16px;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap;flex-shrink:0">View All</a>
    </div>` : '';

  // Stats
  const stats = [
    {label:'Active Cases',     val:loading?'…':active,   bg:'#eff6ff', ic:'#3b82f6', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'},
    {label:'Critical',          val:loading?'…':critical, bg:'#fef2f2', ic:'#ef4444', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'},
    {label:'Due Soon',          val:loading?'…':dueSoon,  bg:'#fff7ed', ic:'#f97316', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'},
    {label:'Pending Callbacks', val:loading?'…':pending,  bg:'#f5f3ff', ic:'#8b5cf6', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'},
    {label:'Resolved',          val:loading?'…':resolved, bg:'#f0fdf4', ic:'#22c55e', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'},
    {label:'Total Cases',       val:loading?'…':total,    bg:'#f8fafc', ic:'#64748b', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'},
  ].map(s=>`
    <div style="background:#fff;border-radius:14px;padding:16px 18px;border:1px solid #e8edf2">
      <div style="width:36px;height:36px;border-radius:9px;background:${s.bg};display:flex;align-items:center;justify-content:center;margin-bottom:10px">
        <span style="width:18px;height:18px;color:${s.ic}">${s.svg}</span>
      </div>
      <div style="font-size:26px;font-weight:800;color:#0f172a;line-height:1">${s.val}</div>
      <div style="font-size:11px;color:#64748b;font-weight:500;margin-top:4px">${s.label}</div>
    </div>`).join('');

  // SLA cards
  const slaOk     = enriched.filter(o=>o.sla==='ok').length;
  const slaWarn   = enriched.filter(o=>o.sla==='warn').length;
  const slaBreach = enriched.filter(o=>o.sla==='breach').length;

  // Pipeline summary
  const pipelineSummary = PIPELINE_STAGES.map(stage=>{
    const count = enriched.filter(o=>stageNameToId(o.pipelineStageName||'')===stage.id).length;
    const pct   = total?Math.round(count/total*100):0;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f8fafc">
        <div style="font-size:11px;font-weight:600;color:#1e293b;min-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${stage.name}</div>
        <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${stage.color};border-radius:3px;transition:width .4s"></div>
        </div>
        <div style="font-size:11px;font-weight:700;color:${stage.color};min-width:28px;text-align:right">${count}</div>
      </div>`;
  }).join('');

  // Top cases table
  const topRows = enriched.slice(0,6).map(op=>`
    <tr onclick="openCaseDetail('${op.id}')" style="cursor:pointer">
      <td style="padding:10px 12px">
        <div style="font-size:12px;font-weight:700;color:#1e293b">${esc(op.contact?.name||'Unknown')}</div>
        <div style="font-size:10px;color:#94a3b8">${esc(op.caseId)}</div>
      </td>
      <td style="padding:10px 12px">
        <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:${op.urgency==='critical'?'#fef2f2':op.urgency==='medium'?'#fff7ed':'#f0fdf4'};color:${op.urgency==='critical'?'#b91c1c':op.urgency==='medium'?'#c2410c':'#15803d'}">${op.urgency}</span>
      </td>
      <td style="padding:10px 12px">
        <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;background:${getStageObj(op.pipelineStageName||'').bg};color:${getStageObj(op.pipelineStageName||'').color}">${esc(op.pipelineStageName||'New')}</span>
      </td>
      <td style="padding:10px 12px;font-size:11px;color:#94a3b8">${timeAgo(op.updatedAt)}</td>
      <td style="padding:10px 12px">
        <button onclick="event.stopPropagation();openCaseDetail('${op.id}')" style="background:#003D44;color:#fff;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">View</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;padding:32px;color:#94a3b8;font-size:13px">No pipeline data.</td></tr>`;

  return `
    ${safetyBanner}
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px">${stats}</div>

    <!-- SLA -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${[
        {label:'On Track (≤2h)', val:slaOk,     bg:'#f0fdf4',bg2:'#22c55e'},
        {label:'Due Soon (2–4h)', val:slaWarn,   bg:'#fffbeb',bg2:'#d97706'},
        {label:'SLA Breached (>4h)', val:slaBreach,bg:'#fef2f2',bg2:'#dc2626'},
      ].map(s=>`
        <div style="background:${s.bg};border:1.5px solid ${s.bg2}30;border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.bg2};flex-shrink:0${s.val>0&&s.label.includes('Breach')?';animation:dhpulse 1.5s infinite':''}"></div>
          <div>
            <div style="font-size:22px;font-weight:800;color:${s.bg2}">${loading?'…':s.val}</div>
            <div style="font-size:11px;font-weight:600;color:${s.bg2}cc">${s.label}</div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Quick filters -->
    <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:#94a3b8;align-self:center;margin-right:4px">Quick view:</span>
      <button class="flt-btn danger" onclick="setFilter('critical');location.hash='cases'">Critical</button>
      <button class="flt-btn" onclick="setFilter('new');location.hash='cases'">Untriaged</button>
      <button class="flt-btn" onclick="setFilter('due_soon');location.hash='cases'">Due Soon</button>
      <button class="flt-btn" onclick="setFilter('sla_breach');location.hash='cases'">SLA Breached</button>
      <button class="flt-btn" onclick="location.hash='cases'">All Cases →</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 340px;gap:16px">
      <!-- Live pipeline table -->
      <div style="background:#fff;border-radius:16px;border:1px solid #e8edf2;overflow:hidden">
        <div style="padding:14px 18px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:700;color:#0f172a">Live pipeline</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:1px">Top 6 from GoHighLevel</div>
          </div>
          <a href="#cases" style="font-size:11px;color:#006D77;font-weight:700;text-decoration:none">Full view →</a>
        </div>
        ${loading?`<div style="text-align:center;padding:40px"><div class="spinner" style="margin:0 auto 8px"></div><p style="color:#94a3b8;font-size:12px">Loading…</p></div>`:`
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:1px solid #f1f5f9">
            <th style="text-align:left;padding:8px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Caller</th>
            <th style="text-align:left;padding:8px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Urgency</th>
            <th style="text-align:left;padding:8px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Stage</th>
            <th style="text-align:left;padding:8px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Updated</th>
            <th></th>
          </tr></thead>
          <tbody>${topRows}</tbody>
        </table>`}
      </div>

      <!-- Right column -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <!-- Pipeline breakdown -->
        <div style="background:#fff;border-radius:16px;border:1px solid #e8edf2;padding:16px 18px">
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:12px">Pipeline breakdown</div>
          ${pipelineSummary}
          <a href="#cases" onclick="setCaseView('board')" style="display:block;text-align:center;margin-top:12px;background:#003D44;color:#fff;border-radius:9px;padding:9px;font-size:12px;font-weight:600;text-decoration:none">Open Board View →</a>
        </div>
        <!-- Upcoming callbacks -->
        <div style="background:#fff;border-radius:16px;border:1px solid #e8edf2;padding:16px 18px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:13px;font-weight:700;color:#0f172a">Upcoming callbacks</div>
            <button onclick="openCallbackForm()" style="background:#003D44;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer">+ Schedule</button>
          </div>
          ${callbacks.slice(0,3).map(cb=>`
            <div style="display:flex;align-items:center;gap:10px;padding:9px;background:#f8fafc;border-radius:10px;margin-bottom:6px">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:#1e293b">${esc(cb.name)}</div>
                <div style="font-size:10px;color:#94a3b8;margin-top:1px">${esc(cb.time)}</div>
              </div>
              <button onclick="removeCallback('${cb.id}')" style="background:none;border:1px solid #e2e8f0;border-radius:7px;padding:3px 8px;font-size:10px;font-weight:600;color:#64748b;cursor:pointer">Done</button>
            </div>`).join('')||'<p style="text-align:center;color:#94a3b8;font-size:12px;padding:12px">No callbacks scheduled.</p>'}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// CASE MANAGEMENT — with List/Board toggle
// ════════════════════════════════════════════════════════════
function renderCases(enriched) {
  const loading = ghlOpps===null;
  let filtered  = enriched;
  if      (activeFilter==='new')        filtered=enriched.filter(o=>o.displayStatus==='new');
  else if (activeFilter==='triaged')    filtered=enriched.filter(o=>o.displayStatus==='triaged');
  else if (activeFilter==='due_soon')   filtered=enriched.filter(o=>o.dueSoon&&o.displayStatus!=='resolved');
  else if (activeFilter==='resolved')   filtered=enriched.filter(o=>o.displayStatus==='resolved');
  else if (activeFilter==='critical')   filtered=enriched.filter(o=>o.urgency==='critical');
  else if (activeFilter==='sla_breach') filtered=enriched.filter(o=>o.sla==='breach');

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(o=>(o.contact?.name||'').toLowerCase().includes(q)||(o.name||'').toLowerCase().includes(q)||(o.caseId||'').toLowerCase().includes(q));
  }

  filtered = [...filtered].sort((a,b)=>{
    let av,bv;
    if (sortCol==='urgency'){const u={critical:0,medium:1,low:2};av=u[a.urgency]||2;bv=u[b.urgency]||2;}
    else if(sortCol==='name'){av=(a.contact?.name||'').toLowerCase();bv=(b.contact?.name||'').toLowerCase();}
    else if(sortCol==='sla'){const s={breach:0,warn:1,ok:2};av=s[a.sla]||2;bv=s[b.sla]||2;}
    else{av=new Date(a.updatedAt||0);bv=new Date(b.updatedAt||0);}
    if(av<bv)return sortDir==='asc'?-1:1;
    if(av>bv)return sortDir==='asc'?1:-1;
    return 0;
  });

  const view     = window._caseView||'table';
  const sortIcon = col => sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:#0f172a">Case Management</h1>
        <p style="font-size:12px;color:#64748b;margin-top:2px">${loading?'Loading…':filtered.length+' cases shown of '+enriched.length+' total'}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <!-- View toggle -->
        <div style="display:flex;background:#f1f5f9;border-radius:10px;padding:3px;gap:2px">
          <button onclick="setCaseView('table')" style="padding:6px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:${view==='table'?'#fff':'transparent'};color:${view==='table'?'#003D44':'#64748b'};box-shadow:${view==='table'?'0 1px 4px rgba(0,0,0,.08)':'none'}">List</button>
          <button onclick="setCaseView('board')" style="padding:6px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:${view==='board'?'#fff':'transparent'};color:${view==='board'?'#003D44':'#64748b'};box-shadow:${view==='board'?'0 1px 4px rgba(0,0,0,.08)':'none'}">Board</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:6px 12px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search cases…" value="${esc(searchQuery)}" oninput="searchQuery=this.value;render()" style="border:none;outline:none;font-size:12px;background:transparent;width:130px;color:#1e293b">
        </div>
        <select class="dh-select" onchange="setFilter(this.value)" style="font-size:12px;padding:7px 10px;width:auto">
          <option value="all"        ${activeFilter==='all'?'selected':''}>All Cases</option>
          <option value="new"        ${activeFilter==='new'?'selected':''}>New</option>
          <option value="triaged"    ${activeFilter==='triaged'?'selected':''}>Triaged</option>
          <option value="due_soon"   ${activeFilter==='due_soon'?'selected':''}>Due Soon</option>
          <option value="resolved"   ${activeFilter==='resolved'?'selected':''}>Resolved</option>
          <option value="critical"   ${activeFilter==='critical'?'selected':''}>Critical</option>
          <option value="sla_breach" ${activeFilter==='sla_breach'?'selected':''}>SLA Breached</option>
        </select>
        <button onclick="fetchGHL()" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:13px;color:#475569">↺</button>
      </div>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      <button class="flt-btn ${activeFilter==='all'?'active':''}"     onclick="setFilter('all')">All (${enriched.length})</button>
      <button class="flt-btn ${activeFilter==='new'?'active':''}"     onclick="setFilter('new')">New (${enriched.filter(o=>o.displayStatus==='new').length})</button>
      <button class="flt-btn ${activeFilter==='triaged'?'active':''}" onclick="setFilter('triaged')">Triaged (${enriched.filter(o=>o.displayStatus==='triaged').length})</button>
      <button class="flt-btn ${activeFilter==='due_soon'?'active':''}" onclick="setFilter('due_soon')">Due Soon (${enriched.filter(o=>o.dueSoon&&o.displayStatus!=='resolved').length})</button>
      <button class="flt-btn danger ${activeFilter==='critical'?'active':''}" onclick="setFilter('critical')">Critical (${enriched.filter(o=>o.urgency==='critical').length})</button>
      <button class="flt-btn ${activeFilter==='resolved'?'active':''}" onclick="setFilter('resolved')">Resolved (${enriched.filter(o=>o.displayStatus==='resolved').length})</button>
    </div>

    ${view==='board' ? renderPipelineBoard(filtered, loading) : renderCaseTable(filtered, enriched, loading, sortIcon)}
  `;
}

// ════════════════════════════════════════════════════════════
// PIPELINE BOARD
// ════════════════════════════════════════════════════════════
function renderPipelineBoard(filtered, loading) {
  if (loading) return `<div style="text-align:center;padding:60px"><div class="spinner" style="margin:0 auto 10px"></div><p style="color:#94a3b8;font-size:13px">Loading pipeline…</p></div>`;

  const grouped = {};
  PIPELINE_STAGES.forEach(s=>{grouped[s.id]=[];});
  filtered.forEach(op=>{
    const id = stageNameToId(op.pipelineStageName||'');
    grouped[id] = grouped[id]||[];
    grouped[id].push(op);
  });

  const columns = PIPELINE_STAGES.map(stage=>{
    const cases = grouped[stage.id]||[];
    const cards = cases.length
      ? cases.map(op=>renderBoardCard(op,stage)).join('')
      : `<div style="text-align:center;padding:20px;color:#cbd5e1;font-size:11px">No cases</div>`;
    return `
      <div style="min-width:230px;width:230px;flex-shrink:0;display:flex;flex-direction:column;background:#f8fafc;border-radius:14px;border:1px solid #e8edf2;overflow:hidden">
        <div style="padding:11px 13px;background:${stage.bg};border-bottom:2px solid ${stage.color}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <span style="font-size:10px;font-weight:700;color:${stage.color};line-height:1.3">${stage.name}</span>
            <span style="background:${stage.color};color:#fff;font-size:9px;font-weight:800;border-radius:20px;padding:1px 7px;flex-shrink:0">${cases.length}</span>
          </div>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:7px;max-height:580px;overflow-y:auto;flex:1">${cards}</div>
      </div>`;
  }).join('');

  return `<div style="overflow-x:auto;padding-bottom:16px"><div style="display:flex;gap:10px;min-width:max-content">${columns}</div></div>`;
}

function renderBoardCard(op, stage) {
  const urgColor = op.urgency==='critical'?'#dc2626':op.urgency==='medium'?'#d97706':'#64748b';
  const initials = (op.contact?.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const stageOpts = PIPELINE_STAGES.map(s=>`<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')=== s.id?'selected':''}>${s.name}</option>`).join('');
  return `
    <div style="background:#fff;border-radius:10px;border:1px solid #e8edf2;padding:11px;cursor:pointer;transition:box-shadow .15s"
         onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.07)'"
         onmouseout="this.style.boxShadow='none'"
         onclick="openCaseDetail('${op.id}')">
      <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:7px">
        <div style="width:26px;height:26px;border-radius:6px;background:${stage.bg};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${stage.color};flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(op.contact?.name||op.displayName||'Unknown')}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(op.name||'—')}</div>
        </div>
        <div style="width:6px;height:6px;border-radius:50%;background:${urgColor};flex-shrink:0;margin-top:3px" title="${op.urgency}"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:20px">${esc(op.caseId)}</span>
        <span style="font-size:9px;color:#94a3b8">${timeAgo(op.updatedAt)}</span>
      </div>
      <div onclick="event.stopPropagation()" style="border-top:1px solid #f1f5f9;padding-top:7px">
        <select onchange="handleStageMove('${op.id}',this.value,this)"
          style="width:100%;font-size:10px;padding:4px 7px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc;color:#374151;cursor:pointer;outline:none;font-family:inherit">
          ${stageOpts}
        </select>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// CASE TABLE
// ════════════════════════════════════════════════════════════
function renderCaseTable(filtered, enriched, loading, sortIcon) {
  let rows = '';
  if (loading) {
    rows = `<tr><td colspan="7" style="text-align:center;padding:48px"><div class="spinner" style="margin:0 auto 10px"></div><p style="color:#94a3b8;font-size:13px">Loading cases from GHL…</p></td></tr>`;
  } else if (!filtered.length) {
    rows = `<tr><td colspan="7" style="text-align:center;padding:48px">
      <p style="color:#94a3b8;font-size:13px;font-weight:500;margin-bottom:10px">No cases match this filter</p>
      <button onclick="setFilter('all');searchQuery='';render()" style="background:#f1f5f9;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;color:#475569;cursor:pointer">Clear Filters</button>
    </td></tr>`;
  } else {
    rows = filtered.map(op => {
      const origIdx  = (ghlOpps||[]).findIndex(o=>o.id===op.id);
      const stage    = getStageObj(op.pipelineStageName||'');
      const urgDot   = op.urgency==='critical'?'#dc2626':op.urgency==='medium'?'#f97316':'#22c55e';
      const stageOpts= PIPELINE_STAGES.map(s=>`<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')=== s.id?'selected':''}>${s.name}</option>`).join('');
      return `
        <tr style="cursor:pointer;${op.urgency==='critical'?'background:#fff8f8;':''}" onclick="openCaseDetail('${op.id}')">
          <td style="padding:11px 12px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:6px;height:6px;border-radius:50%;background:${urgDot};flex-shrink:0"></div>
              <div>
                <div style="font-size:12px;font-weight:700;color:#1e293b">${esc(op.contact?.name||op.displayName||'Unknown')}</div>
                <div style="font-size:10px;color:#94a3b8">${esc(op.contact?.phone||op.contact?.email||'')}</div>
                <div style="font-size:9px;color:#cbd5e1;font-family:monospace">${esc(op.caseId)}</div>
              </div>
            </div>
          </td>
          <td style="padding:11px 12px;font-size:11px;color:#64748b;white-space:nowrap">${timeAgo(op.createdAt)}</td>
          <td style="padding:11px 12px">
            <span style="padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${op.urgency==='critical'?'#fef2f2':op.urgency==='medium'?'#fff7ed':'#f0fdf4'};color:${op.urgency==='critical'?'#b91c1c':op.urgency==='medium'?'#c2410c':'#15803d'}">${op.urgency}</span>
          </td>
          <td onclick="event.stopPropagation()" style="padding:11px 12px">
            <select onchange="handleStageMove('${op.id}',this.value,this)"
              style="font-size:11px;padding:5px 8px;border:1.5px solid ${stage.color}30;border-radius:8px;background:${stage.bg};color:${stage.color};font-weight:600;cursor:pointer;outline:none;font-family:inherit;max-width:180px">
              ${stageOpts}
            </select>
          </td>
          <td style="padding:11px 12px">
            ${cbStatuses[op.id]?.done?'<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✓ Done</span>':'<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">Pending</span>'}
          </td>
          <td onclick="event.stopPropagation()" style="padding:11px 12px">
            <select class="dh-select" style="font-size:11px;padding:4px 8px;width:auto" onchange="assignStaff('${op.id}',this.value)">
              ${STAFF_LIST.map(s=>`<option ${op.assignedTo===s?'selected':''}>${esc(s)}</option>`).join('')}
            </select>
          </td>
          <td style="padding:11px 12px">
            <div style="display:flex;gap:5px;justify-content:flex-end">
              <button onclick="openCaseDetail('${op.id}')" style="background:#003D44;color:#fff;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">View</button>
              <button onclick="openEscalateModal(${origIdx})" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:7px;padding:5px 8px;font-size:11px;cursor:pointer" title="Escalate">⚠</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  return `
    <div style="background:#fff;border-radius:16px;border:1px solid #e8edf2;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
          <thead>
            <tr style="border-bottom:2px solid #f1f5f9">
              <th onclick="toggleSort('name')" style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer">Caller ${sortIcon('name')}</th>
              <th onclick="toggleSort('updated')" style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer">Date ${sortIcon('updated')}</th>
              <th onclick="toggleSort('urgency')" style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer">Urgency ${sortIcon('urgency')}</th>
              <th style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Pipeline Stage</th>
              <th style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Callback</th>
              <th style="text-align:left;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Assigned</th>
              <th style="text-align:right;padding:9px 12px;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// STAFF HANDOVER
// ════════════════════════════════════════════════════════════
function renderHandover() {
  return `
    <div style="margin-bottom:20px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a">Staff Handover</h1>
      <p style="font-size:12px;color:#64748b;margin-top:4px">Shift transitions, assignments, and internal notes</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="display:flex;flex-direction:column;gap:14px">
        <!-- Assignment -->
        <div style="background:#fff;border-radius:16px;padding:20px 22px;border:1px solid #e8edf2">
          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">Staff Assignment</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:16px">Reassign cases to staff members</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Case ID</label>
              <input id="assignCaseId" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;font-family:monospace;background:#f8fafc;color:#1e293b" placeholder="e.g. C-ABC123">
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Assign to</label>
              <select id="assignStaffSel" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;background:#f8fafc;color:#374151;font-family:inherit">
                ${STAFF_LIST.map(s=>`<option>${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Internal note</label>
              <textarea id="assignNote" rows="3" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;resize:none;background:#f8fafc;font-family:inherit;color:#1e293b" placeholder="Reason for assignment…"></textarea>
            </div>
            <button onclick="saveAssignment()" style="background:#003D44;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Save Assignment</button>
          </div>
        </div>
        <!-- Handover note -->
        <div style="background:#fff;border-radius:16px;padding:20px 22px;border:1px solid #e8edf2">
          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">Post Handover Note</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:16px">Record shift transitions for the care team</div>
          <textarea id="handoverNote" rows="5" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;resize:none;background:#f8fafc;font-family:inherit;color:#1e293b;margin-bottom:10px" placeholder="Describe care updates, urgent flags, or shift context…"></textarea>
          <button onclick="submitHandover()" style="width:100%;background:#003D44;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Publish to Shift Feed</button>
        </div>
      </div>
      <!-- Handover feed -->
      <div style="background:#fff;border-radius:16px;padding:20px 22px;border:1px solid #e8edf2">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px">Handover Feed</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:16px">Recent shift notes from the team</div>
        <div style="max-height:560px;overflow-y:auto;display:flex;flex-direction:column;gap:10px">
          ${renderHandoverList()}
        </div>
      </div>
    </div>`;
}

function renderHandoverList() {
  const notes = getHandovers();
  if (!notes.length) return `<div style="text-align:center;padding:40px;color:#94a3b8;font-size:13px">No handover notes yet.</div>`;
  return notes.map(h=>`
    <div style="padding:14px;background:#f8fafc;border-radius:12px;border:1px solid #f1f5f9">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-size:12px;font-weight:700;color:#0f172a">${esc(h.staff_name||'Staff')}</div>
          ${h.staff_role?`<div style="font-size:10px;color:#94a3b8;margin-top:1px">${esc(h.staff_role)}</div>`:''}
        </div>
        <div style="font-size:10px;color:#94a3b8;white-space:nowrap">${h.created_at?new Date(h.created_at).toLocaleString('en-SG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</div>
      </div>
      <div style="font-size:12px;color:#475569;font-style:italic;line-height:1.6">"${esc(h.note_content)}"</div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════
// CASE DETAIL PANEL
// ════════════════════════════════════════════════════════════
function openCaseDetail(oppId) {
  const idx = (ghlOpps||[]).findIndex(o=>o.id===oppId);
  if (idx<0) return;
  const op  = enrich(ghlOpps[idx], idx);
  const stageObj = getStageObj(op.pipelineStageName||'');
  const stageOpts= PIPELINE_STAGES.map(s=>`<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')===s.id?'selected':''}>${s.name}</option>`).join('');
  const csKey    = caseStatuses[oppId]||'New';
  const notes    = caseNotes[oppId]||'';
  const cbDone   = cbStatuses[oppId]?.done;
  const cbTs     = cbStatuses[oppId]?.ts;

  const transcript = op.transcript||op.description||`[Transcript not yet available for ${esc(op.caseId)}. Will appear here after ElevenLabs sync.]`;
  const aiSummary  = op.ai_summary||op.name||`AI analysis: ${esc(op.contact?.name||'Caller')} reported a ${op.urgency}-priority concern. Category: ${op.category}. Intent: ${op.intent||'—'}.`;

  document.getElementById('modal-root').innerHTML=`
  <div style="position:fixed;inset:0;background:rgba(0,40,50,.65);backdrop-filter:blur(8px);z-index:500;display:flex;align-items:flex-start;justify-content:flex-end" id="caseOverlay" onclick="if(event.target===this)closeCaseDetail()">
    <div style="background:#fff;width:100%;max-width:660px;height:100vh;overflow-y:auto;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(0,0,0,.18)">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#003D44,#006D77);padding:22px 26px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <button onclick="closeCaseDetail()" style="background:rgba(255,255,255,.15);border:none;border-radius:8px;padding:7px 12px;color:#fff;font-size:13px;cursor:pointer;font-weight:600">← Back</button>
          <div style="flex:1">
            <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Case Detail</div>
            <div style="font-size:17px;font-weight:800;color:#fff">${esc(op.contact?.name||'Unknown Caller')}</div>
          </div>
          <span style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${op.urgency==='critical'?'#dc2626':op.urgency==='medium'?'#d97706':'#22c55e'};color:#fff">${op.urgency.toUpperCase()}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${[op.caseId, fmtDate(op.createdAt), op.category, op.intent||''].filter(Boolean).map(t=>`<span style="background:rgba(255,255,255,.12);color:rgba(255,255,255,.8);font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px">${esc(t)}</span>`).join('')}
        </div>
      </div>

      <!-- Caller info -->
      <div style="padding:18px 26px;border-bottom:1px solid #f1f5f9">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Caller Information</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${[
            ['Phone',    op.contact?.phone||'—'],
            ['Email',    op.contact?.email||'—'],
            ['Callback', cbDone?`✓ Done · ${new Date(cbTs||'').toLocaleString('en-SG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})||''}` :'Pending'],
            ['Consent',  'Verified'],
          ].map(([l,v])=>`<div style="background:#f8fafc;border-radius:10px;padding:10px 12px"><div style="font-size:9.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${l}</div><div style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v)}</div></div>`).join('')}
        </div>
      </div>

      <!-- AI insights -->
      <div style="padding:18px 26px;border-bottom:1px solid #f1f5f9">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">AI Insights</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px">
            <div style="font-size:9.5px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">AI Summary</div>
            <div style="font-size:12px;color:#14532d;line-height:1.6">${esc(aiSummary)}</div>
          </div>
          <div style="background:${op.urgency==='critical'?'#fef2f2':'#f5f3ff'};border:1px solid ${op.urgency==='critical'?'#fca5a5':'#ddd6fe'};border-radius:12px;padding:12px 14px">
            <div style="font-size:9.5px;font-weight:700;color:${op.urgency==='critical'?'#b91c1c':'#5b21b6'};text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Recommended Action</div>
            <div style="font-size:12px;color:${op.urgency==='critical'?'#991b1b':'#4c1d95'};font-weight:600">
              ${op.urgency==='critical'?'Escalate immediately — assign senior staff and notify family.':op.urgency==='medium'?'Schedule follow-up call within 2 hours.':'Standard response — review at next shift check-in.'}
            </div>
          </div>
        </div>
      </div>

      <!-- Transcript -->
      <div style="padding:18px 26px;border-bottom:1px solid #f1f5f9">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Call Transcript</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;font-size:12px;line-height:1.7;color:#374151;max-height:200px;overflow-y:auto;font-family:monospace">${esc(transcript)}</div>
      </div>

      <!-- Staff actions -->
      <div style="padding:18px 26px;flex:1">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Staff Actions</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <!-- Pipeline stage mover -->
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Pipeline Stage</label>
            <select id="detailStage" onchange="handleStageMove('${op.id}',this.value,this)"
              style="width:100%;padding:9px 12px;border:1.5px solid ${stageObj.color}40;border-radius:10px;background:${stageObj.bg};color:${stageObj.color};font-size:13px;font-weight:600;cursor:pointer;outline:none;font-family:inherit">
              ${stageOpts}
            </select>
            <p style="font-size:10px;color:#94a3b8;margin-top:3px">Changes sync to GoHighLevel immediately</p>
          </div>
          <!-- Status -->
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Case Status</label>
            <select id="cdStatus" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:#f8fafc;color:#374151;outline:none;font-family:inherit">
              ${['New','In Progress','Resolved'].map(s=>`<option ${csKey===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <!-- Assign -->
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Assigned staff</label>
            <select id="cdAssign" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:#f8fafc;color:#374151;outline:none;font-family:inherit">
              ${STAFF_LIST.map(s=>`<option ${op.assignedTo===s?'selected':''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
          <!-- Notes -->
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Case notes</label>
            <textarea id="cdNotes" rows="4" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;resize:none;background:#f8fafc;font-family:inherit;color:#1e293b" placeholder="Add notes…">${esc(notes)}</textarea>
          </div>
          <div id="cdSaveMsg" class="hidden" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:600">✓ Saved successfully</div>
          <div style="display:flex;gap:10px">
            <button onclick="saveCaseAction('${oppId}',${idx})" style="flex:1;background:#003D44;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Save Updates</button>
            <button onclick="openEscalateModal(${idx})" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">⚠ Escalate</button>
            <button onclick="openModal(${idx})" style="background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📝 Note</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function closeCaseDetail() { document.getElementById('modal-root').innerHTML=''; }

function saveCaseAction(oppId, idx) {
  const status = document.getElementById('cdStatus').value;
  const assign = document.getElementById('cdAssign').value;
  const notes  = document.getElementById('cdNotes').value.trim();
  caseStatuses[oppId]=status; assignments[oppId]=assign;
  if (notes) caseNotes[oppId]=notes;
  localStorage.setItem('dsg_case_statuses',JSON.stringify(caseStatuses));
  localStorage.setItem('dsg_assignments',JSON.stringify(assignments));
  localStorage.setItem('dsg_case_notes',JSON.stringify(caseNotes));
  const msg=document.getElementById('cdSaveMsg');
  if (msg){msg.classList.remove('hidden');setTimeout(()=>msg.classList.add('hidden'),2500);}
}

function markCallbackDone(oppId) {
  cbStatuses[oppId]={done:true,ts:new Date().toISOString()};
  localStorage.setItem('dsg_cb_statuses',JSON.stringify(cbStatuses));
  openCaseDetail(oppId);
}

// ════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════
let activeOppIdx = null;

function openModal(idx) {
  activeOppIdx=idx;
  const op=ghlOpps?.[idx];
  document.getElementById('modalName').innerText=op?.contact?.name||'Contact';
  document.getElementById('noteErr').classList.add('hidden');
  document.getElementById('noteText').value='';
  document.getElementById('noteModal').classList.remove('hidden');
}
function closeNoteModal() { document.getElementById('noteModal').classList.add('hidden'); }

async function submitNote() {
  const text=document.getElementById('noteText').value.trim();
  const btn=document.getElementById('noteBtn');
  const err=document.getElementById('noteErr');
  if (!text){err.innerText='Please type a note.';err.classList.remove('hidden');return;}
  const op=ghlOpps?.[activeOppIdx];
  const cid=op?.contact?.id;
  if (!cid){err.innerText='No contact ID.';err.classList.remove('hidden');return;}
  btn.innerHTML='<span class="spinner"></span> Syncing…';btn.disabled=true;err.classList.add('hidden');
  try{await syncNoteToGHL(cid,text);closeNoteModal();}
  catch(e){err.innerText='Failed: '+e.message;err.classList.remove('hidden');}
  finally{btn.innerHTML='Sync to GHL';btn.disabled=false;}
}

function openEscalateModal(idx) {
  const op=ghlOpps?.[idx];if(!op)return;
  document.getElementById('modal-root').innerHTML=`
    <div style="position:fixed;inset:0;background:rgba(0,40,50,.6);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)document.getElementById('modal-root').innerHTML=''">
      <div style="background:#fff;border-radius:20px;padding:28px;width:100%;max-width:420px;box-shadow:0 24px 60px rgba(0,0,0,.2)">
        <div style="font-size:17px;font-weight:800;color:#dc2626;margin-bottom:4px">Escalate Case</div>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:18px">${esc(op.contact?.name||'Contact')} · ${esc(enrich(op,idx).caseId)}</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Escalation type</label>
            <select id="escType" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:#f8fafc;color:#374151;outline:none;font-family:inherit">
              <option>Missing Person</option><option>Self-Harm Risk</option><option>Medical Emergency</option>
              <option>Caregiver Distress</option><option>Violence / Safety</option><option>Other Critical</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Assign to</label>
            <select id="escStaff" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;background:#f8fafc;color:#374151;outline:none;font-family:inherit">
              ${STAFF_LIST.filter(s=>s!=='Unassigned').map(s=>`<option>${esc(s)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Notes</label>
            <textarea id="escNote" rows="3" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;outline:none;resize:none;background:#f8fafc;font-family:inherit;color:#1e293b" placeholder="Describe the situation…"></textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button onclick="submitEscalation(${idx})" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Confirm Escalation</button>
          <button onclick="document.getElementById('modal-root').innerHTML=''" style="background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
        </div>
      </div>
    </div>`;
}

function openCallbackForm() {
  document.getElementById('modal-root').innerHTML=`
    <div style="position:fixed;inset:0;background:rgba(0,40,50,.6);backdrop-filter:blur(6px);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)document.getElementById('modal-root').innerHTML=''">
      <div style="background:#fff;border-radius:
