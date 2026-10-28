(() => {
  'use strict';
  const LHU = globalThis.LHU = globalThis.LHU || {};
  if (LHU.shared) return;
  LHU.shared = true;

  const PREFS_KEY = 'lhu.v2.prefs';
  const THEME_MIRROR_KEY = 'lhu.v2.theme';
  const FS_STEPS = [0.9, 1, 1.15, 1.3];
  const COL_STEPS = [2, 3, 4, 5];
  const OVERDUE_DAYS = [7, 14, 30, 90];
  const DEFAULT = { theme: 'light', fs: 1, pinned: false, cols: 4, overdueDays: 14, courseSort: 'off' };

  const hasStore = () => !!(globalThis.chrome?.storage?.local);
  let cached = null;

  function clean(raw) {
    const p = { ...DEFAULT, ...(raw || {}) };
    if (p.theme !== 'dark') p.theme = 'light';
    p.fs = FS_STEPS.includes(Number(p.fs)) ? Number(p.fs) : 1;
    p.cols = COL_STEPS.includes(Number(p.cols)) ? Number(p.cols) : 4;
    p.overdueDays = OVERDUE_DAYS.includes(Number(p.overdueDays)) ? Number(p.overdueDays) : 14;
    p.courseSort = p.courseSort === 'az' ? 'az' : 'off';
    p.pinned = !!p.pinned;
    return p;
  }

  function writeMirror(theme) {
    try {
      localStorage.setItem(THEME_MIRROR_KEY, theme);
    } catch (e) {
      /* storage blocked: the async prefs still work */
    }
  }

  function readThemeMirror() {
    try {
      const t = localStorage.getItem(THEME_MIRROR_KEY);
      return t === 'dark' || t === 'light' ? t : null;
    } catch (e) {
      return null;
    }
  }

  async function getPrefs() {
    if (!cached) {
      let raw = null;
      try {
        if (hasStore()) raw = (await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY];
        else raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      } catch (e) {
        raw = null;
      }
      cached = clean(raw);
      writeMirror(cached.theme);
    }
    return { ...cached };
  }

  function emit() {
    try {
      document.dispatchEvent(new CustomEvent('lhu:prefs', { detail: { ...cached } }));
    } catch (e) {
      /* no DOM: ignore */
    }
  }

  async function setPrefs(patch) {
    cached = clean({ ...(await getPrefs()), ...patch });
    writeMirror(cached.theme);
    try {
      if (hasStore()) await chrome.storage.local.set({ [PREFS_KEY]: cached });
      else localStorage.setItem(PREFS_KEY, JSON.stringify(cached));
    } catch (e) {
      /* storage full or blocked: keep the in-memory value */
    }
    emit();
    return { ...cached };
  }

  function applyPrefs(host, prefs) {
    host.setAttribute('data-theme', prefs.theme === 'dark' ? 'dark' : 'light');
    host.setAttribute('data-cols', String(prefs.cols || 4));
    host.style.setProperty('--lhu-fs', String(prefs.fs || 1));
    host.style.setProperty('--cols', String(prefs.cols || 4));
  }

  function onPrefs(cb) {
    document.addEventListener('lhu:prefs', (e) => cb(e.detail));
    if (!globalThis.chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[PREFS_KEY]) return;
      cached = clean(changes[PREFS_KEY].newValue);
      writeMirror(cached.theme);
      cb({ ...cached });
    });
  }

  function courseNameKey(value) {
    return String(value || '')
      .normalize('NFC')
      .toLocaleLowerCase('vi')
      .replace(/[^\p{L}]/gu, '');
  }

  function compareCourseNames(a, b) {
    return courseNameKey(a).localeCompare(courseNameKey(b), 'vi', { sensitivity: 'base' });
  }

  const THEME_CSS = `
    :host {
      --bg: #ffffff;
      --bg2: #f7f9fd;
      --bg3: #edf2fa;
      --fg: #17233a;
      --fg2: #66738c;
      --line: #e5ebf5;
      --line2: #ced9ea;
      --brand: #17395f;
      --accent: #2f6feb;
      --accent-bg: #eaf1fe;
      --gold: #f2c14e;
      --danger: #d64545;
      --ok: #23915c;
      --tile: linear-gradient(150deg, #1b3c6b, #3b46c9);
      --shadow: 0 20px 55px rgba(15, 44, 77, .18);
      --shadow-sm: 0 1px 2px rgba(15, 44, 77, .07);
    }
    :host([data-theme="dark"]) {
      --bg: #141d2e;
      --bg2: #182339;
      --bg3: #20304a;
      --fg: #e9effb;
      --fg2: #9aa9c4;
      --line: #26344f;
      --line2: #37496a;
      --brand: #d7e4ff;
      --accent: #7aa2ff;
      --accent-bg: #1c2c4e;
      --gold: #f4cb62;
      --danger: #ff8585;
      --ok: #5dd39e;
      --tile: linear-gradient(150deg, #1b3c6b, #3b46c9);
      --shadow: 0 20px 55px rgba(0, 0, 0, .5);
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, .35);
    }
  `;

  // Page-wide dark theme for the Moodle "space" theme. Every rule is scoped to
  // html[data-lhu-theme="dark"] so toggling the attribute is instant and the
  // stylesheet can stay mounted.
  const PAGE_CSS = `
    html[data-lhu-theme="dark"] {
      color-scheme: dark;
      --lhu-page: #0e1622;
      --lhu-surface: #16202f;
      --lhu-surface-2: #1b2738;
      --lhu-surface-3: #223047;
      --lhu-border: #29384f;
      --lhu-text: #e4ecf9;
      --lhu-muted: #9aabc4;
      --lhu-link: #8db4ff;
      background: var(--lhu-page) !important;
      scrollbar-color: #3b4d69 #0e1622;
    }
    html[data-lhu-theme="dark"] body {
      background: var(--lhu-page) !important;
      color: var(--lhu-text) !important;
    }
    /* The theme animates colors with transition: all; without this the dark
       palette keeps restarting its transition and never reaches the target. */
    html[data-lhu-theme="dark"] :is(#nav-drawer, #nav-drawer *, .s-top, .s-top *, .s-footer, .s-footer *, .navbar, .message-drawer, .message-drawer *, .message-drawer-toggle, .popover-region-container, .drawer, .block, .card, .accordion, .list-group-item, .btn, .btn-msg, .sidebar-btn, .c-nav-user, .c-logo-mobile) {
      transition: none !important;
    }
    html[data-lhu-theme="dark"] #page,
    html[data-lhu-theme="dark"] #page-wrapper,
    html[data-lhu-theme="dark"] #page-content,
    html[data-lhu-theme="dark"] #region-main,
    html[data-lhu-theme="dark"] #region-main-box,
    html[data-lhu-theme="dark"] .container-fluid,
    html[data-lhu-theme="dark"] .c-container,
    html[data-lhu-theme="dark"] #page-header,
    html[data-lhu-theme="dark"] .c-header-content,
    html[data-lhu-theme="dark"] :is(.page-header, .c-page-header, .c-header) {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] :is(.card-header, .card-footer) {
      background-color: transparent !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(.card, .block, .coursebox, .c-course-box, .modal-content, .modal-body, .modal-header, .modal-footer, .popover-region-container, .popover-region-header-container, .popover-region-footer-container, .message-drawer, .drawer, .dropdown-menu, .popover, .generalbox, .box, .well, .mform fieldset, .filemanager, .filepicker, .atto, .editor, .que, .submissionstatustable, .gradingtable, .assignfeedbackcomments, .feedback, .forumpost, .post) {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    /* Quiz question headers keep a white #fff plate of their own. */
    html[data-lhu-theme="dark"] .que .info {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    /* Answer rows use pastel semantic fills; keep the meaning, drop the glare. */
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).correct {
      background-color: rgba(16, 194, 119, .14) !important;
      border-color: rgba(16, 194, 119, .45) !important;
    }
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).correct *,
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).incorrect *,
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).partiallycorrect * {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).incorrect {
      background-color: rgba(229, 72, 77, .16) !important;
      border-color: rgba(229, 72, 77, .45) !important;
    }
    html[data-lhu-theme="dark"] .que .answer :is(.r0, .r1).partiallycorrect {
      background-color: rgba(245, 166, 35, .16) !important;
      border-color: rgba(245, 166, 35, .45) !important;
    }
    /* Review-page state/grade chips use a saturated green with pale text. */
    html[data-lhu-theme="dark"] .que :is(.state, .grade) {
      background-color: rgba(16, 194, 119, .16) !important;
      border-color: rgba(16, 194, 119, .45) !important;
      color: #9df3c8 !important;
    }
    html[data-lhu-theme="dark"] .que.incorrect :is(.state, .grade) {
      background-color: rgba(229, 72, 77, .18) !important;
      border-color: rgba(229, 72, 77, .45) !important;
      color: #ffb3ae !important;
    }
    html[data-lhu-theme="dark"] .que.partiallycorrect :is(.state, .grade) {
      background-color: rgba(245, 166, 35, .18) !important;
      border-color: rgba(245, 166, 35, .45) !important;
      color: #ffd28a !important;
    }
    html[data-lhu-theme="dark"] :is(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] :is(.text-muted, .dimmed_text, .dimmed, small, .small, .form-text, .help-block, .breadcrumb, .breadcrumb-item, .c-top-text, .s-footer, .s-footer *, .course-contacts, .c-courses-teacher-name, .coursecat, .coursecat a, .course-box-content-desc, .paging, .paging-bar, .resourcelinkdetails, .description, .section-summary, .summary, .muted, .course-contacts-toggle-btn) {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] a {
      transition: none !important;
    }
    /* The theme paints dozens of link variants (backlinks, print icons, lang
       menu…) with a white background; flatten them so only our chips show. */
    html[data-lhu-theme="dark"] a:not(.btn):not(.nav-link):not(.dropdown-item):not(.list-group-item):not(.page-link):not(.badge):not(.close) {
      background-color: transparent !important;
      border-color: transparent !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] a:not(.btn):hover {
      color: #c2d6ff !important;
    }
    html[data-lhu-theme="dark"] body #nav-drawer[class],
    html[data-lhu-theme="dark"] #nav-drawer .os-viewport,
    html[data-lhu-theme="dark"] #nav-drawer .os-content,
    html[data-lhu-theme="dark"] #nav-drawer .os-content-glue,
    html[data-lhu-theme="dark"] #nav-drawer .drawercontent {
      background-color: var(--lhu-surface) !important;
      background-image: none !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer :is(a, span, div) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] body #nav-drawer .list-group-item,
    html[data-lhu-theme="dark"] body #nav-drawer .accordion {
      background-color: var(--lhu-surface) !important;
      border-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer :is(.list-group-item, a, .c-nav-item-container):hover {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer :is(.list-group-item, a, .c-nav-item-container):hover :is(a, span, div, .text) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer .list-group-item.active {
      background-color: #1f3b62 !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer .list-group-item.active :is(a, span, div) {
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer .nav-icon i {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] body .s-top[class] {
      background-color: var(--lhu-surface) !important;
      background-image: none !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .s-top :is(a, .nav-link, .dropdown-toggle, .c-top-text, strong) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] body .s-top :is(.nav-link, .c-custom-nav-btn, .sidebar-btn, .mobile-topbar-btn, .c-nav-user, .c-logo-mobile, .message-drawer-toggle)[class] {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] body :is(.c-logo-mobile, .message-drawer-toggle)[class] {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] .s-top :is(.c-custom-nav-btn, .sidebar-btn, .mobile-topbar-btn):hover {
      background-color: var(--lhu-surface-2) !important;
    }
    /* The theme gives language/message/user menu toggles a white plate. */
    html[data-lhu-theme="dark"] body :is(.s-top, .navbar, .c-lang-menu, .action-menu, .usermenu, .c-nav-user, #nav-drawer, .drawer) .dropdown-toggle {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    /* The LHES logo is navy-on-transparent, so it disappears into the dark
       drawer; brighten it instead of adding a white plate. */
    html[data-lhu-theme="dark"] body :is(#nav-drawer, .drawer) .logo {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] body :is(#nav-drawer, .drawer) .logo img {
      filter: brightness(1.9) saturate(1.1) !important;
    }
    /* The space theme hardcodes #424242 on its chrome controls, so icons and
       labels that inherit that color vanish against the dark surfaces. */
    html[data-lhu-theme="dark"] body :is(.s-top, .navbar, #nav-drawer, .drawer, .s-footer, .block, .card) :is(.mobile-topbar-btn, .sidebar-btn, .c-custom-nav-btn, .c-nav-user, .c-logo-mobile, .message-drawer-toggle, .nav-link, .btn-icon) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] body :is(.s-top, .navbar, #nav-drawer, .drawer, .s-footer, .block, .card) :is(i.fa, i.fas, i.far, i.fab, i.icon) {
      color: inherit !important;
    }
    html[data-lhu-theme="dark"] body :is(.accordion-icon, .accordion .accordion-icon, .has-arrow .accordion-icon) {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] body :is(.block_action, .block-controls, .action-menu, .actions) :is(i, a, .icon, .dropdown-toggle) {
      color: var(--lhu-muted) !important;
    }
    /* Catch-all for the theme's default #424242 glyphs, leaving status colors
       (text-*, stars, checks, bullets) alone so they keep their meaning. */
    html[data-lhu-theme="dark"] body :is(i.icon, i.fa, i.fas, i.far, i.fab):not([class*="text-"]):not([class*="fa-star"]):not([class*="fa-check"]):not([class*="fa-circle"]):not([class*="fa-times"]):not([class*="fa-eye"]) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .s-footer {
      background-color: var(--lhu-surface) !important;
      border-top: 1px solid var(--lhu-border) !important;
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] body .s-footer a[class],
    html[data-lhu-theme="dark"] body .s-footer a {
      color: var(--lhu-link) !important;
      background-color: transparent !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] body .s-footer a[class]:hover,
    html[data-lhu-theme="dark"] body .s-footer a:hover {
      background-color: rgba(255, 255, 255, .07) !important;
    }
    html[data-lhu-theme="dark"] #nav-drawer :is(.list-group-item.active_tree_node, .active_tree_node > a, .active_tree_node > a.active) {
      background-color: var(--lhu-surface-2) !important;
      border-color: transparent !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] .dropdown-menu {
      background-color: var(--lhu-surface-2) !important;
      border: 1px solid var(--lhu-border) !important;
      box-shadow: 0 12px 34px rgba(0, 0, 0, .5) !important;
    }
    html[data-lhu-theme="dark"] .dropdown-menu :is(a, button, span, li, div) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .dropdown-item:hover,
    html[data-lhu-theme="dark"] .dropdown-item:focus {
      background-color: var(--lhu-surface-3) !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] .dropdown-divider {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .c-custom-nav {
      background-color: var(--lhu-surface-2) !important;
    }
    html[data-lhu-theme="dark"] :is(input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="range"]):not([type="color"]), select, textarea, .form-control, .form-control-static, .custom-select, .custom-file-label) {
      background-color: #101a28 !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(input, textarea)::placeholder {
      color: #7f92ad !important;
    }
    html[data-lhu-theme="dark"] :is(input, select, textarea):focus {
      border-color: #3f6fbf !important;
      box-shadow: 0 0 0 .15rem rgba(70, 120, 210, .24) !important;
    }
    /* Bootstrap's caret chevron is a dark data-URI; redraw it light so the
       dropdown arrow stays visible on the dark control. */
    html[data-lhu-theme="dark"] .custom-select {
      background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%239aabc4' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg%3E") !important;
    }
    html[data-lhu-theme="dark"] option {
      background-color: var(--lhu-surface);
      color: var(--lhu-text);
    }
    /* Chrome paints autofilled fields with its own light plate, which ignores
       background-color; an inset shadow is the only reliable way to darken it. */
    html[data-lhu-theme="dark"] input:-webkit-autofill,
    html[data-lhu-theme="dark"] input:-webkit-autofill:hover,
    html[data-lhu-theme="dark"] input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 1000px #101a28 inset !important;
      -webkit-text-fill-color: var(--lhu-text) !important;
      caret-color: var(--lhu-text);
    }
    /* Login card is a plain white box outside the usual page surfaces. */
    html[data-lhu-theme="dark"] .login-box {
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .login-box :is(.login-box-block, .login-box-body, .loginasguest-box, .login-box form) {
      color: var(--lhu-text) !important;
    }
    /* The logo is navy-on-transparent, so it vanishes into the dark card. */
    html[data-lhu-theme="dark"] .login-box-header img {
      filter: brightness(1.85) saturate(1.05) !important;
    }
    html[data-lhu-theme="dark"] .login-box hr,
    html[data-lhu-theme="dark"] .login-box :is(.hr--loginform, .hr--canloginasguest) {
      border-color: var(--lhu-border) !important;
    }
    /* Plain .btn controls (Export, Message, form submits) are white by default. */
    html[data-lhu-theme="dark"] .btn:not(.btn-primary):not(.btn-link):not(.btn-icon):not([class*="btn-outline"]):not(.btn-danger):not(.btn-success):not(.btn-warning):not(.btn-info):not(.btn-msg) {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .btn-primary {
      background-color: #2f6feb !important;
      border-color: #2f6feb !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] .btn-primary:hover {
      background-color: #3f7df5 !important;
    }
    html[data-lhu-theme="dark"] body :is(.btn-secondary, .btn-light, .btn-default, .btn-outline-secondary, .btn-outline-dark, .btn-outline-light, .btn-msg, .btn-msg-gray) {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] :is(.btn-secondary, .btn-light, .btn-default, .btn-outline-secondary, .btn-outline-dark, .btn-outline-light):hover {
      background-color: var(--lhu-surface-3) !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] body :is(.bg-white, .bg-light) {
      background-color: var(--lhu-surface) !important;
    }
    html[data-lhu-theme="dark"] body .bg-pulse-grey {
      background-color: var(--lhu-surface-2) !important;
    }
    html[data-lhu-theme="dark"] :is(.overlay-icon-container, .loading-icon) {
      background-color: transparent !important;
      color: var(--lhu-muted) !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] body :is(.emoji-picker, .emoji-preview, .emoji-picker-container) {
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] body :is(.instancename, .activityname, .activityinstance a, .sectionname, .section .sectionname) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .btn-link {
      background-color: transparent !important;
      border-color: transparent !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] .btn-outline-primary {
      background-color: transparent !important;
      border-color: #3f6fbf !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] .btn-icon {
      background-color: transparent !important;
      border-color: transparent !important;
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .btn-icon:hover {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .badge.bg-primary {
      background-color: #2f6feb !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] .badge.bg-secondary {
      background-color: #3b4c67 !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] .progress {
      background-color: var(--lhu-surface-3) !important;
    }
    html[data-lhu-theme="dark"] :is(.table, table, .generaltable, .submissions, .gradingtable, .userlist) {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] :is(.table, table) :is(th, td) {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(.table, table) thead th {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .table-striped tbody tr:nth-of-type(odd) {
      background-color: rgba(255, 255, 255, .025) !important;
    }
    html[data-lhu-theme="dark"] .table-hover tbody tr:hover {
      background-color: rgba(255, 255, 255, .05) !important;
    }
    html[data-lhu-theme="dark"] :is(.generaltable, .gradingtable, .userlist) :is(td, th) {
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    /* Moodle paints every general-table row #f8f8f8; keep status colours. */
    html[data-lhu-theme="dark"] :is(.generaltable, .gradingtable, .userlist, .submissionstatustable) tr:not(.correct):not(.incorrect):not(.partiallycorrect):not(.flagged) {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] :is(.generaltable, .gradingtable, .userlist, .submissionstatustable) tr:not(.correct):not(.incorrect):not(.partiallycorrect):not(.flagged) > :is(td, th) {
      background-color: transparent !important;
    }
    /* Grade reports and user lists use .cell.c0/.c1 for their zebra cells. */
    html[data-lhu-theme="dark"] :is(td, th).cell[class],
    html[data-lhu-theme="dark"] :is(td, th).cell {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] :is(td, th).cell.c1 {
      background-color: rgba(255, 255, 255, .025) !important;
    }
    /* File picker tiles (private files) are painted white by the theme. */
    html[data-lhu-theme="dark"] body :is(.fp-file, .fp-thumbnail, .fp-filename-icon) {
      background-color: transparent !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] body .fp-file:hover {
      background-color: var(--lhu-surface-2) !important;
    }
    html[data-lhu-theme="dark"] body .fp-file.fp-selected {
      background-color: var(--lhu-surface-3) !important;
      border-color: #3f6fbf !important;
    }
    html[data-lhu-theme="dark"] body .fp-file .fp-filename,
    html[data-lhu-theme="dark"] body .fp-filename {
      color: var(--lhu-text) !important;
    }
    /* Filetype icons are white cards with a grey glyph; invert to a dark tile. */
    html[data-lhu-theme="dark"] body :is(.fp-thumbnail, .fp-icon) img[src*="/f/"] {
      filter: invert(1) brightness(1.15) !important;
    }
    /* The same white filetype plates show up in the private-files block. */
    html[data-lhu-theme="dark"] img.icon[src*="/f/"] {
      filter: invert(1) brightness(1.1) !important;
    }
    /* Activity icons are white plates with a coloured glyph, so flip the
       plate to black and rotate the hue back. */
    html[data-lhu-theme="dark"] img.activityicon {
      filter: invert(1) hue-rotate(180deg) brightness(.95) !important;
    }
    /* File-manager restriction/help text inherits the theme's #424242. */
    html[data-lhu-theme="dark"] .fp-restrictions,
    html[data-lhu-theme="dark"] .fp-restrictions * {
      color: var(--lhu-muted) !important;
    }
    /* Participants filter panel ships flat white cards and a pale-green count. */
    html[data-lhu-theme="dark"] .filter-group {
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .filter-item {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .form-autocomplete-downarrow {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .userlist form > div > p {
      background-color: rgba(16, 194, 119, .14) !important;
      color: #7ee2b8 !important;
    }
    /* News-forum block post meta (author/date) is painted #424242 too. */
    html[data-lhu-theme="dark"] .block .post :is(.name, .date) {
      color: var(--lhu-muted) !important;
    }
    /* Warning/required markers are painted #a51f1f and disappear on dark. */
    html[data-lhu-theme="dark"] i.icon.fa-exclamation-triangle,
    html[data-lhu-theme="dark"] .fa-exclamation-triangle {
      color: #f0a93b !important;
      filter: none !important;
    }
    /* Inline <font color="red"> overdue labels are too dark to read. */
    html[data-lhu-theme="dark"] font[color="#ff0000"],
    html[data-lhu-theme="dark"] font[color="red"] {
      color: #ff7b72 !important;
    }
    /* Activity icons ship with a #f8f8f8 plate; keep the glyph, drop the plate. */
    html[data-lhu-theme="dark"] body img.icon {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    /* page-theme.js flags white document scans; invert them so they stop
       glaring out of the dark page. */
    html[data-lhu-theme="dark"] img[data-lhu-invert] {
      filter: invert(1) hue-rotate(180deg) !important;
    }
    html[data-lhu-theme="dark"] :is(.tag, .badge-light, .badge-secondary, .badge-default) {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .nav-pills .nav-link {
      background-color: transparent !important;
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .nav-pills .nav-link.active {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .qnbutton {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .moodle-dialogue :is(.moodle-dialogue-bd, .moodle-dialogue-hd, .moodle-dialogue-ft, .moodle-dialogue-wrap) {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .message-app {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-app .list-group-item-action {
      background-color: transparent !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-app .list-group-item-action:hover,
    html[data-lhu-theme="dark"] .message-app .list-group-item-action:focus {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-app .list-group-item-action .message-title {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-app :is(.message-text, .message-content) {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-app .message-mine :is(.message-text, .message-content) {
      background-color: #23406b !important;
    }
    html[data-lhu-theme="dark"] .nav-tabs {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .nav-tabs .nav-link {
      color: var(--lhu-muted) !important;
      background-color: transparent !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] .nav-tabs .nav-link.active {
      color: var(--lhu-text) !important;
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) var(--lhu-border) var(--lhu-surface) !important;
    }
    html[data-lhu-theme="dark"] body .pagination[class],
    html[data-lhu-theme="dark"] body .pagination {
      background-color: transparent !important;
      border-color: transparent !important;
    }
    html[data-lhu-theme="dark"] body .pagination .page-link[class],
    html[data-lhu-theme="dark"] body .pagination .page-link {
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] body .pagination .page-item.active .page-link[class],
    html[data-lhu-theme="dark"] body .pagination .page-item.active .page-link {
      background-color: #2f6feb !important;
      border-color: #2f6feb !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] body .pagination .page-item.disabled .page-link[class],
    html[data-lhu-theme="dark"] body .pagination .page-item.disabled .page-link {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] :is(.pagination, .page-link, .c-course-content, .course-content .content) {
      transition: none !important;
    }
    html[data-lhu-theme="dark"] .block .card-title,
    html[data-lhu-theme="dark"] .block .card-body,
    html[data-lhu-theme="dark"] .block .card-text {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .block .card-title {
      border-color: var(--lhu-border) !important;
    }
    /* Course lists (sidebar block, nav drawer, YUI file tree) paint links white
       with a small padding box; flatten them onto the dark surface. */
    html[data-lhu-theme="dark"] :is(.block_course_list, .ygtvitem, .c-course-content) a,
    html[data-lhu-theme="dark"] :is(.ygtvitem, .ygtvchildren, .c-course-content),
    html[data-lhu-theme="dark"] :is(.block_course_list, .ygtvitem) :is(a, div, li, ul) {
      background-color: transparent !important;
      border-color: transparent !important;
      transition: none !important;
    }
    html[data-lhu-theme="dark"] :is(.block_course_list, .ygtvitem) a:hover {
      background-color: rgba(255, 255, 255, .06) !important;
    }
    html[data-lhu-theme="dark"] :is(.block_course_list, .ygtvitem) a.active {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] .activity {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .course-content,
    html[data-lhu-theme="dark"] .course-content :is(.sectionname, .sectionname a, .activity, .content, .no-overflow) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course-content :is(.contentafterlink, .availabilityinfo, .section-summary, .summary) {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .page-context-header,
    html[data-lhu-theme="dark"] .page-context-header :is(h1, .page-header-headings) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .breadcrumb {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] .breadcrumb-item + .breadcrumb-item::before {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .alert {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .alert-info {
      background-color: #10243c !important;
      color: #a9c8ff !important;
      border-color: #1d3f63 !important;
    }
    html[data-lhu-theme="dark"] .alert-success {
      background-color: #0f2a1e !important;
      color: #86dcae !important;
      border-color: #1d4a32 !important;
    }
    html[data-lhu-theme="dark"] .alert-warning {
      background-color: #32260e !important;
      color: #f3ca62 !important;
      border-color: #57431a !important;
    }
    html[data-lhu-theme="dark"] .alert-danger {
      background-color: #33161a !important;
      color: #ff9f9f !important;
      border-color: #5a242a !important;
    }
    html[data-lhu-theme="dark"] .modal-content {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
      border: 1px solid var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(.modal-header, .modal-footer) {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .close {
      color: var(--lhu-text) !important;
      text-shadow: none !important;
    }
    html[data-lhu-theme="dark"] .modal-backdrop.show {
      opacity: .72;
    }
    html[data-lhu-theme="dark"] .popover-region-container :is(a, span, div, p, h1, h2, h3, h4, h5, h6) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .message-drawer :is(.header, .footer) {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(.calendar, .calendarwrapper, .calendartable) :is(td, th) {
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] :is(.calendar, .calendarwrapper, .calendartable) :is(.day, .day a, .calendar-controls a) {
      color: var(--lhu-text) !important;
    }
    /* Today keeps only a light tint in the big month grid; a full red cell
       would flood the whole column with colour. */
    html[data-lhu-theme="dark"] :is(.calendar, .calendarwrapper, .calendartable) td.today {
      background-color: rgba(229, 72, 77, .12) !important;
      color: #fff !important;
    }
    html[data-lhu-theme="dark"] .minicalendar td.today {
      background-color: #e5484d !important;
    }
    /* The generic link colour rule is highly specific, so day links inside the
       red "today" cell need an equally specific white to stay readable. */
    html[data-lhu-theme="dark"] .calendartable td.day.today :is(a, span, .day):not(.btn):not(.nav-link):not(.dropdown-item):not(.list-group-item):not(.page-link) {
      color: #fff !important;
    }
    /* Out-of-month cells ship a light diagonal-line sprite that glows on dark. */
    html[data-lhu-theme="dark"] :is(.calendar, .calendarwrapper, .calendartable) td.dayblank {
      background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 8px) !important;
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] :is(.calendar, .calendarwrapper, .calendartable) :is(.event a, .event) {
      color: var(--lhu-link) !important;
    }
    /* Event titles/descriptions are hardcoded near-black (#030916) inline spans. */
    html[data-lhu-theme="dark"] :is(.calendarwrapper, .eventlist, .block_calendar_upcoming) .event-title {
      color: var(--lhu-text) !important;
    }
    /* Event-key labels sit on a #212121 inline colour and vanish on dark. */
    html[data-lhu-theme="dark"] .eventname {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] :is(.calendarwrapper, .eventlist, .block_calendar_upcoming) :is(.description-content, .description-content *) {
      color: var(--lhu-muted) !important;
    }
    /* Event-type filter icons are black eyes on white circles; the theme
       repaints them on hover, so invert the glyph instead of recoloring it. */
    html[data-lhu-theme="dark"] :is(.calendar_event_site, .calendar_event_category, .calendar_event_course, .calendar_event_group, .calendar_event_user, .calendar_event_other) :is(i, .icon) {
      background-color: transparent !important;
      border-color: transparent !important;
      filter: invert(1) brightness(1.7);
    }
    html[data-lhu-theme="dark"] #back-to-top {
      background-color: var(--lhu-surface-2) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .navbar {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .navbar a {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course-box-title,
    html[data-lhu-theme="dark"] .course-box-title a {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course_category_tree :is(.category > .content, .s-courses, .card-deck),
    html[data-lhu-theme="dark"] .course_category_tree .category::after {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course_category_tree .c-course-content {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
      border-color: var(--lhu-border) !important;
    }
    html[data-lhu-theme="dark"] .c-course-box .courseimage {
      background-color: var(--lhu-surface-3);
    }
    /* Course-card summaries inherit the theme's #424242 body grey. */
    html[data-lhu-theme="dark"] .course-box-desc,
    html[data-lhu-theme="dark"] .course-box-desc * {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .coursecat a {
      background-color: var(--lhu-surface-3) !important;
      color: var(--lhu-link) !important;
    }
    html[data-lhu-theme="dark"] .collapseexpand,
    html[data-lhu-theme="dark"] .collapseexpand * {
      background-color: transparent !important;
      border-color: transparent !important;
      color: var(--lhu-link) !important;
      transition: none !important;
    }
    html[data-lhu-theme="dark"] .course-contacts-toggle-btn {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course--btn .btn {
      background-color: #2f6feb !important;
      border-color: #2f6feb !important;
      color: #fff !important;
    }
    /* Course-summary accordions: colored pastel headers and a #f8f8f8 body.
       Only the colors change; the accordion keeps its own markup and layout. */
    html[data-lhu-theme="dark"] .accordion .accordion-header {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] .accordion .accordion-header .btn-accordion {
      background-color: var(--lhu-surface-2) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .accordion .accordion-header .btn-accordion:hover {
      border-color: #3f6fbf !important;
    }
    html[data-lhu-theme="dark"] .accordion .accordion-header .btn-accordion :is(.sectionname, strong, b) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .accordion .accordion-icon {
      color: var(--lhu-muted) !important;
    }
    html[data-lhu-theme="dark"] .accordion .accordion-body {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
    }
    /* Collapsible course formats paint the open section #fafafa. */
    html[data-lhu-theme="dark"] .course-content li.section .content {
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] .course-content .accordion .sectiontoggle {
      background-color: var(--lhu-surface) !important;
      border-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] .course-content .accordion .sectiontoggle .sectionname {
      color: var(--lhu-text) !important;
    }
    /* Teachers write these collapsible blocks by hand, with inline pastel
       headers and a white body. Map the colors only; the block keeps its own
       markup, spacing and inline layout. */
    html[data-lhu-theme="dark"] #region-main .activity details {
      border-color: var(--lhu-border) !important;
      background-color: transparent !important;
    }
    html[data-lhu-theme="dark"] #region-main .activity details > summary {
      background-color: var(--lhu-surface-2) !important;
      border-bottom-color: var(--lhu-border) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #region-main .activity details > summary :is(span, strong, b) {
      color: var(--lhu-text) !important;
    }
    /* Inline tinted callouts and table rows would stay light and keep their
       dark ink, so drop the plate and let the body palette through. Inline
       badges keep their own plate and ink because they stay readable. */
    html[data-lhu-theme="dark"] #region-main .activity details :is(div, tr, td, th)[style*="background"] {
      background-color: transparent !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #region-main .activity details > div[style] {
      background-color: var(--lhu-surface) !important;
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #region-main .activity details [style*="color"]:not([style*="background"]) {
      color: var(--lhu-text) !important;
    }
    html[data-lhu-theme="dark"] #region-main .activity details hr {
      border-top-color: var(--lhu-border) !important;
    }
  `;

  const ICONS = {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.8"/><path d="M16.2 16.2L21 21"/></svg>`,
    sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.1"/><path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M18.7 5.3l-1.5 1.5M6.8 17.2l-1.5 1.5"/></svg>`,
    moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 14.4A8.6 8.6 0 0 1 9.6 3.6a8.8 8.8 0 1 0 10.8 10.8z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 5.7"/><path d="M20 4v7h-7"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v4.5"/><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11.5"/><path d="M7.6 10.4L12 14.8l4.4-4.4"/><path d="M4 20.5h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    assign: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M9 10.5h6M9 14.2h4"/></svg>`,
    quiz: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.8"/><path d="M9.7 9.4a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.7"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/></svg>`,
    file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.4"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/></svg>`,
    dot: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3.2"/></svg>`,
    brand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l8.8 4.1-8.8 4.1-8.8-4.1z" fill="#f2c14e"/><path d="M18.6 9.4v4.1" stroke="#e0a72c" stroke-width="1.5" stroke-linecap="round"/><circle cx="18.6" cy="14.7" r="1.15" fill="#e0a72c"/><rect x="6.4" y="16" width="11.2" height="3.1" rx="1.2" fill="#f8faff"/></svg>`
  };

  function gridIcon(n) {
    const pad = 2.1;
    const gap = 1.5;
    const w = 20;
    const h = 20;
    const cw = (w - pad * 2 - gap * (n - 1)) / n;
    const ch = (h - pad * 2 - gap) / 2;
    let rects = '';
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < n; c++) {
        const x = pad + c * (cw + gap);
        const y = pad + r * (ch + gap);
        rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0.9, cw).toFixed(2)}" height="${ch.toFixed(2)}" rx="0.7"/>`;
      }
    }
    return `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  }

  Object.assign(LHU, {
    PREFS_KEY, THEME_MIRROR_KEY, FS_STEPS, COL_STEPS, OVERDUE_DAYS,
    getPrefs, setPrefs, applyPrefs, onPrefs, readThemeMirror,
    compareCourseNames, THEME_CSS, PAGE_CSS, ICONS, gridIcon
  });
})();
