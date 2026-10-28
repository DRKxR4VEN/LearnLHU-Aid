(() => {
  'use strict';
  const LHU = globalThis.LHU;
  if (!LHU || LHU.session || !document.body) return;
  LHU.session = true;
  LHU.sessionInvalid = false;

  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  let identityPromise;
  let checking = false;
  let noticeHost;
  let reminder;

  function sessionUser(doc = document) {
    if (doc === document && LHU.sessionInvalid) return { loggedIn: false, userId: '', name: '' };
    const menu = doc.querySelector('.usermenu');
    const guest = !!menu?.querySelector('.login, .badge-guest');
    const logout = menu?.querySelector('a[href*="/login/logout.php"]');
    const profile = menu?.querySelector('a[href*="/user/profile.php"]');
    const userId = profile ? new URL(profile.getAttribute('href'), location.origin).searchParams.get('id') || '' : '';
    return { loggedIn: !guest && !!logout, userId, name: text(menu?.querySelector('.usertext, .dropdown-author')) };
  }

  async function requestDoc(url, init = {}) {
    const target = new URL(url, location.origin);
    if (target.origin !== location.origin) throw new Error('Địa chỉ đăng nhập không thuộc Learn LHU.');
    const response = await fetch(target.href, { credentials: 'same-origin', ...init });
    if (!response.ok) throw new Error(`Máy chủ Learn LHU trả lỗi HTTP ${response.status}. Hãy thử lại sau.`);
    if (new URL(response.url).origin !== location.origin) throw new Error('Website chuyển sang dịch vụ khác. Hãy đăng nhập trực tiếp trên website.');
    return { doc: new DOMParser().parseFromString(await response.text(), 'text/html'), url: response.url };
  }

  function fieldValue(doc, pattern) {
    for (const dt of doc.querySelectorAll('dt')) {
      if (pattern.test(text(dt))) return text(dt.nextElementSibling);
    }
    return '';
  }

  async function readIdentity(doc = document, signal = AbortSignal.timeout(20000)) {
    const user = sessionUser(doc);
    if (!user.loggedIn) throw new Error('Chưa có phiên đăng nhập sinh viên.');
    const { doc: edit, url } = await requestDoc('/user/edit.php', { signal });
    if (/change_password/.test(new URL(url).pathname)) throw new Error('Máy chủ yêu cầu đổi mật khẩu. Hãy đổi trực tiếp trên Learn LHU rồi cập nhật tài khoản đã lưu.');
    if (!sessionUser(edit).loggedIn) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    const current = sessionUser(edit);
    if (user.userId && current.userId !== user.userId) throw new Error('Phiên đăng nhập vừa thay đổi ở tab khác. Hãy tải lại trang.');
    const username = (edit.querySelector('[name="idnumber"]')?.value || fieldValue(edit, /^(mssv|mã.*sinh viên|id number)$/i)).trim();
    const className = (edit.querySelector('[name="profile_field_ClassID"], [name="profile_field_class"]')?.value || fieldValue(edit, /^(class(id)?|lớp)$/i)).trim();
    return { userId: current.userId || user.userId, name: current.name || user.name, username, className };
  }

  function getIdentity() {
    if (!identityPromise) identityPromise = readIdentity();
    return identityPromise;
  }

  async function send(message) {
    if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('Hãy tải lại tiện ích LHU Aid để dùng quản lý tài khoản.');
    return chrome.runtime.sendMessage(message);
  }

  function showNotice(message, reload = false) {
    if (!noticeHost) {
      noticeHost = document.createElement('div');
      noticeHost.id = 'lhu-account-notice';
      const sr = noticeHost.attachShadow({ mode: 'open' });
      sr.innerHTML = `<style>${LHU.THEME_CSS}
        :host { all:initial; } * { box-sizing:border-box; }
        .box { position:fixed; top:75px; right:18px; width:340px; max-width:calc(100vw - 36px); z-index:2147483100; padding:14px 16px; border:1px solid var(--line2); border-left:4px solid var(--gold); border-radius:12px; background:var(--bg); color:var(--fg); box-shadow:var(--shadow); font:13px/1.5 -apple-system,"Segoe UI",sans-serif; }
        .message { margin-right:20px; overflow-wrap:anywhere; }
        button { border:0; border-radius:6px; color:var(--accent); background:var(--accent-bg); padding:5px 9px; font:inherit; cursor:pointer; margin-top:9px; }
        .close { position:absolute; top:4px; right:9px; background:transparent; color:var(--fg2); font-size:18px; padding:0 4px; }
      </style><div class="box" role="alert"><button class="close" aria-label="Đóng">×</button><div class="message"></div><button class="manage">Tài khoản</button><button class="reload" hidden>Tải lại trang</button></div>`;
      sr.querySelector('.close').onclick = () => { noticeHost.remove(); noticeHost = null; };
      sr.querySelector('.manage').onclick = openAccounts;
      sr.querySelector('.reload').onclick = () => location.reload();
      document.documentElement.appendChild(noticeHost);
      LHU.getPrefs().then(p => { if (noticeHost) LHU.applyPrefs(noticeHost, p); });
    }
    noticeHost.shadowRoot.querySelector('.message').textContent = message;
    noticeHost.shadowRoot.querySelector('.reload').hidden = !reload;
  }

  async function openAccounts() {
    try {
      const result = await send({ type: 'lhu:open-accounts' });
      if (!result?.ok) showNotice(result?.message || 'Không mở được quản lý tài khoản.');
    } catch (e) { showNotice(e.message); }
  }

  async function login(auth) {
    const signal = AbortSignal.timeout(60000);
    let result;
    try {
      let page = await requestDoc('/login/index.php', { signal });
      const logoutForm = [...page.doc.forms].find(form => new URL(form.getAttribute('action') || '', location.origin).pathname === '/login/logout.php');
      if (sessionUser(page.doc).loggedIn || logoutForm) {
        if (auth.kind === 'auto') throw new Error('Một tab khác đã đăng nhập. Tiện ích không tự đổi tài khoản của phiên này.');
        if (logoutForm) {
          const action = new URL(logoutForm.getAttribute('action'), location.origin);
          const token = logoutForm.querySelector('[name="sesskey"]')?.value;
          if (!token) throw new Error('Không lấy được mã xác nhận đăng xuất. Hãy đăng xuất trực tiếp rồi thử lại.');
          const params = new URLSearchParams({ sesskey: token, loginpage: '1' });
          if (logoutForm.method.toLowerCase() === 'post') await requestDoc(action.href, { method: 'POST', body: params, signal });
          else { action.search = params.toString(); await requestDoc(action.href, { signal }); }
        } else {
          const link = page.doc.querySelector('.usermenu a[href*="/login/logout.php"]');
          await requestDoc(link.getAttribute('href'), { signal });
        }
        page = await requestDoc('/login/index.php', { signal });
      }
      const input = page.doc.querySelector('form input[name="username"]:not([type="hidden"])');
      const form = input?.form;
      if (!form || !form.querySelector('input[name="password"]')) throw new Error('Website không còn dùng biểu mẫu đăng nhập quen thuộc. Hãy đăng nhập trực tiếp.');
      const action = new URL(form.getAttribute('action') || '/login/index.php', location.origin);
      if (action.origin !== location.origin || action.pathname !== '/login/index.php') throw new Error('Biểu mẫu chuyển sang dịch vụ khác. Hãy đăng nhập trực tiếp.');
      const token = form.querySelector('[name="logintoken"]')?.value;
      if (!token) throw new Error('Không lấy được mã bảo vệ đăng nhập. Hãy tải lại trang và thử lại.');
      const params = new URLSearchParams({ username: auth.username, password: auth.password, logintoken: token, anchor: '' });
      page = await requestDoc(action.href, { method: 'POST', body: params, signal });
      auth.password = '';
      const path = new URL(page.url).pathname;
      if (/change_password/.test(path)) throw new Error('Máy chủ yêu cầu đổi mật khẩu. Hãy đổi trực tiếp trên Learn LHU rồi cập nhật tài khoản đã lưu.');
      if (!sessionUser(page.doc).loggedIn) {
        const error = text(page.doc.querySelector('#loginerrormessage, .loginerrors, .login-box .alert-danger'));
        if (/invalid login|invalid.*password|không.*đúng|sai.*(mật khẩu|đăng nhập)/i.test(error)) {
          throw new Error('MSSV hoặc mật khẩu không đúng. Nếu vừa đổi mật khẩu, hãy cập nhật thông tin đã lưu; máy chủ không cho biết thông tin nào sai.');
        }
        if (error) throw new Error(`Learn LHU: ${error.slice(0, 240)}`);
        throw new Error('Website chưa xác nhận đăng nhập. Có thể cần xác minh hoặc chấp nhận điều khoản; hãy đăng nhập trực tiếp.');
      }
      const identity = await readIdentity(page.doc, signal);
      if (identity.username !== auth.username) throw new Error('MSSV trong hồ sơ không khớp tài khoản vừa nhập. Không lưu thông tin đăng nhập này.');
      if (!identity.name || !identity.userId) throw new Error('Đã đăng nhập nhưng không đọc được danh tính sinh viên. Không lưu tài khoản.');
      result = { ok: true, ...identity };
    } catch (e) {
      const message = e.name === 'TimeoutError' || e.name === 'AbortError'
        ? 'Đăng nhập quá thời gian chờ. Kiểm tra kết nối rồi thử lại.'
        : e instanceof TypeError ? 'Không kết nối được Learn LHU. Kiểm tra mạng rồi thử lại.' : e.message;
      result = { ok: false, message };
    } finally { auth.password = ''; }
    const response = await send({ type: 'lhu:auth-finish', id: auth.id, result });
    if (!response) { showNotice('Không nhận được kết quả từ tiện ích. Hãy mở Tài khoản để kiểm tra.'); return; }
    if (response.ok) location.assign(`${location.origin}/my/`);
    else {
      showNotice(response.message || result.message, true);
      if (sessionUser().loggedIn) location.assign(`${location.origin}/?redirect=0`);
    }
  }

  async function checkAuth() {
    if (checking || LHU.sessionInvalid || !globalThis.chrome?.runtime?.sendMessage) return;
    checking = true;
    try {
      const response = await send({ type: 'lhu:auth-ready', loggedIn: sessionUser().loggedIn });
      if (response?.auth) { showNotice('Đang đăng nhập vào tài khoản đã chọn…'); await login(response.auth); }
      else if (response?.status) showNotice(response.status.message);
    } catch (e) { showNotice('Không liên lạc được tiện ích. Hãy tải lại trang để thử lại.'); }
    finally { checking = false; }
  }

  function mountControls() {
    const menu = document.querySelector('.c-user-menu') || document.querySelector('.usermenu');
    if (!menu) return;
    const host = document.createElement('div');
    host.id = 'lhu-account-controls';
    const sr = host.attachShadow({ mode: 'open' });
    const home = location.pathname === '/' || /^\/login\//.test(location.pathname);
    sr.innerHTML = `<style>${LHU.THEME_CSS}
      :host { all:initial; display:inline-flex; margin-right:10px; }
      .tools { display:flex; align-items:center; gap:5px; font:12px -apple-system,"Segoe UI",sans-serif; }
      button { height:32px; border:1px solid var(--line2); border-radius:8px; padding:0 9px; background:var(--bg2); color:var(--fg); font:inherit; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; }
      button:hover { color:var(--accent); border-color:var(--accent); }
      svg { width:17px; height:17px; }
    </style><div class="tools">${home ? '<button class="theme" aria-label="Đổi nền sáng/tối"></button>' : ''}<button class="accounts">Tài khoản</button></div>`;
    menu.before(host);
    sr.querySelector('.accounts').onclick = openAccounts;
    const theme = sr.querySelector('.theme');
    const paint = p => {
      LHU.applyPrefs(host, p);
      if (theme) {
        theme.innerHTML = p.theme === 'dark' ? LHU.ICONS.sun : LHU.ICONS.moon;
        theme.title = p.theme === 'dark' ? 'Chuyển nền sáng' : 'Chuyển nền tối';
        theme.setAttribute('aria-label', theme.title);
      }
    };
    if (theme) theme.onclick = async () => {
      const p = await LHU.getPrefs();
      paint(await LHU.setPrefs({ theme: p.theme === 'dark' ? 'light' : 'dark' }));
    };
    LHU.getPrefs().then(paint);
    LHU.onPrefs(paint);
  }

  function mountReminder() {
    if (!/^\/my(\/|$)/i.test(location.pathname) || !sessionUser().loggedIn) return;
    const header = document.querySelector('#page-header');
    if (!header) return;
    reminder = document.createElement('section');
    reminder.id = 'lhu-session-reminder';
    const sr = reminder.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${LHU.THEME_CSS}
      :host { all:initial; display:block; margin:12px 0 20px; }
      .reminder { padding:14px 20px; border:1px solid var(--line2); border-left:5px solid var(--gold); border-radius:12px; background:var(--bg2); color:var(--fg); font-family:-apple-system,"Segoe UI",sans-serif; }
      .small { margin:0 0 5px; color:var(--fg2); font-size:12px; font-weight:600; letter-spacing:.03em; }
      h2 { margin:0; color:var(--brand); font-size:clamp(17px,2vw,24px); font-weight:750; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      button { margin-top:8px; border:0; border-radius:6px; background:var(--accent-bg); color:var(--accent); padding:5px 9px; cursor:pointer; }
    </style><div class="reminder"><p class="small">Đăng trong phiên đăng nhập của</p><h2></h2><button hidden>Tải lại trang</button></div>`;
    sr.querySelector('h2').textContent = `${sessionUser().name} — Đang đọc MSSV…`;
    sr.querySelector('button').onclick = () => location.reload();
    header.after(reminder);
    LHU.getPrefs().then(p => LHU.applyPrefs(reminder, p));
    LHU.onPrefs(p => LHU.applyPrefs(reminder, p));
    getIdentity().then(identity => {
      if (LHU.sessionInvalid) return;
      const heading = sr.querySelector('h2');
      heading.textContent = `${identity.name} - ${identity.username || 'Hồ sơ chưa có MSSV'}`;
      heading.title = heading.textContent;
    }).catch(e => {
      sr.querySelector('h2').textContent = `${sessionUser().name} - Chưa đọc được MSSV`;
      sr.querySelector('h2').title = e.message;
      sr.querySelector('button').hidden = false;
    });
  }

  Object.assign(LHU, { sessionUser, isLoggedIn: () => sessionUser().loggedIn, getIdentity, readIdentity, openAccounts });
  mountControls();
  mountReminder();
  LHU.onPrefs(p => { if (noticeHost) LHU.applyPrefs(noticeHost, p); });
  globalThis.chrome?.runtime?.onMessage?.addListener(message => {
    if (message.type === 'lhu:auth-check' && location.pathname === '/') checkAuth();
    if (message.type !== 'lhu:session-changed') return;
    LHU.sessionInvalid = true;
    document.dispatchEvent(new CustomEvent('lhu:session'));
    if (reminder) {
      reminder.shadowRoot.querySelector('.small').textContent = 'Phiên đăng nhập đã thay đổi';
      reminder.shadowRoot.querySelector('h2').textContent = 'Tải lại trang để xem tài khoản hiện tại';
      reminder.shadowRoot.querySelector('button').hidden = false;
    }
    showNotice('Phiên Learn LHU đã đổi ở tab khác. Tải lại trang để dùng đúng tài khoản hiện tại.', true);
  });
  checkAuth();
})();
