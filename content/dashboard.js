(() => {
  'use strict';
  if (globalThis.__LHU_DASH__) return;
  globalThis.__LHU_DASH__ = true;

  const LHU = globalThis.LHU;
  if (!LHU || !LHU.THEME_CSS || !document.body) return;
  if (!/^\/my(\/|$)/i.test(location.pathname)) return;

  const I = LHU.ICONS;
  const COLLAPSED = 12;
  const DISCOVER_TITLE = 'Khám phá môn học';
  const NO_COVER = chrome.runtime.getURL('icons/course-no-cover.svg');

  const SLOTS_MAX = LHU.PRIORITY_SLOTS_MAX || 20;
  const prefs = {
    theme: 'light', fs: 1, pinned: false, cols: 4, overdueDays: 14,
    courseSort: 'off', autoExtend: true, priority: [], prioritySlots: 5
  };
  let recentIds = [];
  let themeBtn = null;
  let discRequest = 0;
  let mineOrder = [];
  let drag = null;
  let flashTimer = 0;

  const mine = { id: 'mine', items: [], query: '', expanded: false, loading: true, error: false };
  const disc = {
    id: 'disc', items: [], categories: [], categoryId: 0, categoryName: '',
    query: '', expanded: false, categoriesLoading: true, loading: false, error: false
  };

  const esc = LHU.esc;
  const norm = LHU.norm;

  const CSS = `
    :host { all: initial; display: block; margin-top: .95rem; }
    * { box-sizing: border-box; }
    .wrap {
      font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: calc(14.5px * var(--lhu-fs, 1)); line-height: 1.4; color: var(--fg);
    }
    button, input, select { font-family: inherit; }
    .tools { display: flex; align-items: center; gap: .45em; flex-wrap: wrap; }
    .pick {
      flex: 1 1 18em; min-width: 12em; height: 2.4em; padding: 0 .6em;
      border: 1px solid var(--line2); border-radius: .55em; background: var(--bg); color: var(--fg);
      font-size: .88em; outline: 0;
    }
    .pick:focus { border-color: var(--accent); }
    .pick option { background: var(--bg); color: var(--fg); }
    .search {
      flex: 1 1 13em; min-width: 9em; display: flex; align-items: center; gap: .45em;
      height: 2.4em; padding: 0 .7em; border: 1px solid var(--line2); border-radius: .55em; background: var(--bg);
    }
    .search:focus-within { border-color: var(--accent); }
    .search svg { width: 1.05em; height: 1.05em; color: var(--fg2); flex: none; }
    .q { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font-size: .92em; color: var(--fg); padding: 0; }
    .q:disabled { cursor: not-allowed; opacity: .55; }
    .q::placeholder { color: var(--fg2); }
    .q::-webkit-search-cancel-button { display: none; }
    .clr { border: 0; background: transparent; color: var(--fg2); cursor: pointer; padding: .1em; display: flex; border-radius: .3em; }
    .clr svg { width: .9em; height: .9em; }
    .clr:hover { color: var(--fg); background: var(--bg3); }
    .ctl {
      height: 2.4em; min-width: 2.4em; padding: 0 .55em; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--line2); border-radius: .55em; background: var(--bg); color: var(--fg); cursor: pointer; font-size: 1em;
    }
    .ctl:hover { border-color: var(--accent); color: var(--accent); }
    .ctl svg { width: 1.1em; height: 1.1em; }
    .cols { display: flex; align-items: center; gap: .1em; border: 1px solid var(--line2); border-radius: .55em; padding: .15em; background: var(--bg); }
    .cols .ctl { border: 0; min-width: 2em; height: 1.95em; padding: 0 .2em; color: var(--fg2); background: transparent; }
    .cols .ctl svg { width: 1.2em; height: 1.2em; }
    .cols .ctl:hover { background: var(--bg3); color: var(--accent); }
    .cols .ctl.on { background: var(--accent-bg); color: var(--accent); }
    .bar { display: flex; align-items: center; gap: .5em; margin: .7em 0 0; font-size: .78em; color: var(--fg2); flex-wrap: wrap; }
    .bar .spacer { flex: 1; }
    .lnk { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 1em; font-weight: 600; cursor: pointer; padding: .25em .4em; border-radius: .35em; }
    .lnk:hover { background: var(--accent-bg); }
    .grid, .pgrid {
      display: grid; gap: .7em;
      grid-template-columns: repeat(auto-fill, minmax(max(9em, calc((100% - (var(--cols, 4) - 1) * .7em) / var(--cols, 4))), 1fr));
    }
    .grid, .pgrid { margin-top: .55em; }
    .card {
      position: relative; border: 1px solid var(--line); border-radius: .7em; overflow: hidden;
      background: var(--bg); transition: transform .12s, box-shadow .12s, border-color .12s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,44,77,.1); border-color: var(--line2); }
    :host([data-theme="dark"]) .card:hover { box-shadow: 0 10px 24px rgba(0,0,0,.42); }
    .card[draggable="true"] .thumb { cursor: grab; }
    .card.dragging { opacity: .4; }
    .card.drop-l::after, .card.drop-r::after {
      content: ""; position: absolute; top: 0; bottom: 0; width: 3px; background: var(--accent); z-index: 2;
    }
    .card.drop-l::after { left: 0; }
    .card.drop-r::after { right: 0; }
    .hit { display: block; text-decoration: none; color: inherit; }
    .thumb { position: relative; display: block; aspect-ratio: 16 / 9; background: var(--bg3); overflow: hidden; }
    .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb .rec {
      position: absolute; top: .4em; left: .4em; font-size: .62em; font-weight: 700; letter-spacing: .03em;
      color: #fff; background: rgba(13,22,38,.62); padding: .22em .5em; border-radius: .4em;
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    }
    .body { display: block; padding: .5em .65em .65em; }
    .nm { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: .88em; font-weight: 600; line-height: 1.32; min-height: 2.6em; overflow-wrap: anywhere; }
    .cat { display: block; margin-top: .15em; font-size: .74em; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.1em; }
    .addprio {
      position: absolute; top: .4em; right: .4em; width: 1.9em; height: 1.9em; display: flex; align-items: center;
      justify-content: center; border: 0; border-radius: .4em; background: rgba(13,22,38,.62); color: #fff;
      cursor: pointer; opacity: 0; transition: opacity .12s, background .12s;
    }
    .card:hover .addprio, .card:focus-within .addprio { opacity: 1; }
    .addprio:hover { background: var(--accent); }
    .addprio svg { width: 1em; height: 1em; }
    @media (hover: none) { .addprio { opacity: 1; } }
    .prio { margin-top: .9em; }
    .prio[hidden] { display: none; }
    .prio-head {
      display: flex; align-items: center; gap: .4em; padding-bottom: .45em; border-bottom: 1px solid var(--line);
      font-size: .76em; color: var(--fg2); flex-wrap: wrap; transition: color .12s;
    }
    .prio-head svg { width: 1.05em; height: 1.05em; color: var(--accent); flex: none; }
    .prio-head .pt { color: var(--fg); font-size: 1.06em; font-weight: 700; letter-spacing: .02em; }
    .prio-head .pn { margin-left: auto; font-variant-numeric: tabular-nums; }
    .prio.over .prio-head { color: var(--accent); }
    .prio.over .slot-empty { border-color: var(--accent); }
    .addslot {
      height: 2em; padding: 0 .65em; margin-left: .15em; border: 1px solid var(--line2); border-radius: .45em; background: var(--bg);
      color: var(--accent); font: inherit; font-size: .95em; font-weight: 700; cursor: pointer; transition: background .12s, border-color .12s;
    }
    .addslot:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-bg); }
    .addslot:disabled { opacity: .45; cursor: not-allowed; }
    .pgrid.full { animation: nope .3s; }
    @keyframes nope { 25% { transform: translateX(-.2em); } 75% { transform: translateX(.2em); } }
    .prio .rank {
      position: absolute; top: .4em; left: .4em; z-index: 2; min-width: 1.55em; height: 1.55em; padding: 0 .35em;
      display: flex; align-items: center; justify-content: center; border-radius: .4em;
      background: var(--accent-bg); color: var(--accent); font-size: .68em; font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .prio .rm {
      position: absolute; top: .4em; right: .4em; z-index: 2; width: 1.9em; height: 1.9em; padding: 0; display: flex;
      align-items: center; justify-content: center; border: 0; border-radius: .4em;
      background: rgba(13,22,38,.62); color: #fff; cursor: pointer; transition: background .12s;
    }
    .prio .rm:hover { background: var(--danger); }
    .prio .rm svg { width: .8em; height: .8em; }
    .slot-empty { border: 1px dashed var(--line2); background: transparent; }
    .slot-empty:hover { transform: none; box-shadow: none; border-color: var(--accent); }
    .slot-empty.over { border-color: var(--accent); background: var(--accent-bg); }
    .slot-empty .thumb { background: transparent; border-bottom: 1px dashed var(--line2); }
    .slot-empty .ph { display: flex; align-items: center; justify-content: center; }
    .slot-empty .ph .plus { font-size: 1.5em; line-height: 1; font-weight: 300; color: var(--fg2); opacity: .55; }
    .slot-empty:hover .ph .plus { color: var(--accent); opacity: 1; }
    .slot-empty .nm { color: var(--fg2); font-weight: 600; }
    .slot-empty .cat { opacity: .8; }
    .prio .msg { display: none; margin: .5em 0 0; font-size: .72em; color: var(--danger); }
    .prio .msg.on { display: block; }
    .empty { grid-column: 1 / -1; padding: 2em 1em; text-align: center; color: var(--fg2); font-size: .85em; }
    .empty b { display: block; color: var(--fg); font-size: 1.1em; margin-bottom: .25em; }
  `;

  function boot() {
    const found = document.querySelector('section.block_recentlyaccessedcourses .card-body');
    if (found) { start(found); return; }
    const mo = new MutationObserver(() => {
      const cb = document.querySelector('section.block_recentlyaccessedcourses .card-body');
      if (cb) { mo.disconnect(); start(cb); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 15000);
  }

  function start(cardBody) {
    const recentSection = cardBody.closest('section');
    mine.section = recentSection;

    const original = cardBody.querySelector('.card-text.content');
    if (original) original.style.display = 'none';
    const title = cardBody.querySelector('h5.card-title');
    if (title) title.textContent = 'Môn học của tôi';

    createWidget(mine, 'Tìm môn học…');
    createWidget(disc, 'Tìm môn khác…');
    cardBody.appendChild(mine.host);

    const sec = document.createElement('section');
    sec.className = 'block card mb-4 lhu-discover';
    const body = document.createElement('div');
    body.className = 'card-body';
    const heading = document.createElement('h5');
    heading.className = 'card-title';
    heading.textContent = DISCOVER_TITLE;
    const content = document.createElement('div');
    content.className = 'card-text content';
    body.append(heading, content);
    sec.appendChild(body);
    content.appendChild(disc.host);
    recentSection.parentNode.insertBefore(sec, recentSection.nextSibling);
    disc.section = sec;

    recentIds = readRecent(recentSection);
    setTimeout(() => {
      const ids = readRecent(recentSection);
      if (ids.join() !== recentIds.join()) {
        recentIds = ids;
        paintMine();
      }
    }, 2500);

    const syncPrefs = (p) => {
      const repaint = p.priority.join() !== prefs.priority.join()
        || p.prioritySlots !== prefs.prioritySlots;
      Object.assign(prefs, p);
      paintPrefs();
      if (repaint) paintMine();
    };
    LHU.onPrefs(syncPrefs);
    init();
    LHU.getPrefs().then(syncPrefs);
  }

  function readRecent(section) {
    const ids = [];
    for (const a of section.querySelectorAll('a[href*="/course/view.php?id="]')) {
      const id = Number((a.href.match(/[?&]id=(\d+)/) || [])[1]);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, 8);
  }

  function createWidget(w, placeholder) {
    const isMine = w.id === 'mine';
    const { host, sr } = LHU.mountShadow(isMine ? 'lhu-courses' : 'lhu-discover-courses', [LHU.THEME_CSS, CSS], `
      <div class="wrap">
        <div class="tools">
          ${isMine ? '' : '<select class="pick" aria-label="Chọn danh mục môn học"><option value="">Chọn danh mục…</option></select>'}
          <div class="search">
            ${I.search}
            <input class="q" type="search" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" aria-label="${esc(placeholder)}"${isMine ? '' : ' disabled'}>
            <button class="clr" data-act="clear" title="Xóa" hidden>${I.close}</button>
          </div>
          ${isMine ? `<button class="ctl" data-act="theme" aria-label="Đổi giao diện sáng/tối"></button>` : ''}
          ${isMine ? `<div class="cols" role="group" aria-label="Số ô mỗi hàng">${
            LHU.COL_STEPS.map(n => `<button class="ctl" data-cols="${n}" title="${n} ô mỗi hàng" aria-label="${n} ô mỗi hàng">${LHU.gridIcon(n)}</button>`).join('')
          }</div>` : ''}
        </div>
        <div class="bar">
          <span class="cnt"></span>
          <span class="spacer"></span>
          <button class="lnk exp" hidden></button>
        </div>
        ${isMine ? `<div class="prio" role="group" aria-label="Môn học ưu tiên" hidden>
          <div class="prio-head">
            ${I.star}<span class="pt">Ưu tiên</span><span> Kéo thả để sắp xếp, bấm × để bỏ</span>
            <span class="pn"></span>
            <button class="addslot" data-act="slot" title="Thêm một ô ưu tiên" aria-label="Thêm một ô ưu tiên">+1</button>
          </div>
          <div class="pgrid"></div>
          <p class="msg" role="status" aria-live="polite"></p>
        </div>` : ''}
        <div class="grid"></div>
      </div>`);

    w.host = host;
    w.sr = sr;
    w.grid = sr.querySelector('.grid');
    w.count = sr.querySelector('.cnt');
    w.exp = sr.querySelector('.exp');
    w.q = sr.querySelector('.q');
    w.clr = sr.querySelector('.clr');
    w.pick = sr.querySelector('.pick');
    if (isMine) {
      themeBtn = sr.querySelector('[data-act="theme"]');
      w.prio = sr.querySelector('.prio');
      w.pgrid = sr.querySelector('.pgrid');
      w.msg = sr.querySelector('.prio .msg');
      w.prioCount = sr.querySelector('.pn');
      w.addSlot = sr.querySelector('.addslot');
      bindDrag(sr);
    } else {
      w.pick.addEventListener('change', () => selectCategory(Number(w.pick.value)));
    }

    sr.addEventListener('click', (e) => onClick(e, w));
    w.q.addEventListener('input', () => {
      w.query = w.q.value;
      w.clr.hidden = !w.query;
      paint(w);
    });
    sr.addEventListener('error', (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG' || img.getAttribute('src') === NO_COVER) return;
      img.src = NO_COVER;
      img.alt = 'Chưa có ảnh bìa';
    }, true);
  }

  function paintCategoryOptions() {
    if (!disc.pick) return;
    disc.pick.innerHTML = '<option value="">Chọn danh mục…</option>' + disc.categories
      .map((category) => `<option value="${category.id}">${esc(category.name)}</option>`)
      .join('');
    disc.pick.value = disc.categoryId ? String(disc.categoryId) : '';
    disc.pick.disabled = disc.categoriesLoading || !disc.categories.length;
  }

  async function selectCategory(id) {
    const category = disc.categories.find((item) => item.id === id);
    const request = ++discRequest;
    disc.categoryId = category?.id || 0;
    disc.categoryName = category?.name || '';
    disc.items = [];
    disc.query = '';
    disc.expanded = false;
    disc.error = false;
    disc.loading = !!category;
    disc.q.value = '';
    disc.q.disabled = true;
    disc.clr.hidden = true;
    if (disc.pick) disc.pick.value = category ? String(category.id) : '';
    paintDisc();
    if (!category) return;

    try {
      const list = await LHU.loadCategoryCourses(category.id);
      if (request !== discRequest) return;
      disc.items = list || [];
    } catch (e) {
      if (request !== discRequest) return;
      disc.error = true;
    }
    if (request !== discRequest) return;
    disc.loading = false;
    disc.q.disabled = false;
    paintDisc();
  }

  function onClick(e, w) {
    const cols = e.target.closest('[data-cols]');
    if (cols) {
      const next = Number(cols.dataset.cols);
      if (next !== prefs.cols) {
        prefs.cols = next;
        paintPrefs();
        LHU.setPrefs({ cols: next }).then((p) => { Object.assign(prefs, p); paintPrefs(); });
      }
      return;
    }

    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'theme') {
        prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
        paintPrefs();
        LHU.setPrefs({ theme: prefs.theme }).then((p) => { Object.assign(prefs, p); paintPrefs(); });
      } else if (act.dataset.act === 'slot') {
        addSlot();
      } else if (act.dataset.act === 'clear') {
        w.q.value = '';
        w.query = '';
        w.clr.hidden = true;
        paint(w);
        w.q.focus();
      }
      return;
    }

    if (e.target.closest('.exp')) {
      w.expanded = !w.expanded;
      paint(w);
      return;
    }

    const remove = e.target.closest('[data-remove]');
    if (remove && w.id === 'mine') {
      e.preventDefault();
      removeFromPriority(Number(remove.dataset.remove));
      return;
    }

    const add = e.target.closest('[data-add]');
    if (add && w.id === 'mine') {
      e.preventDefault();
      addToPriority(Number(add.dataset.add));
    }
  }

  function slotCap() {
    return Math.max(prefs.prioritySlots, prefs.priority.length);
  }

  function savePriority(list) {
    prefs.priority = list.slice(0, SLOTS_MAX);
    paintMine();
    LHU.setPrefs({ priority: prefs.priority }).then((p) => {
      Object.assign(prefs, p);
      paintMine();
    });
  }

  function addSlot() {
    const cap = slotCap();
    if (cap >= SLOTS_MAX) {
      flash(`Tối đa ${SLOTS_MAX} ô ưu tiên.`);
      return;
    }
    prefs.prioritySlots = cap + 1;
    paintMine();
    LHU.setPrefs({ prioritySlots: prefs.prioritySlots }).then((p) => {
      Object.assign(prefs, p);
      paintMine();
    });
  }

  function addToPriority(id) {
    if (!id) return;
    if (prefs.priority.includes(id)) return;
    if (prefs.priority.length >= slotCap()) {
      flash(`Đã đủ ${slotCap()} ô ưu tiên. Bấm +1 để thêm ô.`);
      return;
    }
    mineOrder = mineOrder.filter(x => x !== id);
    savePriority([...prefs.priority, id]);
  }

  function removeFromPriority(id) {
    if (!id || !prefs.priority.includes(id)) return;
    if (!mineOrder.includes(id)) mineOrder.push(id);
    savePriority(prefs.priority.filter(x => x !== id));
  }

  // indexHint is an insertion point measured on the current priority list.
  function dropToPriority(id, indexHint) {
    const cur = prefs.priority;
    const isNew = !cur.includes(id);
    if (isNew && cur.length >= slotCap()) {
      flash(`Đã đủ ${slotCap()} ô ưu tiên. Bấm +1 để thêm ô.`);
      return;
    }
    const without = cur.filter(x => x !== id);
    let at = indexHint;
    const from = cur.indexOf(id);
    if (from >= 0 && from < at) at--;
    at = Math.max(0, Math.min(at, without.length));
    without.splice(at, 0, id);
    savePriority(without);
  }

  function dropToGrid(moving, targetId, after) {
    const rest = mineOrder.filter(x => !prefs.priority.includes(x));
    let index = rest.indexOf(targetId);
    index = index < 0 ? rest.length : index + (after ? 1 : 0);
    if (moving.from === 'grid') {
      const from = rest.indexOf(moving.id);
      if (from >= 0) {
        rest.splice(from, 1);
        if (from < index) index--;
      }
      rest.splice(Math.max(0, Math.min(index, rest.length)), 0, moving.id);
      mineOrder = rest;
      paintMine();
      return;
    }
    rest.splice(Math.max(0, Math.min(index, rest.length)), 0, moving.id);
    mineOrder = rest;
    savePriority(prefs.priority.filter(x => x !== moving.id));
  }

  function flash(text) {
    if (!mine.msg) return;
    mine.msg.textContent = text;
    mine.msg.classList.toggle('on', !!text);
    if (mine.pgrid) {
      mine.pgrid.classList.remove('full');
      void mine.pgrid.offsetWidth;
      mine.pgrid.classList.add('full');
    }
    clearTimeout(flashTimer);
    if (text) flashTimer = setTimeout(() => {
      mine.msg.textContent = '';
      mine.msg.classList.remove('on');
    }, 3200);
  }

  function clearHints() {
    if (!mine.sr) return;
    for (const el of mine.sr.querySelectorAll('.over, .drop-l, .drop-r')) {
      el.classList.remove('over', 'drop-l', 'drop-r');
    }
  }

  function bindDrag(sr) {
    sr.addEventListener('dragstart', (e) => {
      const source = e.target.closest('[data-id]');
      if (!source) return;
      const id = Number(source.dataset.id);
      if (!id) return;
      drag = { id, from: source.dataset.from || 'grid' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(id));
      source.classList.add('dragging');
    });

    sr.addEventListener('dragend', () => {
      for (const el of sr.querySelectorAll('.dragging')) el.classList.remove('dragging');
      clearHints();
      drag = null;
    });

    sr.addEventListener('dragover', (e) => {
      if (!drag) return;
      clearHints();
      const slot = e.target.closest('.pgrid [data-slot]');
      if (slot) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('over');
        return;
      }
      const pcard = e.target.closest('.pgrid .card');
      if (pcard) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = pcard.getBoundingClientRect();
        pcard.classList.add(e.clientX > rect.left + rect.width / 2 ? 'drop-r' : 'drop-l');
        return;
      }
      const card = e.target.closest('.grid .card');
      if (card) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = card.getBoundingClientRect();
        card.classList.add(e.clientX > rect.left + rect.width / 2 ? 'drop-r' : 'drop-l');
        return;
      }
      if (e.target.closest('.prio')) {
        e.preventDefault();
        e.target.closest('.prio').classList.add('over');
        return;
      }
      if (e.target.closest('.grid')) e.preventDefault();
    });

    sr.addEventListener('drop', (e) => {
      if (!drag) return;
      const slot = e.target.closest('.pgrid [data-slot]');
      const pcard = e.target.closest('.pgrid .card');
      const card = e.target.closest('.grid .card');
      const pgap = !slot && !pcard && e.target.closest('.prio');
      const gap = !card && e.target.closest('.grid');
      if (!slot && !pcard && !card && !pgap && !gap) return;
      e.preventDefault();
      const moving = drag;
      drag = null;
      clearHints();
      if (slot) {
        dropToPriority(moving.id, Number(slot.dataset.slot));
      } else if (pcard) {
        const rect = pcard.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        dropToPriority(moving.id, Number(pcard.dataset.pos) + (after ? 1 : 0));
      } else if (pgap) {
        dropToPriority(moving.id, prefs.priority.length);
      } else if (card) {
        const rect = card.getBoundingClientRect();
        dropToGrid(moving, Number(card.dataset.id), e.clientX > rect.left + rect.width / 2);
      } else {
        dropToGrid(moving, 0, true);
      }
    });
  }

  function paintPrefs() {
    for (const w of [mine, disc]) if (w.host) LHU.applyPrefs(w.host, prefs);
    if (themeBtn) {
      themeBtn.innerHTML = prefs.theme === 'dark' ? I.sun : I.moon;
      themeBtn.title = prefs.theme === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối';
    }
    if (!mine.sr) return;
    for (const btn of mine.sr.querySelectorAll('[data-cols]')) {
      btn.classList.toggle('on', Number(btn.dataset.cols) === prefs.cols);
    }
    syncSurface();
  }

  // The block plugin styles its own card white; copy it so the discover card matches.
  function syncSurface() {
    if (!disc.section || !mine.section) return;
    disc.section.style.backgroundColor = prefs.theme === 'dark' ? '' : getComputedStyle(mine.section).backgroundColor;
  }

  function paint(w) {
    if (w.id === 'mine') paintMine();
    else paintDisc();
  }

  function paintList(w, list, meta) {
    const tokens = norm(w.query).split(' ').filter(Boolean);
    const filtered = tokens.length ? list.filter(c => matches(c, tokens)) : list;
    const shown = tokens.length || w.expanded ? filtered : filtered.slice(0, COLLAPSED);

    w.grid.innerHTML = shown.length
      ? shown.map(c => cardHtml(c, w.id === 'mine', w.id === 'mine' && recentIds.includes(c.id))).join('')
      : `<div class="empty"><b>${esc(meta.emptyTitle)}</b>${esc(meta.emptyHint)}</div>`;    w.count.textContent = tokens.length ? `${filtered.length} / ${list.length} môn` : meta.count;
    w.exp.hidden = tokens.length > 0 || filtered.length <= COLLAPSED;
    w.exp.textContent = w.expanded ? 'Thu gọn' : `Xem tất cả ${filtered.length} môn`;
  }

  function paintMine() {
    if (mine.loading) {
      hidePriority();
      mine.grid.innerHTML = '<div class="empty"><b>Đang tải môn học…</b>Đang đọc danh sách từ Learn LHU.</div>';
      mine.count.textContent = '';
      mine.exp.hidden = true;
      return;
    }

    if (!mine.items.length) {
      hidePriority();
      mine.grid.innerHTML = mine.error
        ? '<div class="empty"><b>Không tải được danh sách môn</b>Thử tải lại trang.</div>'
        : '<div class="empty"><b>Chưa có môn học</b>Hãy đăng ký môn trong Learn LHU.</div>';
      mine.count.textContent = '';
      mine.exp.hidden = true;
      return;
    }

    const byId = new Map(mine.items.map(c => [c.id, c]));
    if (!mineOrder.length) mineOrder = defaultOrder();
    mineOrder = mineOrder.filter(id => byId.has(id));
    for (const c of mine.items) if (!mineOrder.includes(c.id)) mineOrder.push(c.id);
    prunePriority(byId);

    const priority = prefs.priority.map(id => byId.get(id)).filter(Boolean);
    const searching = norm(mine.query).trim() !== '';
    if (searching) hidePriority();
    else paintPriority(priority);

    const list = searching
      ? mine.items
      : mineOrder.map(id => byId.get(id)).filter(c => c && !prefs.priority.includes(c.id));
    const detail = priority.length ? `${mine.items.length} môn · ${priority.length} ưu tiên` : `${mine.items.length} môn`;
    const allPinned = !searching && !list.length;

    paintList(mine, list, {
      count: detail,
      emptyTitle: allPinned ? 'Mọi môn đều đang ưu tiên' : 'Không tìm thấy môn',
      emptyHint: allPinned ? 'Bỏ một môn khỏi Ưu tiên để môn đó hiện lại ở đây.' : 'Thử từ khóa ngắn hơn, không cần dấu.'
    });
  }

  function defaultOrder() {
    const rank = new Map(recentIds.map((id, i) => [id, i]));
    return mine.items.slice().sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : 1e9;
      const rb = rank.has(b.id) ? rank.get(b.id) : 1e9;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name, 'vi');
    }).map(c => c.id);
  }

  // Courses that left the enrolled list must not keep an empty priority slot.
  function prunePriority(byId) {
    const kept = prefs.priority.filter(id => byId.has(id));
    if (kept.length === prefs.priority.length) return;
    prefs.priority = kept;
    LHU.setPrefs({ priority: kept }).then((p) => {
      Object.assign(prefs, p);
      paintMine();
    });
  }

  function hidePriority() {
    if (!mine.prio) return;
    mine.prio.hidden = true;
    mine.pgrid.innerHTML = '';
    mine.msg.textContent = '';
    mine.msg.classList.remove('on');
  }

  function paintPriority(items) {
    if (!mine.prio) return;
    if (!items.length) {
      hidePriority();
      return;
    }
    mine.prio.hidden = false;
    const cap = slotCap();
    mine.prioCount.textContent = `${items.length}/${cap} ô`;
    if (mine.addSlot) {
      mine.addSlot.disabled = cap >= SLOTS_MAX;
      mine.addSlot.title = cap >= SLOTS_MAX ? `Tối đa ${SLOTS_MAX} ô ưu tiên` : 'Thêm một ô ưu tiên';
    }
    let html = '';
    for (let i = 0; i < items.length; i++) html += priorityCard(items[i], i);
    for (let i = items.length; i < cap; i++) html += emptySlot(i);
    mine.pgrid.innerHTML = html;
  }

  function priorityCard(c, index) {
    const cat = c.category || c.short || '';
    return `<article class="card" draggable="true" data-id="${c.id}" data-from="priority" data-pos="${index}">
      <span class="rank" aria-hidden="true">${index + 1}</span>
      <a class="hit" href="${esc(c.url)}" title="${esc(c.name)}" draggable="false">
        <span class="thumb">
          <img src="${esc(c.image || NO_COVER)}" alt="${c.image ? '' : 'Chưa có ảnh bìa'}" draggable="false" loading="lazy" decoding="async">
        </span>
        <span class="body">
          <span class="nm">${esc(c.name)}</span>
          <span class="cat">${esc(cat) || '&nbsp;'}</span>
        </span>
      </a>
      <button class="rm" data-remove="${c.id}" title="Bỏ khỏi ưu tiên" aria-label="Bỏ khỏi ưu tiên: ${esc(c.name)}">${I.close}</button>
    </article>`;
  }

  function emptySlot(index) {
    return `<article class="card slot-empty" data-slot="${index}" aria-label="Ô ưu tiên ${index + 1}, đang trống">
      <span class="hit">
        <span class="thumb ph"><span class="plus">+</span></span>
        <span class="body">
          <span class="nm">Ô ${index + 1}</span>
          <span class="cat">Kéo môn vào đây</span>
        </span>
      </span>
    </article>`;
  }

  function paintDisc() {
    if (disc.categoriesLoading) {
      disc.grid.innerHTML = '<div class="empty"><b>Đang tải danh mục…</b>Đang đọc danh mục môn học từ Learn LHU.</div>';
      disc.count.textContent = '';
      disc.exp.hidden = true;
      return;
    }

    if (!disc.categories.length) {
      disc.grid.innerHTML = '<div class="empty"><b>Không tải được danh mục</b>Thử tải lại trang.</div>';
      disc.count.textContent = '';
      disc.exp.hidden = true;
      return;
    }

    if (!disc.categoryId) {
      disc.grid.innerHTML = '<div class="empty"><b>Chọn danh mục</b>Môn học chỉ được tải sau khi bạn chọn.</div>';
      disc.count.textContent = `${disc.categories.length} danh mục`;
      disc.exp.hidden = true;
      return;
    }

    if (disc.loading) {
      disc.grid.innerHTML = `<div class="empty"><b>Đang tải môn học…</b>${esc(disc.categoryName)}</div>`;
      disc.count.textContent = '';
      disc.exp.hidden = true;
      return;
    }

    if (!disc.items.length) {
      disc.grid.innerHTML = disc.error
        ? '<div class="empty"><b>Không tải được môn học</b>Hãy chọn lại danh mục.</div>'
        : '<div class="empty"><b>Chưa có môn học</b>Danh mục này chưa công bố môn nào.</div>';
      disc.count.textContent = '';
      disc.exp.hidden = true;
      return;
    }

    const enrolled = new Set(mine.items.map(c => c.id));
    const list = disc.items
      .filter(c => !enrolled.has(c.id))
      .sort((a, b) => LHU.compareCourseNames(a.name, b.name));

    if (!list.length) {
      disc.grid.innerHTML = '<div class="empty"><b>Không có môn khác</b>Bạn đã tham gia tất cả môn trong danh mục.</div>';
      disc.count.textContent = '';
      disc.exp.hidden = true;
      return;
    }

    paintList(disc, list, {
      count: `${list.length} môn · ${disc.categoryName}`,
      emptyTitle: 'Không tìm thấy môn',
      emptyHint: 'Thử từ khóa ngắn hơn, không cần dấu.'
    });
  }

  function matches(course, tokens) {
    if (!tokens.length) return true;
    const hay = norm(`${course.name} ${course.short} ${course.category}`);
    return tokens.every(t => hay.includes(t));
  }

  function cardHtml(c, mineCard, recent) {
    const cat = c.category || c.short || '';
    return `<article class="card"${mineCard ? ` draggable="true" data-id="${c.id}" data-from="grid"` : ''}>
      <a class="hit" href="${esc(c.url)}" title="${esc(c.name)}"${mineCard ? ' draggable="false"' : ''}>
        <span class="thumb">
          <img src="${esc(c.image || NO_COVER)}" alt="${c.image ? '' : 'Chưa có ảnh bìa'}" draggable="false" loading="lazy" decoding="async">
          ${recent ? '<span class="rec">Gần đây</span>' : ''}
        </span>
        <span class="body">
          <span class="nm">${esc(c.name)}</span>
          <span class="cat">${esc(cat) || '&nbsp;'}</span>
        </span>
      </a>
      ${mineCard && !prefs.priority.includes(c.id) ? `<button class="addprio" data-add="${c.id}" title="Ưu tiên môn này" aria-label="Ưu tiên môn này: ${esc(c.name)}">${I.star}</button>` : ''}
    </article>`;
  }

  async function init() {
    mine.loading = true;
    mine.error = false;
    disc.categoriesLoading = true;
    disc.loading = false;
    disc.error = false;
    disc.categories = [];
    disc.categoryId = 0;
    disc.categoryName = '';
    disc.items = [];
    disc.query = '';
    disc.expanded = false;
    discRequest++;
    disc.q.value = '';
    disc.q.disabled = true;
    disc.clr.hidden = true;
    paintMine();
    paintDisc();

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { list } = await LHU.loadCourses(attempt > 0);
        mine.items = list || [];
      } catch (e) {
        mine.items = [];
      }
      if (mine.items.length) break;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
    mine.error = !mine.items.length;
    mine.loading = false;
    paintMine();

    try {
      disc.categories = (await LHU.loadCourseCategories()) || [];
    } catch (e) {
      disc.categories = [];
    }
    disc.categoriesLoading = false;
    paintCategoryOptions();
    paintDisc();
    syncSurface();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
