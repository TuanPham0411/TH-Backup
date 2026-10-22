// app.js — clean, no refresh button, login = modal overlay

// ---- Elements
const select = document.getElementById('lineSelect');
const searchBox = document.getElementById('searchBox');
const container = document.getElementById('buttonContainer');
const pcLabel = document.getElementById('pcLabel');
const pcStatus = document.getElementById('pcStatus');
const userBadge = document.getElementById('userBadge');

const manualRow = document.getElementById('manualRow');
const pcInput = document.getElementById('pcInput');
const pcSaveBtn = document.getElementById('pcSave');
const pcClearBtn = document.getElementById('pcClear');

const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsClose = document.getElementById('settingsClose');
const settingsApply = document.getElementById('settingsApply');
const settingsSave = document.getElementById('settingsSave');
const settingsReset = document.getElementById('settingsReset');

const tabs = Array.from(document.querySelectorAll('.tab-btn'));
const panes = Array.from(document.querySelectorAll('.tab-pane'));
const adminTabBtn = document.querySelector('.tab-btn.admin-only');

// Settings inputs
const inpFontBase = document.getElementById('inpFontBase');
const inpFamily   = document.getElementById('inpFamily');
const inpCols     = document.getElementById('inpCols');
const inpGap      = document.getElementById('inpGap');
const inpBtnMin   = document.getElementById('inpBtnMin');
const inpBtnMax   = document.getElementById('inpBtnMax');
const inpRadius   = document.getElementById('inpRadius');
const inpTarget   = document.getElementById('inpTarget');

const inpTitleSize  = document.getElementById('inpTitleSize');
const inpTitleLines = document.getElementById('inpTitleLines');
const inpSubSize    = document.getElementById('inpSubSize');
const inpSubLines   = document.getElementById('inpSubLines');
const inpTextAlign  = document.getElementById('inpTextAlign');
const inpShowSub    = document.getElementById('inpShowSub');

const inpShowBadge   = document.getElementById('inpShowBadge');
const inpBadgeScale  = document.getElementById('inpBadgeScale');
const inpBadgeOpacity= document.getElementById('inpBadgeOpacity');
const inpBadgeOffset = document.getElementById('inpBadgeOffset');
const inpBadgeUrl    = document.getElementById('inpBadgeUrl');

const inpHdrA = document.getElementById('inpHdrA');
const inpHdrB = document.getElementById('inpHdrB');
const inpTheme= document.getElementById('inpTheme');

const colIdsA = [ 'col1A','col2A','col3A','col4A','col5A' ];
const colIdsB = [ 'col1B','col2B','col3B','col4B','col5B' ];

// Profile tab
const inpUsername = document.getElementById('inpUsername');
const inpPassword = document.getElementById('inpPassword');
const btnLogin    = document.getElementById('btnLogin');
const btnLogout   = document.getElementById('btnLogout');
const inpCurPass  = document.getElementById('inpCurPass');
const inpNewPass  = document.getElementById('inpNewPass');
const btnChangePass = document.getElementById('btnChangePass');

// Admin tab
const admNewUser = document.getElementById('admNewUser');
const admNewPass = document.getElementById('admNewPass');
const btnAdmCreateUser = document.getElementById('btnAdmCreateUser');
const admResetUser = document.getElementById('admResetUser');
const admResetPass = document.getElementById('admResetPass');
const btnAdmResetPass = document.getElementById('btnAdmResetPass');

// Login modal
const loginModal = document.getElementById('loginModal');
const mUser = document.getElementById('mUser');
const mPass = document.getElementById('mPass');
const mCancel = document.getElementById('mCancel');
const mOk = document.getElementById('mOk');

// ---- Centralized MES config
const MES_CONFIG = window.MES_CONFIG || { lines: [], environments: {}, urls: {} };

function getLineConfig(lineId){
  return (MES_CONFIG.lines || []).find(line => line.id === lineId) || null;
}

function populateLineSelect(){
  const previous = select.value;
  select.innerHTML = '';

  (MES_CONFIG.lines || []).forEach(line => {
    const opt = document.createElement('option');
    opt.value = line.id;
    opt.textContent = line.name || line.id;
    select.appendChild(opt);
  });

  const preferred = previous || localStorage.getItem('mesQuickAccessLine') || MES_CONFIG.defaultLine;
  if (preferred && getLineConfig(preferred)) select.value = preferred;
  else if (MES_CONFIG.lines?.length) select.value = MES_CONFIG.lines[0].id;
}

// ---- App state
let openTarget = '_blank';
let badgeUrlOverride = '';
let currentUser = { username: 'Guest', role: 'Guest', authMode: 'none' };

// ---- Client logging
function clientLog(event, details = {}){
  const payload = {
    event,
    details,
    page: window.location.pathname
  };

  fetch('/quick-access/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  }).catch(() => {});
}

// ---- Utils
function setStatus(msg){ pcStatus.textContent = msg || ''; }
function setPcLabel(name){ pcLabel.textContent = name ? name : '(not set)'; }
function activateTab(name){
  tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  panes.forEach(p=>p.style.display = (p.dataset.pane===name)? '' : 'none');
}
function sizeBadgeToButton(btn, badge){
  const h = btn.getBoundingClientRect().height;
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--badge-scale')) || 0.5;
  const art = btn.querySelector('.station-art');
  const size = art ? Math.max(24, Math.round(art.clientWidth * .78)) : Math.max(24, Math.round(h * scale));
  badge.style.width = size + 'px';
  badge.style.height = size + 'px';
}
function resizeAllBadges(){
  document.querySelectorAll('#buttonContainer button').forEach(btn => {
    const badge = btn.querySelector('.btn-badge');
    if (badge && badge.style.display !== 'none') sizeBadgeToButton(btn, badge);
  });
}
function applyShowBadge(){
  const show = document.getElementById('inpShowBadge').checked;
  document.querySelectorAll('.btn-badge').forEach(img => { img.style.display = show ? '' : 'none'; });
  document.querySelectorAll('.station-art').forEach(art => { art.hidden = !show; });
}
function applyShowSub(){
  const show = document.getElementById('inpShowSub').checked;
  document.querySelectorAll('.btn-sub').forEach(el => { el.style.display = show ? '' : 'none'; });
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function applyThemePreset(val){
  const root = document.documentElement;
  if (val === 'light'){
    root.style.setProperty('--bg', '#f3f5f7'); root.style.setProperty('--card', '#ffffff');
    root.style.setProperty('--ink', '#1f2a37'); root.style.setProperty('--ink-dim', '#4b5563');
    root.style.setProperty('--accent-a', '#34495e'); root.style.setProperty('--accent-b', '#2c3e50');
  } else if (val === 'dark'){
    root.style.setProperty('--bg', '#111827'); root.style.setProperty('--card', '#1f2937');
    root.style.setProperty('--ink', '#e5e7eb'); root.style.setProperty('--ink-dim', '#cbd5e1');
    root.style.setProperty('--accent-a', '#0f172a'); root.style.setProperty('--accent-b', '#334155');
  } else if (val === 'high'){
    root.style.setProperty('--bg', '#ffffff'); root.style.setProperty('--card', '#ffffff');
    root.style.setProperty('--ink', '#000000'); root.style.setProperty('--ink-dim', '#111111');
    root.style.setProperty('--accent-a', '#000000'); root.style.setProperty('--accent-b', '#333333');
  }
}

// Badge loader
function buildBadgeWithFallback(btn){
  const badge = document.createElement('img');
  badge.className = 'btn-badge';
  const override = (badgeUrlOverride || '').trim();
  const isFile = location.protocol === 'file:';
  const fileCandidates = [
    'file://///pfvn-netapp1/files/70-IT/_Public/TP/ATL/Quick-Access/manufacture.png',
    './manufacture.png','manufacture.png','../public/manufacture.png'
  ];
  const httpCandidates = ['/assets/manufacture.png','/manufacture.png','./manufacture.png'];
  let candidates = []; if (override) candidates.push(override);
  candidates = candidates.concat(isFile ? fileCandidates : httpCandidates);
  let idx = 0;
  const tryNext = () => { if (idx >= candidates.length){ badge.style.display='none'; return; } badge.src = candidates[idx++]; };
  badge.addEventListener('error', tryNext);
  badge.addEventListener('load', ()=> sizeBadgeToButton(btn, badge));
  tryNext();
  return badge;
}

// Settings apply/save/load
function collectSettingsFromForm(){
  return {
    fontBase: parseInt(inpFontBase.value||16,10),
    family: inpFamily.value,
    cols: parseInt(inpCols.value||5,10),
    gap: parseInt(inpGap.value||18,10),
    btnMin: parseInt(inpBtnMin.value||92,10),
    btnMax: parseInt(inpBtnMax.value||140,10),
    radius: parseInt(inpRadius.value||12,10),
    target: inpTarget.value,
    titleSize: parseFloat(inpTitleSize.value||1.0),
    titleLines: parseInt(inpTitleLines.value||2,10),
    subSize: parseFloat(inpSubSize.value||0.9),
    subLines: parseInt(inpSubLines.value||1,10),
    textAlign: inpTextAlign.value,
    showSub: !!inpShowSub.checked,
    showBadge: !!inpShowBadge.checked,
    badgeScale: parseFloat(inpBadgeScale.value||0.5),
    badgeOpacity: parseFloat(inpBadgeOpacity.value||1),
    badgeOffset: parseInt(inpBadgeOffset.value||8,10),
    badgeUrl: (inpBadgeUrl.value || '').trim(),
    hdrA: inpHdrA.value || '#34495e',
    hdrB: inpHdrB.value || '#2c3e50',
    theme: inpTheme.value || 'custom',
    colA: colIdsA.map(id => document.getElementById(id).value),
    colB: colIdsB.map(id => document.getElementById(id).value)
  };
}
function applySettingsToCSS(s){
  const root = document.documentElement;
  root.dataset.theme = s.theme || 'custom';
  applyThemePreset(s.theme === 'custom' ? 'light' : s.theme);
  root.style.setProperty('--accent-a', s.hdrA || '#34495e');
  root.style.setProperty('--accent-b', s.hdrB || '#2c3e50');
  const setVar = (k, v) => root.style.setProperty(k, v);
  root.style.fontSize = `${clamp(parseInt(s.fontBase||16,10), 12, 22)}px`;
  setVar('--family', s.family || getComputedStyle(root).getPropertyValue('--family'));
  setVar('--cols', clamp(parseInt(s.cols||5,10), 1, 8));
  setVar('--gap', clamp(parseInt(s.gap||18,10), 8, 32) + 'px');
  const minHeight = clamp(parseInt(s.btnMin||156,10), 156, 240);
  setVar('--btn-min-h', minHeight + 'px');
  setVar('--btn-max-h', Math.max(minHeight, clamp(parseInt(s.btnMax||200,10),156,300)) + 'px');
  setVar('--radius', clamp(parseInt(s.radius||12,10), 6, 24) + 'px');
  openTarget = (s.target === '_self') ? '_self' : '_blank';
  if (s.theme && s.theme !== 'custom') applyThemePreset(s.theme);
  setVar('--btn-title-size', clamp(parseFloat(s.titleSize||1.0), .8, 1.6) + 'rem');
  setVar('--btn-sub-size', clamp(parseFloat(s.subSize||0.9), .7, 1.2) + 'rem');
  setVar('--title-lines', clamp(parseInt(s.titleLines||2,10), 1, 3));
  setVar('--sub-lines', clamp(parseInt(s.subLines||1,10), 0, 2));
  setVar('--btn-text-align', s.textAlign || 'left');
  setVar('--badge-scale', clamp(parseFloat(s.badgeScale||0.5), .30, .80));
  setVar('--badge-opacity', clamp(parseFloat(s.badgeOpacity ?? 1), 0, 1));
  setVar('--badge-offset', clamp(parseInt(s.badgeOffset||8,10), 0, 24) + 'px');
  const nextBadgeUrl = (s.badgeUrl || '').trim();
  if (nextBadgeUrl !== badgeUrlOverride){
    badgeUrlOverride = nextBadgeUrl;
    document.querySelectorAll('#buttonContainer button').forEach(btn => {
      const previous = btn.querySelector('.btn-badge');
      if (previous) { const next = buildBadgeWithFallback(btn); next.alt=''; previous.replaceWith(next); }
    });
  }
  const colsA = ['--col1-a','--col2-a','--col3-a','--col4-a','--col5-a'];
  const colsB = ['--col1-b','--col2-b','--col3-b','--col4-b','--col5-b'];
  colIdsA.forEach((id,i)=> setVar(colsA[i], document.getElementById(id).value = (s.colA?.[i] || document.getElementById(id).value)));
  colIdsB.forEach((id,i)=> setVar(colsB[i], document.getElementById(id).value = (s.colB?.[i] || document.getElementById(id).value)));
  inpShowSub.checked = s.showSub !== false; applyShowSub();
  inpShowBadge.checked = s.showBadge !== false; applyShowBadge();
  resizeAllBadges();
}
function loadSettingsIntoForm(s){
  inpFontBase.value = s.fontBase ?? 16;
  inpFamily.value   = s.family ?? inpFamily.value;
  inpCols.value     = s.cols ?? 5;
  inpGap.value      = s.gap ?? 18;
  inpBtnMin.value   = Math.max(156, s.btnMin ?? 156);
  inpBtnMax.value   = Math.max(Number(inpBtnMin.value), s.btnMax ?? 200);
  inpRadius.value   = s.radius ?? 12;
  inpTarget.value   = s.target ?? '_blank';
  inpTitleSize.value  = s.titleSize ?? 1.0;
  inpTitleLines.value = s.titleLines ?? 2;
  inpSubSize.value    = s.subSize ?? 0.9;
  inpSubLines.value   = s.subLines ?? 1;
  inpTextAlign.value  = s.textAlign ?? 'left';
  inpShowSub.checked  = s.showSub ?? true;
  inpShowBadge.checked= s.showBadge ?? true;
  inpBadgeScale.value = s.badgeScale ?? 0.5;
  inpBadgeOpacity.value = s.badgeOpacity ?? 1;
  inpBadgeOffset.value  = s.badgeOffset ?? 8;
  inpBadgeUrl.value     = s.badgeUrl ?? '';
  inpHdrA.value = s.hdrA ?? '#34495e';
  inpHdrB.value = s.hdrB ?? '#2c3e50';
  inpTheme.value= s.theme ?? 'custom';
  if (Array.isArray(s.colA) && s.colA.length===5) s.colA.forEach((v,i)=> document.getElementById(colIdsA[i]).value = v);
  if (Array.isArray(s.colB) && s.colB.length===5) s.colB.forEach((v,i)=> document.getElementById(colIdsB[i]).value = v);
}

// Backend calls
async function api(url, method='GET', body){
  const res = await fetch(url, {
    method, headers:{ 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials:'same-origin'
  });
  if(res.status===401){location.replace('/?returnTo=%2Fquick-access');throw new Error('MES session expired.');}
  if (!res.ok){
    let msg = 'Error';
    try{ const j = await res.json(); msg = j.error || msg; }catch{}
    throw new Error(msg);
  }
  return res.json();
}
async function refreshMe(){
  const me = await api('/quick-access/api/me');
  currentUser = me;
  document.getElementById('manageContentBtn').hidden = !me.isOwner || !!me.mustChangePassword;
  userBadge.textContent = me.username && me.username !== 'Guest' ? `${me.username} · ${me.role}` : 'MES session unavailable';
  userBadge.title = [me.username || 'Guest', me.authMode || 'none', me.windowsIdentity || ''].filter(Boolean).join(' | ');
  adminTabBtn.style.display = 'none';
  document.getElementById('windowsAccountName').textContent = me.username || 'Guest';
  document.getElementById('windowsAccountMode').textContent = 'Signed in with your MES account';
}

let firstLoginTempPassword = '';

async function login(){location.href='/?returnTo=%2Fquick-access';}
async function confirmFirstPasswordChange(){location.href='/#profile';}
async function logout(){
  const j = await api('/quick-access/api/logout','POST');
  location.replace('/?returnTo=%2Fquick-access');
}
async function changeMyPassword(currentPassword, newPassword){
  location.href='/#profile'; return {ok:true};
}
async function adminCreateUser(username, password){
  return api('/quick-access/api/admin/users','POST',{ username, password });
}
async function adminResetPassword(username, newPassword){
  return api(`/quick-access/api/admin/users/${encodeURIComponent(username)}/password`, 'PATCH', { newPassword });
}
async function loadUserSettings(username){
  return api(`/quick-access/api/settings/${encodeURIComponent(username)}`, 'GET');
}
async function saveUserSettings(username, settingsObj){
  return api(`/quick-access/api/settings/${encodeURIComponent(username)}`, 'PUT', settingsObj);
}

// Settings UI wiring
function openSettings(){ settingsPanel.style.display='block'; settingsBtn.setAttribute('aria-expanded','true'); settingsClose.focus(); }
function closeSettings(){ settingsPanel.style.display='none'; settingsBtn.setAttribute('aria-expanded','false'); }
settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') closeSettings(); });

document.getElementById('settingsTabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tab-btn'); if (!btn) return; activateTab(btn.dataset.tab);
});
settingsApply.addEventListener('click', ()=> { applySettingsToCSS(collectSettingsFromForm()); clientLog('settings_apply', { targetUser: currentUser.username || 'Guest' }); });
settingsSave.addEventListener('click', async ()=>{
  if (!currentUser.username || currentUser.username==='Guest'){ alert('Please log in first (Profile tab).'); return; }
  try {
  const settings = collectSettingsFromForm();
  await saveUserSettings(currentUser.username, settings);
  applySettingsToCSS(settings);
  clientLog('settings_save', { targetUser: currentUser.username });
  alert('Saved.');
  } catch(error) { alert(error.message || 'Unable to save settings.'); }
});
settingsReset.addEventListener('click', ()=> { clientLog('settings_reset_reload', { targetUser: currentUser.username || 'Guest' }); location.reload(); });

// Login modal overlay
function showLoginModal(){ location.href='/?returnTo=%2Fquick-access'; }
function hideLoginModal(){ loginModal.classList.remove('show'); loginModal.setAttribute('aria-hidden','true'); userBadge.focus(); }
userBadge.addEventListener('click', () => { openSettings(); activateTab('profile'); });
mCancel.addEventListener('click', hideLoginModal);
loginModal.addEventListener('click', (e)=>{ if (e.target === loginModal) hideLoginModal(); });
document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && loginModal.classList.contains('show')) hideLoginModal(); });

function showForceChangePassword(username) {
    const loginSection = document.getElementById('loginSection');
    const forceChangeSection = document.getElementById('forceChangeSection');
    const settingsTabs = document.getElementById('settingsTabs');
    const currentUserLabel = document.getElementById('forceChangeUsername');

    if (loginSection) loginSection.style.display = 'none';
    if (settingsTabs) settingsTabs.style.display = 'none';
    if (forceChangeSection) forceChangeSection.style.display = 'block';
    if (currentUserLabel) currentUserLabel.textContent = username || '';

    const newPwd = document.getElementById('forceNewPassword');
    const confirmPwd = document.getElementById('forceConfirmPassword');
    if (newPwd) newPwd.value = '';
    if (confirmPwd) confirmPwd.value = '';
}

mOk.addEventListener('click', async () => {
  const u=(mUser.value||'').trim(), p=(mPass.value||'').trim();
  if (!u){ alert('Username is required.'); return; }
  try{ await login(u,p); hideLoginModal(); }catch(e){ clientLog('login_failed', { username: u, source: 'modal', message: e.message || 'login error' }); alert(e.message); }
});
btnLogin.addEventListener('click', async () => {
  const u=(inpUsername.value||'').trim(), p=(inpPassword.value||'').trim();
  if (!u){ alert('Username is required.'); return; }
  try{ await login(u,p); alert('Logged in.'); }catch(e){ clientLog('login_failed', { username: u, source: 'profile', message: e.message || 'login error' }); alert(e.message); }
});
btnLogout.addEventListener('click', async ()=>{ try{ await logout(); alert(currentUser.authMode==='windows-admin' ? 'Windows admin remains signed in.' : 'Logged out.'); }catch(e){ alert(e.message); }});
btnChangePass.addEventListener('click', async ()=>{
  if (currentUser.username==='Guest'){ alert('Please log in first.'); return; }
  const cur=(inpCurPass.value||'').trim(), nw=(inpNewPass.value||'').trim();
  if (!cur || !nw){ alert('Current and new passwords are required.'); return; }
  try{ await changeMyPassword(cur,nw); clientLog('change_password', { username: currentUser.username }); alert('Password updated.'); inpCurPass.value=''; inpNewPass.value=''; }catch(e){ alert(e.message); }
});
btnAdmCreateUser.addEventListener('click', async ()=>{
  const u=(admNewUser.value||'').trim(), p=(admNewPass.value||'').trim();
  if (!u || !p){ alert('Username and initial password required.'); return; }
  try{ await adminCreateUser(u,p); clientLog('admin_create_user', { target: u }); alert('User created.'); admNewUser.value=''; admNewPass.value=''; }catch(e){ alert(e.message); }
});
btnAdmResetPass.addEventListener('click', async ()=>{
  const u=(admResetUser.value||'').trim(), p=(admResetPass.value||'').trim();
  if (!u || !p){ alert('Target username and new password required.'); return; }
  try{ await adminResetPassword(u,p); clientLog('admin_reset_password', { target: u }); alert('Password reset.'); admResetUser.value=''; admResetPass.value=''; }catch(e){ alert(e.message); }
});

// PC per-user (UI only)
pcSaveBtn.addEventListener('click', ()=>{ const name=pcInput.value.trim(); setPcLabel(name); setStatus('Saved'); });
pcInput.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ const name=pcInput.value.trim(); setPcLabel(name); setStatus('Saved'); }});
pcClearBtn.addEventListener('click', ()=>{ pcInput.value=''; setPcLabel(''); setStatus('Cleared'); });

// Mode switch
document.querySelectorAll('input[name="pcMode"]').forEach(r=> r.addEventListener('change', e=>{
  manualRow.style.display = (e.target.value==='manual') ? 'flex' : 'none';
  setStatus(''); if (e.target.value==='manual') pcInput.focus();
}));

// Theme live
inpTheme?.addEventListener('change', ()=> applySettingsToCSS(collectSettingsFromForm()));

// ENV toggle (no refresh)
let envMode = document.getElementById('envToggle')?.dataset.env || 'LIVE';
const envToggle = document.getElementById('envToggle');
envToggle?.addEventListener('click', ()=>{
  envMode = (envMode==='TEST') ? 'LIVE' : 'TEST';
  envToggle.textContent = envMode;
  envToggle.dataset.env = envMode;
  loadButtons();
});

// PC assignments are stored directly in config.js on each station object.

// LIVE panel
function attachLivePanel(btn, station){
  const listRaw = Array.isArray(station?.pcs) ? station.pcs : [];
  const pcs = listRaw.map(s => String(s||'').split(',')[0].trim()).filter(Boolean);

  // wrapper
  const wrap = document.createElement('div');
  wrap.className = 'btn-livebar';

  // ===== Panel left
  const panelLeft = document.createElement('div');
  panelLeft.className = 'btn-livepanel';

  const headerL = document.createElement('div');
  headerL.className = 'btn-live-row';

  const ulL = document.createElement('ul');
  ulL.className = 'pc-list';
  if (pcs.length === 0){
    const li = document.createElement('li'); li.className='pc-empty'; li.textContent='(no PC assigned)';
    ulL.appendChild(li);
  } else {
    pcs.forEach(pc => {
      const li = document.createElement('li'); li.className='pc-item'; li.textContent = pc;
      ulL.appendChild(li);
    });
  }
  panelLeft.append(headerL, ulL);

  // ===== Panel right
  const panelRight = document.createElement('div');
  panelRight.className = 'btn-livepanel btn-livepanel-right no-scroll';

  const count = pcs.length;
  const center = document.createElement('div');
  center.className = 'pc-count-center';
  center.textContent = `${count} PC${count === 1 ? '' : 's'}`;
  center.title = 'Configured PC assignments; this is not a live connectivity check.';

  panelRight.appendChild(center);

  // button
  wrap.append(panelLeft, panelRight);
  btn.appendChild(wrap);

  ['click','mousedown','pointerdown','dblclick','keydown'].forEach(evt=>{
    wrap.addEventListener(evt, e=> e.stopPropagation());
  });
}

// Build buttons (TEST/LIVE domain + LIVE panel)
function buildButtons(stations){
  container.innerHTML = '';
  const query = (searchBox.value || '').toLowerCase().trim();
  const domain = MES_CONFIG.environments?.[envMode];

  if (!domain){
    console.error(`MES domain is not configured for environment: ${envMode}`);
    return;
  }

  (stations || []).forEach((station, i)=>{
    const name = String(station.operation || '').trim();
    const wc = String(station.workCenter || '').trim();
    const displayWC = String(station.displayWorkCenter || wc).trim();

    if (query && !`${name} ${wc} ${displayWC} ${(station.pcs || []).join(' ')}`.toLowerCase().includes(query)) return;

    const subtitleHtml = (envMode === 'LIVE')
      ? `<div class="btn-sub-title"> </div>`
      : '';

    const btn = document.createElement('button');
    btn.className = 'col-' + ((i % 5) + 1);
    btn.style.setProperty('--order', Math.min(i, 12));
    btn.innerHTML = `
      <div class="btn-text">
        <div class="btn-title">${escapeHtml(name)}</div>
        <div class="btn-sub">${escapeHtml(displayWC)}</div>
        ${subtitleHtml}
      </div>
      <span class="station-number">${String(i+1).padStart(2,'0')}</span>
      <span class="station-open" aria-hidden="true">↗</span>
    `;

    let url;
    if (station.url){
      // Optional explicit URL for exceptional stations.
      url = String(station.url)
        .replaceAll('{domain}', domain)
        .replaceAll('{env}', envMode);
    } else if (station.type === 'management' || wc === 'MANAGEMENT'){
      url = `https://${domain}${MES_CONFIG.urls.managementPath}`;
    } else {
      url = `https://${domain}${MES_CONFIG.urls.taskPath}${encodeURIComponent(wc)}`;
    }

    btn.setAttribute('data-url', url);
    btn.dataset.operation = name;
    btn.dataset.workCenter = wc;

    btn.addEventListener('click', (e)=>{
      if (e.target.closest('.btn-livepanel')) return;
      openMES(btn);
    });

    const art = document.createElement('span');
    art.className = 'station-art';
    const badge = buildBadgeWithFallback(btn);
    badge.alt = '';
    art.appendChild(badge);
    btn.appendChild(art);
    btn.title = `${name} · ${displayWC} · ${envMode}`;
    btn.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--pointer-x', `${event.clientX-rect.left}px`);
      btn.style.setProperty('--pointer-y', `${event.clientY-rect.top}px`);
    });
    if (envMode === 'LIVE') attachLivePanel(btn, station);

    container.appendChild(btn);
  });
  const count = container.children.length;
  document.getElementById('stationSummary').textContent = `${count} / ${(stations || []).length} stations · ${envMode}`;
  document.getElementById('workspaceLine').textContent = getLineConfig(select.value)?.name || 'MES';
  document.getElementById('workspaceEnvironment').textContent = `${envMode} workspace`;
  document.getElementById('environmentHint').textContent = envMode === 'TEST' ? 'Test environment' : 'Production environment';
  document.body.dataset.environment = envMode;
  if (!count){
    const empty = document.createElement('div');
    empty.className = 'station-empty';
    empty.textContent = query ? 'No matching station. Try another station, work center or PC.' : 'No stations configured for this line.';
    container.appendChild(empty);
  }
  applyShowSub();
  applyShowBadge();
  requestAnimationFrame(resizeAllBadges);
}

function loadButtons(){
  const line = getLineConfig(select.value);
  buildButtons(line?.stations || []);
}

// Init
(async function init(){
  try{
    await refreshMe();
    if (currentUser.username && currentUser.username!=='Guest') {
      clientLog('page_init', { username: currentUser.username, role: currentUser.role, authMode: currentUser.authMode || '' });
    }
    if (currentUser.username && currentUser.username!=='Guest'){
      const s = await loadUserSettings(currentUser.username);
      loadSettingsIntoForm(s); applySettingsToCSS(s);
      adminTabBtn.style.display='none';
    }else{
      adminTabBtn.style.display='none';
    }
  }catch(e){ console.warn('init error:', e.message); }

  populateLineSelect();
  loadButtons();
  select.addEventListener('change', () => {
    localStorage.setItem('mesQuickAccessLine', select.value);
    layoutLineSelect.value = select.value;
    loadLayout();
    loadButtons();
  });
  layoutLineSelect.value = select.value;
  loadLayout();
  searchBox.addEventListener('input', loadButtons);
  activateTab('general');
  window.addEventListener('resize', resizeAllBadges);
})();

// Open MES
function openMES(btn){
  let url = btn.getAttribute('data-url');
  const mode = document.querySelector('input[name="pcMode"]:checked')?.value || 'none';
  const pc = pcLabel.textContent || '';
  if (mode === 'manual' && (!pc || pc === '(not set)')){
    setStatus('Enter and save a PC before opening MES.');
    pcInput.focus();
    return;
  }
  if (mode==='manual' && pc && pc!=='(not set)'){
    url = url.replace(/WorkCenter=[^&]+/, `Group=${encodeURIComponent(pc)}%26WorkStation=${encodeURIComponent(pc)}`);
  }
  clientLog('open_mes', { station: btn.querySelector('.btn-title')?.textContent || '', target: openTarget, url });
  window.open(url, openTarget);
}

// Visual ripple on button press (no layout change)
container.addEventListener('mousedown', (e)=>{
  const btn = e.target.closest('button'); 
  if (!btn || e.button !== 0) return;           // left mouse only
  if (e.target.closest('.btn-livepanel')) return; // ignore live panel area

  const rect = btn.getBoundingClientRect();
  const span = document.createElement('span');
  span.className = 'button-ripple';
  span.style.left = (e.clientX - rect.left) + 'px';
  span.style.top  = (e.clientY - rect.top) + 'px';
  btn.appendChild(span);
  span.addEventListener('animationend', ()=> span.remove());
});

// ======================= Main navigation =======================
const mainTabs = Array.from(document.querySelectorAll('.main-tab'));
const appPages = Array.from(document.querySelectorAll('.app-page'));

function activateMainPage(pageName){
  mainTabs.forEach(tab => {
    const active = tab.dataset.page === pageName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  appPages.forEach(page => {
    const active = page.dataset.pagePanel === pageName;
    page.classList.toggle('active', active);
    page.setAttribute('aria-hidden', String(!active));
  });
  localStorage.setItem('mesQuickAccessPage', pageName);
  if (pageName === 'layout') requestAnimationFrame(fitLayout);
  if (pageName === 'atl') requestAnimationFrame(resizeAllBadges);
}

mainTabs.forEach(tab => tab.addEventListener('click', () => activateMainPage(tab.dataset.page)));

// ======================= Layout viewer =======================
const layoutLineSelect = document.getElementById('layoutLineSelect');
const layoutViewer = document.getElementById('layoutViewer');
const layoutStage = document.getElementById('layoutStage');
const layoutImage = document.getElementById('layoutImage');
const layoutEmpty = document.getElementById('layoutEmpty');
const zoomValue = document.getElementById('zoomValue');
let layoutScale = 1;
let layoutX = 0;
let layoutY = 0;
let layoutDragging = false;
let layoutPointerX = 0;
let layoutPointerY = 0;

function updateLayoutTransform(){
  layoutStage.style.transform = `translate(${layoutX}px, ${layoutY}px) scale(${layoutScale})`;
  zoomValue.textContent = `${Math.round(layoutScale * 100)}%`;
}

function fitLayout(){
  if (!layoutImage.naturalWidth || !layoutViewer.clientWidth) return;
  const padding = 48;
  const availableW = Math.max(100, layoutViewer.clientWidth - padding);
  const availableH = Math.max(100, layoutViewer.clientHeight - padding);
  layoutScale = clamp(Math.min(availableW / layoutImage.naturalWidth, availableH / layoutImage.naturalHeight), .1, 5);
  layoutX = 0;
  layoutY = 0;
  updateLayoutTransform();
}

function setLayoutZoom(nextScale, anchorX, anchorY){
  const next = clamp(nextScale, .1, 5);
  if (anchorX == null || anchorY == null){
    layoutScale = next;
  } else {
    const rect = layoutViewer.getBoundingClientRect();
    const px = anchorX - rect.left - rect.width / 2;
    const py = anchorY - rect.top - rect.height / 2;
    const ratio = next / layoutScale;
    layoutX = px - (px - layoutX) * ratio;
    layoutY = py - (py - layoutY) * ratio;
    layoutScale = next;
  }
  updateLayoutTransform();
}

function loadLayout(){
  const item = MES_CONFIG.layouts?.[layoutLineSelect.value];
  document.querySelectorAll('.toolbar-actions button').forEach(button => button.disabled = !item);
  layoutStage.hidden = !item;
  layoutEmpty.hidden = !!item;
  if (!item) return;
  layoutImage.alt = `${item.name || layoutLineSelect.value} production line layout`;
  layoutImage.src = item.image;
  localStorage.setItem('mesQuickAccessLayoutLine', layoutLineSelect.value);
}

function initLayoutViewer(){
  const layouts = MES_CONFIG.layouts || {};
  (MES_CONFIG.lines || []).forEach(line => {
    const option = document.createElement('option');
    option.value = line.id;
    option.textContent = layouts[line.id]?.name || line.name || line.id;
    layoutLineSelect.appendChild(option);
  });
  const savedLine = localStorage.getItem('mesQuickAccessLayoutLine');
  layoutLineSelect.value = layouts[savedLine] ? savedLine : (MES_CONFIG.defaultLine || layoutLineSelect.options[0]?.value);
  layoutLineSelect.addEventListener('change', () => {
    select.value = layoutLineSelect.value;
    localStorage.setItem('mesQuickAccessLine', select.value);
    loadButtons();
    loadLayout();
  });
  layoutImage.addEventListener('load', fitLayout);
  layoutImage.addEventListener('error', () => { layoutStage.hidden = true; layoutEmpty.hidden = false; });
  document.getElementById('zoomInBtn').addEventListener('click', () => setLayoutZoom(layoutScale * 1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setLayoutZoom(layoutScale / 1.2));
  document.getElementById('zoomFitBtn').addEventListener('click', fitLayout);
  document.getElementById('zoomResetBtn').addEventListener('click', () => { layoutScale=1; layoutX=0; layoutY=0; updateLayoutTransform(); });
  layoutViewer.addEventListener('wheel', e => { e.preventDefault(); setLayoutZoom(layoutScale * (e.deltaY < 0 ? 1.12 : .89), e.clientX, e.clientY); }, { passive:false });
  layoutViewer.addEventListener('pointerdown', e => { layoutDragging=true; layoutPointerX=e.clientX; layoutPointerY=e.clientY; layoutViewer.setPointerCapture(e.pointerId); layoutViewer.classList.add('dragging'); });
  layoutViewer.addEventListener('pointermove', e => { if (!layoutDragging) return; layoutX += e.clientX-layoutPointerX; layoutY += e.clientY-layoutPointerY; layoutPointerX=e.clientX; layoutPointerY=e.clientY; updateLayoutTransform(); });
  const stopDrag = () => { layoutDragging=false; layoutViewer.classList.remove('dragging'); };
  layoutViewer.addEventListener('pointerup', stopDrag);
  layoutViewer.addEventListener('pointercancel', stopDrag);
  layoutViewer.addEventListener('dblclick', fitLayout);
  window.addEventListener('resize', () => { if (document.getElementById('page-layout').classList.contains('active')) fitLayout(); });
  loadLayout();
}

// ======================= Guideline list =======================
const guidelineSearch = document.getElementById('guidelineSearch');
const guidelineCategories = document.getElementById('guidelineCategories');
const guidelineList = document.getElementById('guidelineList');
const guidelineListTitle = document.getElementById('guidelineListTitle');
const guidelineCount = document.getElementById('guidelineCount');
const documentViewer = document.getElementById('documentViewer');
const documentWelcome = document.getElementById('documentWelcome');
const documentPanel = document.getElementById('documentPanel');
const documentTitle = document.getElementById('documentTitle');
const documentMeta = document.getElementById('documentMeta');
const documentDownload = document.getElementById('documentDownload');
const documentClose = document.getElementById('documentClose');
const documentContent = document.getElementById('documentContent');
let activeGuidelineCategory = 'All';
let selectedGuidelinePath = '';
let selectedGuidelineItem = null;
let pdfRenderSession = 0;
let pdfJsPromise = null;
const previewScripts = new Map();

function loadPreviewScript(src){
  if (!previewScripts.has(src)){
    previewScripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        previewScripts.delete(src);
        script.remove();
        reject(new Error('Unable to load preview data. Keep the vendor/offline folder with this page.'));
      };
      document.head.appendChild(script);
    }));
  }
  return previewScripts.get(src);
}

async function offlineResourceBytes(item){
  await loadPreviewScript('./vendor/offline/manifest.js');
  const src = window.MES_OFFLINE_FILES[item.path];
  if (!src) throw new Error('Preview data is missing. Run build_previews.py after adding resources.');
  await loadPreviewScript(src);
  return Uint8Array.from(atob(window.MES_OFFLINE_DATA[item.path]), ch => ch.charCodeAt(0));
}

function resourceIcon(type){
  const value = String(type || '').toLowerCase();
  if (value === 'pdf') return 'PDF';
  if (value === 'image') return 'IMG';
  if (value.includes('power')) return 'PS1';
  if (value === 'bat') return 'BAT';
  if (value === 'application') return 'EXE';
  if (value === 'font') return 'TTF';
  if (value === 'zip') return 'ZIP';
  if (value === 'folder') return 'DIR';
  return 'FILE';
}

function isTextResource(item){
  return ['powershell','bat','text'].includes(String(item.type || '').toLowerCase()) || /\.(ps1|bat|cmd|txt)$/i.test(item.path || '');
}

function resourceFileName(item){
  const clean = String(item.path || '').split('#')[0].split('?')[0];
  return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || 'download';
}

async function downloadGuideline(item, event){
  // Chrome/Edge can let the user choose an exact destination folder.
  if (location.protocol === 'file:' || typeof window.showDirectoryPicker !== 'function') return;
  event.preventDefault();
  try{
    const directory = await window.showDirectoryPicker({ mode:'readwrite' });
    const response = await fetch(encodeURI(item.path));
    if (!response.ok) throw new Error('Unable to download this resource.');
    const fileHandle = await directory.getFileHandle(resourceFileName(item), { create:true });
    const writable = await fileHandle.createWritable();
    await writable.write(await response.blob());
    await writable.close();
    clientLog('download_guideline', { title:item.title, type:item.type, method:'folder-picker' });
  }catch(error){
    if (error?.name !== 'AbortError') alert(error.message || 'Download failed.');
  }
}

function loadPdfJs(){
  if (!pdfJsPromise){
    const library = location.protocol === 'file:'
      ? loadPreviewScript('./vendor/offline/pdf.worker.js')
          .then(() => loadPreviewScript('./vendor/offline/pdf.js'))
          .then(() => window.pdfjsLib)
      : import('./vendor/pdfjs/pdf.min.js?v=2.3.0');
    pdfJsPromise = library.then(pdfjsLib => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js?v=2.3.0', window.location.href).href;
      return pdfjsLib;
    }).catch(error => { pdfJsPromise = null; throw error; });
  }
  return pdfJsPromise;
}

async function renderPdfInsideViewer(item, host){
  const session = ++pdfRenderSession;
  host.innerHTML = '<div class="pdf-loading"><span></span>Loading PDF preview...</div>';
  try{
    const pdfjsLib = await loadPdfJs();
    const source = location.protocol === 'file:'
      ? { data:await offlineResourceBytes(item) }
      : { url:encodeURI(item.path) };
    const pdf = await pdfjsLib.getDocument(source).promise;
    if (session !== pdfRenderSession) return;
    host.innerHTML = '';

    const pages = document.createElement('div');
    pages.className = 'pdf-pages';
    host.appendChild(pages);

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        renderPdfPage(pdf, Number(entry.target.dataset.page), entry.target, session);
      });
    }, { root:host, rootMargin:'900px 0px' });

    for (let pageNumber=1; pageNumber<=pdf.numPages; pageNumber++){
      const page = await pdf.getPage(pageNumber);
      if (session !== pdfRenderSession) return;
      const viewport = page.getViewport({ scale:1 });
      const shell = document.createElement('section');
      shell.className = 'pdf-page-shell';
      shell.dataset.page = String(pageNumber);
      shell.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      shell.innerHTML = `<span class="pdf-page-number">Page ${pageNumber} / ${pdf.numPages}</span>`;
      pages.appendChild(shell);
      observer.observe(shell);
    }
  }catch(error){
    if (session !== pdfRenderSession) return;
    host.replaceChildren();
    const frame = document.createElement('iframe');
    frame.src = encodeURI(item.path);
    frame.title = item.title;
    host.appendChild(frame);
  }
}

async function renderPdfPage(pdf, pageNumber, shell, session){
  try{
    const page = await pdf.getPage(pageNumber);
    if (session !== pdfRenderSession) return;
    const base = page.getViewport({ scale:1 });
    const cssWidth = Math.max(280, Math.min(1100, shell.clientWidth || 800));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    const renderScale = (cssWidth / base.width) * pixelRatio;
    const viewport = page.getViewport({ scale:renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
    canvas.style.height = 'auto';
    shell.appendChild(canvas);
    await page.render({ canvasContext:canvas.getContext('2d'), viewport }).promise;
    if (session !== pdfRenderSession) canvas.remove();
    else shell.classList.add('rendered');
  }catch(error){
    shell.classList.add('page-error');
  }
}

function showGuideline(item){
  selectedGuidelinePath = item.path;
  selectedGuidelineItem = item;
  documentWelcome.hidden = true;
  documentPanel.hidden = false;
  documentViewer.classList.add('mobile-open');
  documentTitle.textContent = item.title;
  documentMeta.textContent = `${item.category} · ${item.type}`;
  documentDownload.href = encodeURI(item.path);
  documentContent.innerHTML = '';

  const type = String(item.type || '').toLowerCase();
  if (type === 'pdf'){
    pdfRenderSession++;
    const frame = document.createElement('iframe');
    frame.src = encodeURI(item.path);
    frame.title = item.title;
    documentContent.appendChild(frame);
  } else if (type === 'image'){
    pdfRenderSession++;
    const image = document.createElement('img');
    image.src = encodeURI(item.path);
    image.alt = item.title;
    documentContent.appendChild(image);
  } else if (isTextResource(item)){
    pdfRenderSession++;
    const pre = document.createElement('pre');
    pre.textContent = 'Loading document...';
    documentContent.appendChild(pre);
    const content = location.protocol === 'file:'
      ? offlineResourceBytes(item).then(bytes => {
          const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : 'utf-8';
          return new TextDecoder(encoding).decode(bytes);
        })
      : fetch(encodeURI(item.path))
          .then(response => { if (!response.ok) throw new Error(`Unable to load document (HTTP ${response.status})`); return response.text(); });
    content
      .then(text => { pre.textContent = text; })
      .catch(error => { pre.textContent = error.message; });
  } else {
    pdfRenderSession++;
    const info = document.createElement('div');
    info.className = 'unsupported-preview';
    info.innerHTML = `<span class="file-icon">${resourceIcon(item.type)}</span><strong>${escapeHtml(item.title)}</strong><span>This resource cannot be previewed safely in the browser. Use Download to open or install it on the workstation.</span>`;
    documentContent.appendChild(info);
  }
  document.querySelectorAll('.guideline-card').forEach(card => card.classList.toggle('selected', card.dataset.path === item.path));
  clientLog('preview_guideline', { title:item.title, category:item.category, type:item.type });
}

function renderGuidelines(){
  const query = (guidelineSearch.value || '').trim().toLowerCase();
  const items = (MES_CONFIG.guidelines || []).filter(item => {
    const inCategory = activeGuidelineCategory === 'All' || item.category === activeGuidelineCategory;
    const haystack = `${item.title} ${item.description} ${item.category} ${item.type}`.toLowerCase();
    return inCategory && (!query || haystack.includes(query));
  });
  guidelineList.innerHTML = '';
  guidelineListTitle.textContent = activeGuidelineCategory === 'All' ? 'All resources' : activeGuidelineCategory;
  guidelineCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  if (!items.length){
    guidelineList.innerHTML = '<div class="empty-guidelines">No matching guideline found.</div>';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'guideline-card';
    card.dataset.path = item.path;
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'guide-preview-btn';
    preview.innerHTML = `<span class="file-icon">${resourceIcon(item.type)}</span><span class="guide-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small><span class="guide-meta">${escapeHtml(item.type)}</span></span>`;
    preview.addEventListener('click', () => showGuideline(item));
    const download = document.createElement('a');
    download.className = 'item-download-btn';
    download.href = encodeURI(item.path);
    download.setAttribute('download', '');
    download.title = `Download ${item.title}`;
    download.setAttribute('aria-label', `Download ${item.title}`);
    download.textContent = '↓';
    download.addEventListener('click', () => clientLog('download_guideline', { title:item.title, type:item.type }));
    download.addEventListener('click', event => downloadGuideline(item, event));
    card.append(preview, download);
    guidelineList.appendChild(card);
  });
  const selected = items.find(item => item.path === selectedGuidelinePath);
  if (selected){
    document.querySelector(`.guideline-card[data-path="${CSS.escape(selected.path)}"]`)?.classList.add('selected');
  } else if (items.length){
    showGuideline(items[0]);
  }
}

function initGuidelines(){
  const allItems = MES_CONFIG.guidelines || [];
  const sections = [
    { label:'Overview', categories:['All'] },
    { label:'Instructions', categories:['Scanner','Printing'] },
    { label:'Utilities', categories:['MES Tools','Barcode'] }
  ];
  sections.forEach(section => {
    const heading = document.createElement('div');
    heading.className = 'category-section';
    heading.textContent = section.label;
    guidelineCategories.appendChild(heading);
    section.categories.forEach(category => {
      if (category !== 'All' && !allItems.some(item => item.category === category)) return;
    const button = document.createElement('button');
    button.className = 'category-btn' + (category === activeGuidelineCategory ? ' active' : '');
      button.textContent = category === 'All' ? 'All resources' : category;
      button.dataset.count = category === 'All' ? allItems.length : allItems.filter(item => item.category === category).length;
    button.addEventListener('click', () => {
      activeGuidelineCategory = category;
      document.querySelectorAll('.category-btn').forEach(btn => btn.classList.toggle('active', btn === button));
      renderGuidelines();
    });
    guidelineCategories.appendChild(button);
    });
  });
  const existingCategories = new Set(sections.flatMap(section => section.categories));
  [...new Set(allItems.map(item => item.category))].filter(category => !existingCategories.has(category)).forEach(category => {
    const button = document.createElement('button');
    button.className = 'category-btn';
    button.textContent = category;
    button.dataset.count = allItems.filter(item => item.category === category).length;
    button.addEventListener('click', () => {
      activeGuidelineCategory = category;
      document.querySelectorAll('.category-btn').forEach(btn => btn.classList.toggle('active', btn === button));
      renderGuidelines();
    });
    guidelineCategories.appendChild(button);
  });
  guidelineSearch.addEventListener('input', renderGuidelines);
  documentDownload.addEventListener('click', event => {
    if (selectedGuidelineItem) downloadGuideline(selectedGuidelineItem, event);
  });
  documentClose.addEventListener('click', () => {
    pdfRenderSession++;
    selectedGuidelinePath = '';
    selectedGuidelineItem = null;
    documentContent.replaceChildren();
    documentPanel.hidden = true;
    documentWelcome.hidden = false;
    documentViewer.classList.remove('mobile-open');
    document.querySelectorAll('.guideline-card').forEach(card => card.classList.remove('selected'));
  });
  renderGuidelines();
}

initLayoutViewer();
initGuidelines();
const savedMainPage = localStorage.getItem('mesQuickAccessPage');
activateMainPage(['atl','layout','guideline'].includes(savedMainPage) ? savedMainPage : 'atl');

document.getElementById('mesSignOut').addEventListener('click',()=>logout().catch(error=>alert(error.message)));
