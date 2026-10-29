(() => {
  'use strict';
  if (globalThis.__LHU_PANEL__) return;
  globalThis.__LHU_PANEL__ = true;

  const LHU = globalThis.LHU;
  if (!LHU || !LHU.THEME_CSS || !document.body) return;

  const I = LHU.ICONS;
  const esc = LHU.esc;
  const DAY = 86400000;
  const WINDOW_LABEL = { 7: '1 tuần', 14: '2 tuần', 30: '1 tháng', 90: '3 tháng' };

  let prefs = {
    theme: 'light', fs: 1, pinned: false, cols: 4, overdueDays: 14,
    courseSort: 'off', autoExtend: true, coursePins: []
  };
  const state = {
    open: false,
    pinned: false,
    tab: 'upcoming',
    loading: true,
    error: false,
    data: null
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      position: fixed; right: 0; top: 22%; z-index: 2147483000;
      font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: calc(13.5px * var(--lhu-fs, 1)); line-height: 1.4;
      color: var(--fg);
      display: flex; align-items: flex-start;
    }
    button, select { font-family: inherit; }
    .tab {
      position: relative; width: 2.4em; padding: .65em 0 .75em; flex: none; cursor: pointer;
      border: 1px solid var(--line2); border-right: 0;
      border-radius: .85em 0 0 .85em;
      background: var(--bg); color: var(--accent);
      box-shadow: -8px 0 24px rgba(15,44,77,.12);
      display: flex; flex-direction: column; align-items: center; gap: .4em;
      transition: background .15s;
    }
    .tab:hover { background: var(--bg2); }
    :host([data-theme="dark"]) .tab { box-shadow: -8px 0 24px rgba(0,0,0,.4); }
    .tab svg { width: 1.2em; height: 1.2em; }
    .tab .tl { font-size: .58em; font-weight: 700; letter-spacing: .14em; color: var(--fg2); writing-mode: vertical-rl; }
    .tab .badge {
      position: absolute; top: -.62em; left: 50%; transform: translateX(-50%);
      min-width: 1.35em; height: 1.35em; padding: 0 .22em;
      border-radius: 999px; background: var(--accent); color: #fff;
      font-size: .62em; font-weight: 700; display: none; align-items: center; justify-content: center;
      box-shadow: 0 0 0 2px var(--bg);
    }
    .tab .badge.on { display: flex; }
    .tab .badge.hot { background: var(--danger); }
    :host([data-theme="dark"]) .tab .badge { color: #0f1a2b; }
    :host([data-theme="dark"]) .tab .badge.hot { background: #e5484d; color: #fff; }
    .panel {
      position: absolute; right: 2.4em; top: 0;
      width: 25em; max-width: 88vw; max-height: 64vh;
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg); border: 1px solid var(--line); border-right: 0;
      border-radius: .95em 0 0 .95em;
      box-shadow: var(--shadow);
      opacity: 0; visibility: hidden; transform: translateX(.6em);
      transition: opacity .16s ease, transform .16s ease, visibility .16s;
    }
    .root.open .panel { opacity: 1; visibility: visible; transform: none; }
    .hint { position: absolute; right: 3em; top: .4em; width: 15em; padding: .6em .8em; border: 1px solid var(--line2); border-radius: .6em; background: var(--bg); color: var(--fg); box-shadow: var(--shadow-sm); font-size: .85em; opacity: 0; visibility: hidden; pointer-events: none; }
    .root.guest:hover .hint, .root.guest:focus-within .hint { opacity: 1; visibility: visible; }
    .root.guest .tab { cursor: default; }
    header { display: flex; align-items: center; gap: .45em; padding: .6em .6em .55em .75em; border-bottom: 1px solid var(--line); }
    .brand { width: 1.8em; height: 1.8em; border-radius: .5em; background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; flex: none; }
    .brand svg { width: 1.1em; height: 1.1em; }
    .tt { font-size: .95em; font-weight: 700; letter-spacing: .01em; color: var(--brand); }
    .grow { flex: 1; }
    .ico {
      width: 1.8em; height: 1.8em; border: 0; background: transparent; border-radius: .5em;
      color: var(--fg2); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
    }
    .ico:hover { background: var(--bg2); color: var(--fg); }
    .ico.on { background: var(--accent-bg); color: var(--accent); }
    .ico svg { width: 1.05em; height: 1.05em; }
    .spinner { animation: spin .9s linear infinite; transform-origin: 50% 50%; }
    @keyframes spin { to { transform: rotate(360deg); } }
    nav { display: flex; gap: .25em; padding: .45em .55em; border-bottom: 1px solid var(--line); }
    nav button {
      flex: 1; border: 0; background: transparent; color: var(--fg2); font-family: inherit;
      font-size: .84em; font-weight: 600; padding: .42em .15em; border-radius: .5em; cursor: pointer;
    }
    nav button:hover { background: var(--bg2); color: var(--fg); }
    nav button.on { background: var(--accent-bg); color: var(--accent); }
    nav .n {
      display: inline-block; min-width: 1.35em; margin-left: .3em; padding: .05em .3em;
      border-radius: 999px; background: var(--bg3); color: var(--fg2); font-size: .78em;
    }
    nav button.on .n { background: var(--bg); color: var(--accent); }
    #body { overflow-y: auto; overscroll-behavior: contain; flex: 1; padding: .25em .35em .4em; min-height: 4em; }
    #body::-webkit-scrollbar { width: 7px; }
    #body::-webkit-scrollbar-thumb { background: var(--line2); border-radius: 8px; border: 2px solid var(--bg); }
    .cap { font-size: .72em; font-weight: 600; color: var(--fg2); padding: .3em .55em .1em; }
    .grp { margin-top: .15em; }
    .gh { display: flex; align-items: center; gap: .4em; padding: .45em .55em .1em; }
    .gname { font-size: .72em; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gcnt { font-size: .64em; font-weight: 700; color: var(--fg2); background: var(--bg3); border-radius: 999px; padding: .08em .4em; flex: none; }
    .row { display: flex; gap: .5em; align-items: flex-start; padding: .45em .55em; border-radius: .5em; text-decoration: none; color: inherit; min-width: 0; }
    .row:hover, .row:focus-visible { background: var(--bg2); outline: none; }
    .ic { flex: none; width: 1.5em; height: 1.5em; border-radius: .4em; background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; }
    .ic svg { width: .95em; height: .95em; }
    .main { min-width: 0; flex: 1; }
    .nm { font-size: .9em; font-weight: 600; line-height: 1.32; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .meta { font-size: .75em; color: var(--fg2); margin-top: .1em; display: flex; gap: .25em; min-width: 0; }
    .meta .due { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chip { font-size: .68em; font-weight: 600; padding: .18em .5em; border-radius: 999px; white-space: nowrap; flex: none; margin-top: .1em; }
    .chip.red { background: #fdecec; color: #c62a2f; }
    .chip.blue { background: var(--accent-bg); color: #1f5fd0; }
    .chip.muted { background: var(--bg3); color: var(--fg2); }
    :host([data-theme="dark"]) .chip.red { background: rgba(229,72,77,.16); color: #ff9c9c; }
    :host([data-theme="dark"]) .chip.blue { background: var(--accent-bg); color: #a9c4ff; }
    .empty { padding: 1.6em .8em; text-align: center; color: var(--fg2); font-size: .82em; }
    .empty b { display: block; color: var(--fg); font-size: 1.06em; font-weight: 600; margin-bottom: .25em; }
    footer {
      display: flex; align-items: center; gap: .35em; padding: .45em .6em;
      border-top: 1px solid var(--line); background: var(--bg2); font-size: .78em; color: var(--fg2);
    }
    .winl { white-space: nowrap; }
    #win {
      height: 1.95em; border: 1px solid var(--line2); border-radius: .45em; background: var(--bg);
      color: var(--fg); font: inherit; font-size: 1em; padding: 0 .25em; cursor: pointer; outline: none;
    }
    #win:focus { border-color: var(--accent); }
    .fsg { display: flex; align-items: center; gap: .1em; border: 1px solid var(--line2); border-radius: .45em; background: var(--bg); padding: .1em .15em; }
    .fsb {
      border: 0; background: transparent; color: var(--fg2); font: inherit; font-size: .85em; font-weight: 700;
      padding: .18em .38em; border-radius: .3em; cursor: pointer;
    }
    .fsb:hover:not(:disabled) { background: var(--bg3); color: var(--accent); }
    .fsb:disabled { opacity: .35; cursor: default; }
    .fsv { min-width: 2.7em; text-align: center; font-size: .74em; color: var(--fg2); font-variant-numeric: tabular-nums; }
  `;

  let host, sr, root, panel, bodyEl, tabBadge, winEl, fsLabel;

  const tabBtns = {};
  let tabN = {};

  function setBody(html) {
    const top = bodyEl.scrollTop;
    bodyEl.innerHTML = html;
    bodyEl.scrollTop = top;
  }

  function mount() {
    const built = LHU.mountShadow('lhu-aid-root', [LHU.THEME_CSS, CSS], `
      <div class="root">
        <div class="panel" role="dialog" aria-label="Hạn nộp">
          <header>
            <span class="brand">${I.deadline}</span>
            <span class="tt">Hạn nộp</span>
            <span class="grow"></span>
            <button class="ico" data-act="extend" title="Tắt tự động gia hạn phiên" aria-label="Tắt tự động gia hạn phiên" aria-pressed="true">${I.clock}</button>
            <button class="ico" data-act="refresh" title="Làm mới" aria-label="Làm mới">${I.refresh}</button>
            <button class="ico" data-act="pin" title="Ghim panel" aria-label="Ghim panel">${I.pin}</button>
          </header>
          <nav>
            <button data-tab="upcoming">Sắp tới<span class="n"></span></button>
            <button data-tab="overdue">Quá hạn<span class="n"></span></button>
          </nav>
          <div id="body"></div>
          <footer>
            <label class="winl" for="win">Quá hạn</label>
            <select id="win" aria-label="Khoảng thời gian hiển thị bài quá hạn"></select>
            <span class="grow"></span>
            <div class="fsg" role="group" aria-label="Cỡ chữ">
              <button class="fsb" data-act="fs-" title="Giảm cỡ chữ" aria-label="Giảm cỡ chữ">A−</button>
              <span class="fsv"></span>
              <button class="fsb" data-act="fs+" title="Tăng cỡ chữ" aria-label="Tăng cỡ chữ">A+</button>
            </div>
          </footer>
        </div>
        <button class="tab" data-act="toggle" title="Hạn nộp" aria-label="Mở hạn nộp" aria-describedby="login-hint">${I.deadline}<span class="tl">HẠN NỘP</span><span class="badge"></span></button>
        <span class="hint" id="login-hint" role="tooltip">Đăng nhập để xem hạn nộp.</span>
      </div>`);
    host = built.host;
    sr = built.sr;

    root = sr.querySelector('.root');
    panel = sr.querySelector('.panel');
    bodyEl = sr.querySelector('#body');
    tabBadge = sr.querySelector('.tab .badge');
    winEl = sr.querySelector('#win');
    fsLabel = sr.querySelector('.fsv');
    tabBtns.upcoming = sr.querySelector('[data-tab="upcoming"]');
    tabBtns.overdue = sr.querySelector('[data-tab="overdue"]');
    tabN = {
      upcoming: tabBtns.upcoming.querySelector('.n'),
      overdue: tabBtns.overdue.querySelector('.n')
    };

    winEl.innerHTML = LHU.OVERDUE_DAYS
      .map(d => `<option value="${d}">${WINDOW_LABEL[d]}</option>`)
      .join('');

    document.documentElement.appendChild(host);

    root.addEventListener('mouseenter', () => openPanel());
    root.addEventListener('mouseleave', () => {
      if (!state.pinned) setTimeout(() => { if (!root.matches(':hover') && !state.pinned) closePanel(); }, 220);
    });

    sr.addEventListener('click', onClick);
    sr.addEventListener('keydown', onKeydown);
    winEl.addEventListener('change', () => setWindow(Number(winEl.value)));
    LHU.onPrefs(onPrefsChange);
    document.addEventListener('lhu:session', () => {
      state.data = null;
      state.loading = false;
      closePanel();
      applyAll();
    });

    init();
    setInterval(() => {
      if (!state.data || document.hidden) return;
      renderTabs();
      if (state.open) renderBody();
    }, 60000);
  }

  async function init() {
    prefs = await LHU.getPrefs();
    state.pinned = prefs.pinned;
    applyAll();
    if (!LHU.isLoggedIn()) { state.loading = false; return; }
    setBody('<div class="empty"><b>Đang tải hạn nộp…</b>Đang đọc lịch học của bạn.</div>');
    await refreshData();
  }

  function onPrefsChange(p) {
    const oldDays = prefs.overdueDays;
    prefs = p;
    applyAll();
    if (oldDays !== p.overdueDays && state.data) renderBody();
  }

  function applyAll() {
    LHU.applyPrefs(host, prefs);
    const guest = !LHU.isLoggedIn();
    root.classList.toggle('guest', guest);
    const tab = sr.querySelector('.tab');
    tab.setAttribute('aria-disabled', String(guest));
    if (guest) tab.setAttribute('aria-describedby', 'login-hint');
    else tab.removeAttribute('aria-describedby');
    panel.inert = guest;
    state.pinned = prefs.pinned;
    winEl.value = String(prefs.overdueDays);
    const i = LHU.FS_STEPS.indexOf(prefs.fs);
    fsLabel.textContent = `${Math.round(prefs.fs * 100)}%`;
    sr.querySelector('[data-act="fs-"]').disabled = i <= 0;
    sr.querySelector('[data-act="fs+"]').disabled = i >= LHU.FS_STEPS.length - 1;

    const pin = panel.querySelector('[data-act="pin"]');
    if (pin) {
      pin.classList.toggle('on', state.pinned);
      pin.title = state.pinned ? 'Bỏ ghim panel' : 'Ghim panel';
    }
    const ext = panel.querySelector('[data-act="extend"]');
    if (ext) {
      ext.classList.toggle('on', prefs.autoExtend);
      ext.setAttribute('aria-pressed', String(prefs.autoExtend));
      ext.title = prefs.autoExtend ? 'Tắt tự động gia hạn phiên' : 'Bật tự động gia hạn phiên';
      ext.setAttribute('aria-label', ext.title);
    }
    renderPinState();
    renderTabs();
  }

  function renderPinState() {
    const pin = panel.querySelector('[data-act="pin"]');
    if (pin) pin.classList.toggle('on', state.pinned);
  }

  function onClick(e) {
    if (!LHU.isLoggedIn()) return;
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      state.tab = tabBtn.dataset.tab;
      renderBody();
      return;
    }
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const act = actBtn.dataset.act;
    if (act === 'toggle') togglePanel();
    else if (act === 'refresh') refreshData({ force: true });
    else if (act === 'pin') {
      state.pinned = !state.pinned;
      renderPinState();
      LHU.setPrefs({ pinned: state.pinned });
    } else if (act === 'extend') {
      prefs = { ...prefs, autoExtend: !prefs.autoExtend };
      applyAll();
      LHU.setPrefs({ autoExtend: prefs.autoExtend });
    } else if (act === 'fs-' || act === 'fs+') {
      stepFs(act === 'fs+' ? 1 : -1);
    }
  }

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (!state.pinned) closePanel();
    e.stopPropagation();
  }

  function openPanel() {
    if (!LHU.isLoggedIn()) return;
    state.open = true;
    root.classList.add('open');
    if (state.data) refreshData();
  }

  function closePanel() {
    state.open = false;
    root.classList.remove('open');
  }

  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  function stepFs(dir) {
    const i = LHU.FS_STEPS.indexOf(prefs.fs);
    const next = LHU.FS_STEPS[Math.max(0, Math.min(LHU.FS_STEPS.length - 1, i + dir))];
    if (next === prefs.fs) return;
    prefs = { ...prefs, fs: next };
    LHU.applyPrefs(host, prefs);
    fsLabel.textContent = `${Math.round(next * 100)}%`;
    sr.querySelector('[data-act="fs-"]').disabled = LHU.FS_STEPS.indexOf(next) <= 0;
    sr.querySelector('[data-act="fs+"]').disabled = LHU.FS_STEPS.indexOf(next) >= LHU.FS_STEPS.length - 1;
    LHU.setPrefs({ fs: next });
  }

  function setWindow(days) {
    if (!LHU.OVERDUE_DAYS.includes(days) || days === prefs.overdueDays) return;
    prefs = { ...prefs, overdueDays: days };
    winEl.value = String(days);
    if (state.data) renderBody();
    renderTabs();
    LHU.setPrefs({ overdueDays: days });
  }

  async function refreshData({ force = false } = {}) {
    if (!LHU.isLoggedIn()) return;
    if (state.loading && state.data) return;
    state.loading = true;
    state.error = false;
    renderMeta();
    try {
      const data = await LHU.loadDeadlines(force);
      if (!LHU.isLoggedIn()) return;
      state.data = data;
      state.error = false;
    } catch (e) {
      state.error = true;
    }
    state.loading = false;
    renderMeta();
    renderBody();
  }

  function renderMeta() {
    const icon = panel.querySelector('[data-act="refresh"] svg');
    if (icon) icon.classList.toggle('spinner', state.loading);
  }

  function windowDays() {
    return LHU.OVERDUE_DAYS.includes(prefs.overdueDays) ? prefs.overdueDays : 14;
  }

  function lists() {
    const data = state.data || { upcoming: [], past: [] };
    const now = Date.now();
    const since = now - windowDays() * DAY;
    const up = [];
    const over = [];
    const seen = new Set();
    for (const ev of [...(data.upcoming || []), ...(data.past || [])]) {
      if (!ev || !ev.due || seen.has(ev.id)) continue;
      seen.add(ev.id);
      if (ev.due >= now) up.push(ev);
      else if (ev.due >= since) over.push(ev);
    }
    up.sort((a, b) => a.due - b.due);
    over.sort((a, b) => b.due - a.due);
    return { up, over };
  }

  function renderTabs() {
    const { up, over } = lists();
    tabN.upcoming.textContent = up.length || '';
    tabN.overdue.textContent = over.length || '';
    tabBtns.upcoming.classList.toggle('on', state.tab === 'upcoming');
    tabBtns.overdue.classList.toggle('on', state.tab === 'overdue');

    const soon = up.filter(e => e.due - Date.now() <= 3 * DAY).length;
    const count = over.length || soon;
    tabBadge.textContent = count ? (count > 99 ? '99+' : String(count)) : '';
    tabBadge.classList.toggle('on', count > 0);
    tabBadge.classList.toggle('hot', over.length > 0);
  }

  function groupByCourse(list) {
    const groups = new Map();
    for (const ev of list) {
      const key = ev.courseId || ev.courseShort || ev.courseName;
      if (!groups.has(key)) {
        groups.set(key, { name: ev.courseShort || ev.courseName || 'Môn học', items: [] });
      }
      groups.get(key).items.push(ev);
    }
    return Array.from(groups.values());
  }

  function typeLabel(module) {
    if (module === 'assign') return 'Bài tập';
    if (module === 'quiz') return 'Quiz';
    return 'Hạn nộp';
  }

  function typeIcon(module) {
    if (module === 'assign') return I.assign;
    if (module === 'quiz') return I.quiz;
    return I.file;
  }

  function dueChip(due, past) {
    const now = Date.now();
    if (past) {
      const days = Math.floor((now - due) / DAY);
      return days <= 0
        ? { text: 'quá hạn hôm nay', cls: 'red' }
        : { text: `quá hạn ${days} ngày`, cls: 'red' };
    }
    const d = new Date(due);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / DAY);
    if (diff <= 0) return { text: 'hôm nay', cls: 'blue' };
    if (diff === 1) return { text: 'mai', cls: 'blue' };
    if (diff <= 7) return { text: `còn ${diff} ngày`, cls: 'muted' };
    return { text: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), cls: 'muted' };
  }

  function dueText(due) {
    const d = new Date(due);
    const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const time = d.getHours() || d.getMinutes()
      ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : '';
    return time ? `${date} ${time}` : date;
  }

  function rowHtml(ev, past) {
    const chip = dueChip(ev.due, past);
    return `<a class="row" href="${esc(ev.url)}">
      <span class="ic">${typeIcon(ev.module)}</span>
      <span class="main">
        <span class="nm">${esc(ev.name)}</span>
        <span class="meta"><span class="due">${esc(typeLabel(ev.module))} · Hạn ${esc(dueText(ev.due))}</span></span>
      </span>
      <span class="chip ${chip.cls}">${esc(chip.text)}</span>
    </a>`;
  }

  function renderBody() {
    renderTabs();

    if (!state.data && state.loading) {
      setBody('<div class="empty"><b>Đang tải hạn nộp…</b>Đang đọc lịch học của bạn.</div>');
      return;
    }

    const { up, over } = lists();
    const past = state.tab === 'overdue';
    const list = past ? over : up;
    const label = WINDOW_LABEL[windowDays()] || `${windowDays()} ngày`;

    if (!list.length) {
      setBody(`<div class="empty"><b>${past ? 'Không có bài quá hạn' : 'Không có hạn nộp sắp tới'}</b>${
        state.error
          ? 'Không đọc được dữ liệu. Bấm ↻ để thử lại.'
          : past
            ? `Không có hạn nộp nào trễ trong ${label} gần nhất.`
            : 'Mọi bài tập đã nộp hoặc chưa có hạn.'
      }</div>`);
      return;
    }

    const groups = groupByCourse(list);
    const cap = `${groups.length} môn · ${list.length} hạn${past ? ` · ${label} gần nhất` : ''}`;
    setBody(`<div class="cap">${cap}</div>` + groups.map(g => `
      <div class="grp">
        <div class="gh"><span class="gname">${esc(g.name)}</span><span class="gcnt">${g.items.length}</span></div>
        ${g.items.map(ev => rowHtml(ev, past)).join('')}
      </div>`).join(''));
  }

  (globalThis.chrome?.runtime?.onMessage)?.addListener((m) => {
    if (m?.type === 'lhu:toggle') togglePanel();
  });

  function shouldMount() {
    if (document.contentType && !/html/i.test(document.contentType)) return false;
    if (/^\/login\//.test(location.pathname)) return false;
    return true;
  }

  if (!shouldMount()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
