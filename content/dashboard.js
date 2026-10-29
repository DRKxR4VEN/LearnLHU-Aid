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

  const prefs = {
    theme: 'light', fs: 1, pinned: false, cols: 4, overdueDays: 14,
    courseSort: 'off', autoExtend: true, coursePins: []
  };
  let recentIds = [];
  let themeBtn = null;
  let discRequest = 0;

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
    .ctl.sort { font-size: .78em; font-weight: 700; letter-spacing: .02em; padding: 0 .6em; }
    .ctl.sort.on { background: var(--accent-bg); border-color: transparent; color: var(--accent); }
    .cols { display: flex; align-items: center; gap: .1em; border: 1px solid var(--line2); border-radius: .55em; padding: .15em; background: var(--bg); }
    .cols .ctl { border: 0; min-width: 2em; height: 1.95em; padding: 0 .2em; color: var(--fg2); background: transparent; }
    .cols .ctl svg { width: 1.2em; height: 1.2em; }
    .cols .ctl:hover { background: var(--bg3); color: var(--accent); }
    .cols .ctl.on { background: var(--accent-bg); color: var(--accent); }
    .bar { display: flex; align-items: center; gap: .5em; margin: .7em 0 0; font-size: .78em; color: var(--fg2); flex-wrap: wrap; }
    .bar .spacer { flex: 1; }
    .lnk { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 1em; font-weight: 600; cursor: pointer; padding: .25em .4em; border-radius: .35em; }
    .lnk:hover { background: var(--accent-bg); }
    .grid {
      display: grid; gap: .7em; margin-top: .55em;
      grid-template-columns: repeat(auto-fill, minmax(max(9em, calc((100% - (var(--cols, 4) - 1) * .7em) / var(--cols, 4))), 1fr));
    }
    .card {
      position: relative; border: 1px solid var(--line); border-radius: .7em; overflow: hidden;
      background: var(--bg); transition: transform .12s, box-shadow .12s, border-color .12s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,44,77,.1); border-color: var(--line2); }
    :host([data-theme="dark"]) .card:hover { box-shadow: 0 10px 24px rgba(0,0,0,.42); }
    .card.pinned { border-color: var(--accent); }
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
    .cat { display: block; margin-top: .15em; font-size: .74em; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.1em; padding-right: 2.1em; }
    .pin {
      position: absolute; right: .45em; bottom: .5em; width: 1.95em; height: 1.95em; border: 1px solid transparent;
      border-radius: .45em; background: var(--bg2); color: var(--fg2); display: flex; align-items: center; justify-content: center;
      cursor: pointer; opacity: 0; transition: opacity .12s, color .12s, background .12s, border-color .12s;
    }
    .card:hover .pin, .card:focus-within .pin, .pin.on { opacity: 1; }
    .pin:hover { color: var(--accent); background: var(--accent-bg); }
    .pin.on { color: var(--accent); background: var(--accent-bg); border-color: var(--accent); }
    .pin svg { width: 1em; height: 1em; }
    @media (hover: none) { .pin { opacity: 1; } }
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
      const repaint = p.courseSort !== prefs.courseSort
        || p.coursePins.join() !== prefs.coursePins.join();
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
          ${isMine ? `<button class="ctl sort" data-act="sort" title="Sắp xếp môn học A–Z" aria-label="Sắp xếp môn học A–Z" aria-pressed="false">A–Z</button>` : ''}
          ${isMine ? `<div class="cols" role="group" aria-label="Số ô mỗi hàng">${
            LHU.COL_STEPS.map(n => `<button class="ctl" data-cols="${n}" title="${n} ô mỗi hàng" aria-label="${n} ô mỗi hàng">${LHU.gridIcon(n)}</button>`).join('')
          }</div>` : ''}
        </div>
        <div class="bar">
          <span class="cnt"></span>
          <span class="spacer"></span>
          <button class="lnk exp" hidden></button>
        </div>
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
      } else if (act.dataset.act === 'sort') {
        prefs.courseSort = prefs.courseSort === 'az' ? 'off' : 'az';
        paintPrefs();
        paintMine();
        LHU.setPrefs({ courseSort: prefs.courseSort }).then((p) => { Object.assign(prefs, p); paintPrefs(); paintMine(); });
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

    const pin = e.target.closest('[data-pin]');
    if (pin) {
      e.preventDefault();
      togglePin(Number(pin.dataset.pin));
    }
  }

  function togglePin(id) {
    if (!id) return;
    const pins = prefs.coursePins.includes(id)
      ? prefs.coursePins.filter(x => x !== id)
      : [id, ...prefs.coursePins];
    prefs.coursePins = pins;
    paintMine();
    LHU.setPrefs({ coursePins: pins }).then((p) => {
      Object.assign(prefs, p);
      paintMine();
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
    const sortBtn = mine.sr.querySelector('[data-act="sort"]');
    if (sortBtn) {
      const on = prefs.courseSort === 'az';
      sortBtn.classList.toggle('on', on);
      sortBtn.setAttribute('aria-pressed', String(on));
      sortBtn.title = on ? 'Bỏ sắp xếp A–Z' : 'Sắp xếp môn học A–Z';
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
      mine.grid.innerHTML = '<div class="empty"><b>Đang tải môn học…</b>Đang đọc danh sách từ Learn LHU.</div>';
      mine.count.textContent = '';
      mine.exp.hidden = true;
      return;
    }

    if (!mine.items.length) {
      mine.grid.innerHTML = mine.error
        ? '<div class="empty"><b>Không tải được danh sách môn</b>Thử tải lại trang.</div>'
        : '<div class="empty"><b>Chưa có môn học</b>Hãy đăng ký môn trong Learn LHU.</div>';
      mine.count.textContent = '';
      mine.exp.hidden = true;
      return;
    }

    const az = prefs.courseSort === 'az';
    const pinRank = new Map(prefs.coursePins.map((id, i) => [id, i]));
    const rank = new Map(recentIds.map((id, i) => [id, i]));
    const list = mine.items.slice().sort((a, b) => {
      const pa = pinRank.has(a.id) ? pinRank.get(a.id) : 1e9;
      const pb = pinRank.has(b.id) ? pinRank.get(b.id) : 1e9;
      if (pa !== pb) return pa - pb;
      if (az) return LHU.compareCourseNames(a.name, b.name);
      const ra = rank.has(a.id) ? rank.get(a.id) : 1e9;
      const rb = rank.has(b.id) ? rank.get(b.id) : 1e9;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name, 'vi');
    });

    const pinned = list.filter(c => pinRank.has(c.id)).length;
    const detail = [
      pinned ? `${pinned} ghim` : '',
      az ? 'A–Z' : recentIds.length ? `${recentIds.length} gần đây` : ''
    ].filter(Boolean).join(' · ');

    paintList(mine, list, {
      count: detail ? `${list.length} môn · ${detail}` : `${list.length} môn`,
      emptyTitle: 'Không tìm thấy môn',
      emptyHint: 'Thử từ khóa ngắn hơn, không cần dấu.'
    });
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

  function cardHtml(c, allowPin, recent) {
    const cat = c.category || c.short || '';
    const pinned = allowPin && prefs.coursePins.includes(c.id);
    const pinTitle = pinned ? 'Bỏ ghim môn học' : 'Ghim môn học lên đầu';
    return `<article class="card${pinned ? ' pinned' : ''}">
      <a class="hit" href="${esc(c.url)}" title="${esc(c.name)}">
        <span class="thumb">
          <img src="${esc(c.image || NO_COVER)}" alt="${c.image ? '' : 'Chưa có ảnh bìa'}" loading="lazy" decoding="async">
          ${recent ? '<span class="rec">Gần đây</span>' : ''}
        </span>
        <span class="body">
          <span class="nm">${esc(c.name)}</span>
          <span class="cat">${esc(cat) || '&nbsp;'}</span>
        </span>
      </a>
      ${allowPin ? `<button class="pin${pinned ? ' on' : ''}" data-pin="${c.id}" aria-pressed="${pinned}" title="${pinTitle}" aria-label="${pinTitle}: ${esc(c.name)}">${I.pin}</button>` : ''}
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
