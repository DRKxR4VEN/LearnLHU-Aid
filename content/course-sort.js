(() => {
  'use strict';
  if (globalThis.__LHU_COURSESORT__) return;
  globalThis.__LHU_COURSESORT__ = true;

  const LHU = globalThis.LHU;
  if (!LHU || !document.body) return;

  let prefs = { courseSort: 'off' };
  let nav = null;
  let timer = 0;

  const nameOf = (li) => {
    const a = li.querySelector('a[href*="/course/view.php?id="]');
    const t = a && (a.querySelector('.text') || a.querySelector('.c-nav-item-container') || a);
    return ((t && t.textContent) || '').replace(/\s+/g, ' ').trim();
  };
  const cmp = (a, b) => LHU.compareCourseNames(nameOf(a), nameOf(b));

  function findList() {
    for (const li of document.querySelectorAll('#nav-drawer li.sidebar-accordion')) {
      const head = li.querySelector('.btn-accordion');
      if (!head || !/my courses/i.test(head.textContent || '')) continue;
      const body = li.querySelector('.sidebar-accordion-body');
      if (!body) continue;
      return { li, head, list: body.querySelector('.os-content') || body };
    }
    return null;
  }

  function paintBtn() {
    if (!nav) return;
    const btn = nav.btn;
    const on = prefs.courseSort === 'az';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Bỏ sắp xếp A–Z' : 'Sắp xếp môn học A–Z';
    btn.style.opacity = on ? '1' : '.5';
    btn.style.background = on ? 'rgba(127,127,127,.2)' : 'transparent';
    btn.style.borderColor = on ? 'rgba(127,127,127,.45)' : 'transparent';
  }

  function mount(host) {
    if (nav && nav.btn && nav.btn.isConnected) nav.btn.remove();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lhu-sort-btn';
    btn.textContent = 'A–Z';
    btn.style.cssText = [
      'float:right', 'margin:-1px 26px 0 6px', 'padding:1px 7px',
      'border:1px solid transparent', 'border-radius:5px', 'background:transparent',
      'color:inherit', 'font:inherit', 'font-size:.68rem', 'font-weight:800',
      'letter-spacing:.03em', 'line-height:1.7', 'cursor:pointer', 'opacity:.5',
      'transition:opacity .15s,background-color .15s,border-color .15s'
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    btn.addEventListener('mouseenter', () => {
      if (prefs.courseSort !== 'az') btn.style.background = 'rgba(127,127,127,.16)';
    });
    btn.addEventListener('mouseleave', () => {
      if (prefs.courseSort !== 'az') btn.style.background = 'transparent';
    });
    const text = host.head.querySelector('.text') || host.head;
    text.insertAdjacentElement('afterend', btn);
    host.head.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    host.head.addEventListener('mouseleave', () => { if (prefs.courseSort !== 'az') btn.style.opacity = '.5'; });

    nav = { host, list: host.list, btn, original: [] };
    paintBtn();
  }

  function reorder(list, ordered, current) {
    if (!current.length) return;
    const marker = document.createComment('lhu-sort');
    current[0].before(marker);
    for (const el of ordered) el.remove();
    for (const el of ordered) marker.before(el);
    marker.remove();
  }

  function applySort() {
    const host = findList();
    if (!host) {
      nav = null;
      return;
    }
    if (!nav || nav.list !== host.list || !nav.btn || !nav.btn.isConnected) mount(host);
    const list = host.list;
    const items = [...list.children].filter(el =>
      el.tagName === 'LI' && el.querySelector('a[href*="/course/view.php?id="]')
    );
    if (!items.length) return;
    if (!nav.original.length || !nav.original.every(el => list.contains(el))) {
      nav.original = items.slice();
    }
    const ordered = prefs.courseSort === 'az'
      ? items.slice().sort(cmp)
      : nav.original.filter(el => list.contains(el));
    if (ordered.length === items.length && ordered.every((el, i) => el === items[i])) return;
    reorder(list, ordered, items);
  }

  function toggle() {
    const next = prefs.courseSort === 'az' ? 'off' : 'az';
    prefs = { ...prefs, courseSort: next };
    paintBtn();
    applySort();
    LHU.setPrefs({ courseSort: next }).then((p) => {
      prefs = p;
      paintBtn();
      applySort();
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applySort, 200);
  }

  LHU.getPrefs().then((p) => {
    prefs = p;
    applySort();
  });
  LHU.onPrefs((p) => {
    const changed = p.courseSort !== prefs.courseSort;
    prefs = p;
    if (changed) {
      paintBtn();
      applySort();
    }
  });

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
