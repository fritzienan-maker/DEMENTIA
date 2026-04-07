// ════════════════════════════════════════════════════════════
// PIPELINE STAGES — matches GHL exactly
// ════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { id: 'new_untriaged',          name: 'New - Untriaged',               color: '#6366f1', bg: '#eef2ff' },
  { id: 'self_serve_resolved',    name: 'Self-Serve Resolved',           color: '#22c55e', bg: '#f0fdf4' },
  { id: 'needs_staff',            name: 'Needs Staff - Awaiting Contact', color: '#f97316', bg: '#fff7ed' },
  { id: 'escalation_no_staff',    name: 'Escalation – No Staff Available',color: '#ef4444', bg: '#fef2f2' },
  { id: 'in_progress',            name: 'In Progress',                   color: '#3b82f6', bg: '#eff6ff' },
  { id: 'callback_scheduled',     name: 'Callback Scheduled',            color: '#8b5cf6', bg: '#f5f3ff' },
  { id: 'scheduled_followup',     name: 'Scheduled / Follow Up',         color: '#0ea5e9', bg: '#f0f9ff' },
  { id: 'referred_redirected',    name: 'Referred / Redirected',         color: '#d97706', bg: '#fffbeb' },
  { id: 'closed_resolved',        name: 'Closed - Resolved',             color: '#15803d', bg: '#f0fdf4' },
  { id: 'closed_unreachable',     name: 'Closed - Unreachable',          color: '#64748b', bg: '#f8fafc' },
  { id: 'urgent_action',          name: 'Urgent - Immediate Action',     color: '#dc2626', bg: '#fef2f2' },
];

// Map GHL pipeline stage names to our IDs
function stageNameToId(stageName) {
  const n = (stageName||'').toLowerCase();
  if (n.includes('untriaged'))           return 'new_untriaged';
  if (n.includes('self-serve'))          return 'self_serve_resolved';
  if (n.includes('needs staff'))         return 'needs_staff';
  if (n.includes('escalation'))          return 'escalation_no_staff';
  if (n.includes('in progress'))         return 'in_progress';
  if (n.includes('callback'))           return 'callback_scheduled';
  if (n.includes('follow'))             return 'scheduled_followup';
  if (n.includes('referred') || n.includes('redirected')) return 'referred_redirected';
  if (n.includes('closed') && n.includes('resolved'))     return 'closed_resolved';
  if (n.includes('unreachable'))         return 'closed_unreachable';
  if (n.includes('urgent'))             return 'urgent_action';
  return 'new_untriaged';
}

function getStageObj(stageName) {
  const id = stageNameToId(stageName);
  return PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];
}

// ════════════════════════════════════════════════════════════
// MOVE CASE TO STAGE — calls GHL API via proxy
// ════════════════════════════════════════════════════════════
async function moveCaseToStage(oppId, targetStageName) {
  try {
    // First get pipeline stages from GHL to get the real stage ID
    const stagesRes = await DHAPI._get(`/opportunities/pipelines?locationId=${CFG.locationId}`);
    const pipeline  = stagesRes?.pipelines?.find(p => p.name === 'Caregiver Cases');
    if (!pipeline) throw new Error('Pipeline not found');
    const stage = pipeline.stages?.find(s => s.name === targetStageName);
    if (!stage) throw new Error(`Stage "${targetStageName}" not found`);

    await DHAPI.updateOpportunity(oppId, { pipelineStageId: stage.id });
    return true;
  } catch(e) {
    console.error('[moveCaseToStage]', e.message);
    // Fallback: store locally and show optimistic update
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// ADD TO EXISTING STAFF STATE
// ════════════════════════════════════════════════════════════
// Add this to the existing state variables:
// let caseView = 'table'; // 'table' | 'board'
// let activePipelineStage = 'all'; // for board filtering

// ════════════════════════════════════════════════════════════
// REPLACE renderCases() with this version
// ════════════════════════════════════════════════════════════
function renderCases(enriched) {
  const loading = ghlOpps === null;

  // Apply filter
  let filtered = enriched;
  if      (activeFilter === 'new')        filtered = enriched.filter(o => o.displayStatus === 'new');
  else if (activeFilter === 'triaged')    filtered = enriched.filter(o => o.displayStatus === 'triaged');
  else if (activeFilter === 'due_soon')   filtered = enriched.filter(o => o.dueSoon && o.displayStatus !== 'resolved');
  else if (activeFilter === 'resolved')   filtered = enriched.filter(o => o.displayStatus === 'resolved');
  else if (activeFilter === 'critical')   filtered = enriched.filter(o => o.urgency === 'critical');
  else if (activeFilter === 'sla_breach') filtered = enriched.filter(o => o.sla === 'breach');

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(o =>
      (o.contact?.name||'').toLowerCase().includes(q) ||
      (o.name||'').toLowerCase().includes(q) ||
      (o.caseId||'').toLowerCase().includes(q)
    );
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortCol === 'urgency')  { const u={critical:0,medium:1,low:2}; av=u[a.urgency]||2; bv=u[b.urgency]||2; }
    else if (sortCol === 'name'){ av=(a.contact?.name||'').toLowerCase(); bv=(b.contact?.name||'').toLowerCase(); }
    else if (sortCol === 'sla') { const s={breach:0,warn:1,ok:2}; av=s[a.sla]||2; bv=s[b.sla]||2; }
    else { av=new Date(a.updatedAt||0); bv=new Date(b.updatedAt||0); }
    if (av<bv) return sortDir==='asc'?-1:1;
    if (av>bv) return sortDir==='asc'?1:-1;
    return 0;
  });

  const view = window._caseView || 'table';
  const sortIcon = col => sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:#0f172a">Case Management</h1>
        <p style="font-size:12px;color:#64748b;margin-top:2px">${loading?'Loading…':filtered.length+' cases · '+enriched.length+' total'}</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="display:flex;background:#f1f5f9;border-radius:10px;padding:3px;gap:2px">
          <button onclick="setCaseView('table')" style="padding:6px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;background:${view==='table'?'#fff':'transparent'};color:${view==='table'?'#003D44':'#64748b'};box-shadow:${view==='table'?'0 1px 4px rgba(0,0,0,.08)':'none'}">
            List
          </button>
          <button onclick="setCaseView('board')" style="padding:6px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;background:${view==='board'?'#fff':'transparent'};color:${view==='board'?'#003D44':'#64748b'};box-shadow:${view==='board'?'0 1px 4px rgba(0,0,0,.08)':'none'}">
            Board
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:6px 12px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search cases…" value="${esc(searchQuery)}" oninput="searchQuery=this.value;render()" style="border:none;outline:none;font-size:12px;background:transparent;width:140px;color:#1e293b">
        </div>
        <select class="dh-select" onchange="setFilter(this.value)" style="font-size:12px;padding:7px 12px;width:auto">
          <option value="all"        ${activeFilter==='all'?'selected':''}>All Cases</option>
          <option value="new"        ${activeFilter==='new'?'selected':''}>New</option>
          <option value="triaged"    ${activeFilter==='triaged'?'selected':''}>Triaged</option>
          <option value="due_soon"   ${activeFilter==='due_soon'?'selected':''}>Due Soon</option>
          <option value="resolved"   ${activeFilter==='resolved'?'selected':''}>Resolved</option>
          <option value="critical"   ${activeFilter==='critical'?'selected':''}>Critical</option>
          <option value="sla_breach" ${activeFilter==='sla_breach'?'selected':''}>SLA Breached</option>
        </select>
        <button onclick="fetchGHL()" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:13px">↺</button>
      </div>
    </div>

    <!-- Filter chips -->
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      <button class="flt-btn ${activeFilter==='all'?'active':''}"     onclick="setFilter('all')">All (${enriched.length})</button>
      <button class="flt-btn ${activeFilter==='new'?'active':''}"     onclick="setFilter('new')">New (${enriched.filter(o=>o.displayStatus==='new').length})</button>
      <button class="flt-btn ${activeFilter==='triaged'?'active':''}" onclick="setFilter('triaged')">Triaged (${enriched.filter(o=>o.displayStatus==='triaged').length})</button>
      <button class="flt-btn ${activeFilter==='due_soon'?'active':''}" onclick="setFilter('due_soon')">Due Soon (${enriched.filter(o=>o.dueSoon&&o.displayStatus!=='resolved').length})</button>
      <button class="flt-btn danger ${activeFilter==='critical'?'active':''}" onclick="setFilter('critical')">Critical (${enriched.filter(o=>o.urgency==='critical').length})</button>
      <button class="flt-btn ${activeFilter==='resolved'?'active':''}" onclick="setFilter('resolved')">Resolved (${enriched.filter(o=>o.displayStatus==='resolved').length})</button>
    </div>

    ${view === 'board' ? renderPipelineBoard(filtered, loading) : renderCaseTable(filtered, enriched, loading, sortIcon)}
  `;
}

// ════════════════════════════════════════════════════════════
// PIPELINE BOARD VIEW
// ════════════════════════════════════════════════════════════
function renderPipelineBoard(filtered, loading) {
  if (loading) {
    return `<div style="text-align:center;padding:60px"><div class="spinner" style="margin:0 auto 10px"></div><p style="color:#94a3b8;font-size:13px">Loading pipeline…</p></div>`;
  }

  // Group cases by pipeline stage
  const grouped = {};
  PIPELINE_STAGES.forEach(s => { grouped[s.id] = []; });
  filtered.forEach(op => {
    const id = stageNameToId(op.pipelineStageName || '');
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(op);
  });

  const columns = PIPELINE_STAGES.map(stage => {
    const cases = grouped[stage.id] || [];
    const cards = cases.length ? cases.map(op => renderBoardCard(op, stage)).join('') : `
      <div style="text-align:center;padding:20px;color:#cbd5e1;font-size:11px">
        No cases
      </div>`;

    return `
      <div style="min-width:240px;width:240px;flex-shrink:0;display:flex;flex-direction:column;background:#f8fafc;border-radius:14px;border:1px solid #e8edf2;overflow:hidden">
        <div style="padding:12px 14px;background:${stage.bg};border-bottom:2px solid ${stage.color}">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:11px;font-weight:700;color:${stage.color};line-height:1.3">${stage.name}</span>
            <span style="background:${stage.color};color:#fff;font-size:10px;font-weight:800;border-radius:20px;padding:1px 8px;min-width:20px;text-align:center">${cases.length}</span>
          </div>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:8px;max-height:600px;overflow-y:auto;flex:1">
          ${cards}
        </div>
      </div>`;
  }).join('');

  return `
    <div style="overflow-x:auto;padding-bottom:16px">
      <div style="display:flex;gap:12px;min-width:max-content">
        ${columns}
      </div>
    </div>`;
}

function renderBoardCard(op, stage) {
  const urgClass = op.urgency==='critical'?'#dc2626':op.urgency==='medium'?'#d97706':'#64748b';
  const initials = (op.contact?.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  // Stage options for dropdown
  const stageOptions = PIPELINE_STAGES.map(s =>
    `<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')=== s.id?'selected':''}>${s.name}</option>`
  ).join('');

  return `
    <div style="background:#fff;border-radius:10px;border:1px solid #e8edf2;padding:12px;cursor:pointer;transition:box-shadow .15s"
         onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.08)'"
         onmouseout="this.style.boxShadow='none'"
         onclick="openCaseDetail('${op.id}')">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
        <div style="width:28px;height:28px;border-radius:7px;background:${stage.bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${stage.color};flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(op.contact?.name||op.displayName||'Unknown')}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(op.name||'—')}</div>
        </div>
        <div style="width:6px;height:6px;border-radius:50%;background:${urgClass};flex-shrink:0;margin-top:4px" title="${op.urgency}"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:20px">${esc(op.caseId)}</span>
        <span style="font-size:9px;color:#94a3b8">${timeAgo(op.updatedAt)}</span>
      </div>
      <!-- Stage mover -->
      <div onclick="event.stopPropagation()" style="margin-top:6px;border-top:1px solid #f1f5f9;padding-top:8px">
        <select onchange="handleStageMove('${op.id}',this.value,this)"
          style="width:100%;font-size:10px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc;color:#374151;cursor:pointer;outline:none;font-family:inherit">
          ${stageOptions}
        </select>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// CASE TABLE VIEW
// ════════════════════════════════════════════════════════════
function renderCaseTable(filtered, enriched, loading, sortIcon) {
  let rows = '';
  if (loading) {
    rows = `<tr><td colspan="8" style="text-align:center;padding:48px"><div class="spinner" style="margin:0 auto 10px"></div><p style="color:#94a3b8;font-size:13px">Loading cases from GHL…</p></td></tr>`;
  } else if (!filtered.length) {
    rows = `<tr><td colspan="8"><div style="text-align:center;padding:48px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin:0 auto 10px;display:block"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <p style="color:#94a3b8;font-size:13px;font-weight:500">No cases match this filter</p>
      <button onclick="setFilter('all');searchQuery='';render()" style="margin-top:10px;background:#f1f5f9;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;color:#475569;cursor:pointer">Clear filters</button>
    </div></td></tr>`;
  } else {
    rows = filtered.map((op, i) => {
      const origIdx = (ghlOpps||[]).findIndex(o => o.id === op.id);
      const stage   = getStageObj(op.pipelineStageName||'');
      const urgDot  = op.urgency==='critical'?'#dc2626':op.urgency==='medium'?'#f97316':'#22c55e';

      // Stage dropdown for inline move
      const stageOptions = PIPELINE_STAGES.map(s =>
        `<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')=== s.id?'selected':''}>${s.name}</option>`
      ).join('');

      return `
        <tr style="cursor:pointer;${op.urgency==='critical'?'background:#fff8f8;':''}" onclick="openCaseDetail('${op.id}')">
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:6px;height:6px;border-radius:50%;background:${urgDot};flex-shrink:0"></div>
              <div>
                <div style="font-size:12px;font-weight:700;color:#1e293b">${esc(op.contact?.name||op.displayName||'Unknown')}</div>
                <div style="font-size:10px;color:#94a3b8">${esc(op.contact?.phone||op.contact?.email||'')}</div>
                <div style="font-size:9px;color:#cbd5e1;font-family:monospace">${esc(op.caseId)}</div>
              </div>
            </div>
          </td>
          <td style="font-size:11px;color:#64748b">${timeAgo(op.createdAt)}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${op.urgency==='critical'?'#fef2f2':op.urgency==='medium'?'#fff7ed':'#f0fdf4'};color:${op.urgency==='critical'?'#b91c1c':op.urgency==='medium'?'#c2410c':'#15803d'}">
              ${op.urgency}
            </span>
          </td>
          <td onclick="event.stopPropagation()">
            <!-- Inline pipeline stage mover -->
            <select onchange="handleStageMove('${op.id}',this.value,this)"
              style="font-size:11px;padding:5px 8px;border:1.5px solid ${stage.color}30;border-radius:8px;background:${stage.bg};color:${stage.color};font-weight:600;cursor:pointer;outline:none;font-family:inherit;max-width:180px">
              ${stageOptions}
            </select>
          </td>
          <td>
            ${op.cbRequired===false?`<span style="background:#f1f5f9;color:#64748b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">N/A</span>`:
              cbStatuses[op.id]?.done?`<span style="background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✓ Done</span>`:
              `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">Pending</span>`}
          </td>
          <td onclick="event.stopPropagation()">
            <select class="dh-select" style="font-size:11px;padding:4px 8px;width:auto" onchange="assignStaff('${op.id}',this.value)">
              ${STAFF_LIST.map(s=>`<option ${op.assignedTo===s?'selected':''}>${esc(s)}</option>`).join('')}
            </select>
          </td>
          <td onclick="event.stopPropagation()">
            <div style="display:flex;gap:5px;justify-content:flex-end">
              <button onclick="openCaseDetail('${op.id}')" style="background:#003D44;color:#fff;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">View</button>
              <button onclick="openEscalateModal(${origIdx})" style="background:#fef3c7;color:#92400e;border:none;border-radius:7px;padding:5px 8px;font-size:11px;cursor:pointer" title="Escalate">⚠</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  return `
    <div style="background:#fff;border-radius:16px;border:1px solid #e8edf2;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:800px">
          <thead>
            <tr style="border-bottom:2px solid #f1f5f9">
              <th onclick="toggleSort('name')" style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer;white-space:nowrap">
                Caller ${sortIcon('name')}
              </th>
              <th onclick="toggleSort('updated')" style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer;white-space:nowrap">
                Date ${sortIcon('updated')}
              </th>
              <th onclick="toggleSort('urgency')" style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;cursor:pointer;white-space:nowrap">
                Urgency ${sortIcon('urgency')}
              </th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;white-space:nowrap">
                Pipeline Stage
              </th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Callback</th>
              <th style="text-align:left;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Assigned</th>
              <th style="text-align:right;padding:10px 14px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// HANDLE STAGE MOVE
// ════════════════════════════════════════════════════════════
async function handleStageMove(oppId, targetStageName, selectEl) {
  const original = selectEl.dataset.original || selectEl.value;
  selectEl.dataset.original = selectEl.value;
  selectEl.disabled = true;
  selectEl.style.opacity = '0.6';

  try {
    // Update via GHL API
    const res = await DHAPI.updateOpportunity(oppId, {
      // Pass stage name — the API proxy handles stage ID lookup
      pipelineStageName: targetStageName,
    });

    // Optimistic: update local ghlOpps
    const op = (ghlOpps||[]).find(o => o.id === oppId);
    if (op) op.pipelineStageName = targetStageName;

    // Log to handover
    saveHandover(`Stage moved: Case ${oppId} → "${targetStageName}"`);

    // Visual feedback
    const stage = PIPELINE_STAGES.find(s => s.name === targetStageName);
    if (stage) {
      selectEl.style.borderColor = stage.color+'50';
      selectEl.style.background  = stage.bg;
      selectEl.style.color       = stage.color;
    }
  } catch(e) {
    console.error('[handleStageMove]', e.message);
    // Revert
    selectEl.value = original;
    alert('Could not move case. Please try again.');
  } finally {
    selectEl.disabled = false;
    selectEl.style.opacity = '1';
  }
}

// ════════════════════════════════════════════════════════════
// VIEW TOGGLE
// ════════════════════════════════════════════════════════════
function setCaseView(v) {
  window._caseView = v;
  render();
}

// ════════════════════════════════════════════════════════════
// ADD TO CASE DETAIL PANEL — pipeline stage section
// Inside openCaseDetail(), add this HTML block in the Staff Actions panel
// before the "Case Status" select:
// ════════════════════════════════════════════════════════════
function renderCaseDetailStageSelector(op) {
  const stageOptions = PIPELINE_STAGES.map(s =>
    `<option value="${esc(s.name)}" ${stageNameToId(op.pipelineStageName||'')=== s.id?'selected':''}>${s.name}</option>`
  ).join('');

  return `
    <div style="margin-bottom:14px">
      <label style="display:block;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Pipeline Stage</label>
      <select id="detailStage" onchange="handleStageMove('${op.id}',this.value,this)"
        style="width:100%;padding:9px 12px;border:1.5px solid ${getStageObj(op.pipelineStageName||'').color}40;border-radius:10px;background:${getStageObj(op.pipelineStageName||'').bg};color:${getStageObj(op.pipelineStageName||'').color};font-size:13px;font-weight:600;cursor:pointer;outline:none;font-family:inherit">
        ${stageOptions}
      </select>
      <p style="font-size:10px;color:#94a3b8;margin-top:4px">Changes sync to GoHighLevel immediately</p>
    </div>`;
}
