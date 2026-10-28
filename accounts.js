(() => {
  'use strict';

  const PREFS_KEY = 'lhu.v2.prefs';
  const $ = id => document.getElementById(id);
  const list = $('account-list');
  const count = $('account-count');
  const form = $('add-form');
  const fields = $('add-fields');
  const username = $('username');
  const password = $('password');
  const autoEnabled = $('auto-enabled');
  const autoHelp = $('auto-help');
  const refreshButton = $('refresh');
  const status = $('operation-status');
  const preferenceStatus = $('preference-status');
  let state = { accounts: [], selected: '', enabled: false, pending: false, status: null };
  let available = false;
  let refreshing = false;
  let refreshAgain = false;
  let refreshPromise = null;
  let busy = false;
  let busyMessage = '';
  let connectionError = '';
  let notice = null;
  let pendingTimer = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function blocked() {
    return !available || refreshing || busy || state.pending;
  }

  function hasSelected() {
    return state.accounts.some(account => account.username === state.selected);
  }

  function updateControls() {
    const disabled = blocked();
    fields.disabled = disabled;
    list.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
    autoEnabled.disabled = disabled || !hasSelected();
    autoEnabled.checked = hasSelected() && state.enabled;
    autoHelp.textContent = hasSelected()
      ? `Sử dụng MSSV ${state.selected} khi cần tự động đăng nhập.`
      : 'Chọn tài khoản bằng một lần đăng nhập thành công để bật.';
    refreshButton.disabled = refreshing || busy;
    list.setAttribute('aria-busy', String(refreshing || busy || state.pending));
  }

  function renderStatus() {
    let message = 'Sẵn sàng. Thêm hoặc đăng nhập một tài khoản đã lưu.';
    let kind = 'neutral';
    if (connectionError) {
      message = connectionError;
      kind = 'error';
    } else if (busy || state.pending) {
      message = busyMessage || 'Đang xác minh hoặc chuyển tài khoản trên Learn LHU. Vui lòng chờ; không đóng trang.';
      kind = 'pending';
    } else if (refreshing) {
      message = 'Đang cập nhật danh sách tài khoản…';
      kind = 'pending';
    } else if (notice || state.status) {
      const result = notice || state.status;
      message = result.message;
      kind = result.ok ? 'success' : 'error';
    }
    status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    status.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    status.dataset.kind = kind;
    status.textContent = message;
    updateControls();
  }

  function renderAccounts() {
    const focused = document.activeElement;
    const focusKey = focused?.dataset?.username;
    const focusAction = focused?.dataset?.action;
    count.textContent = String(state.accounts.length);
    list.replaceChildren();
    if (!state.accounts.length) {
      list.append(element('p', 'empty', available
        ? 'Chưa có tài khoản. Thêm bên dưới để xác minh và lưu.'
        : 'Chưa tải được danh sách. Mở trang từ tiện ích trong Chrome và bấm Tải lại.'));
    } else {
      const items = element('ul', 'account-items');
      for (const account of state.accounts) {
        const selected = account.username === state.selected;
        const row = element('li', `account-row${selected ? ' is-selected' : ''}`);
        const info = element('div', 'account-info');
        const nameLine = element('div', 'account-name-line');
        nameLine.append(element('span', 'account-name', account.name || 'Tài khoản Learn LHU'));
        if (selected) nameLine.append(element('span', 'selected-badge', 'Đang chọn'));
        info.append(nameLine, element('p', 'account-details', `MSSV ${account.username} · ${account.className || 'Chưa có thông tin lớp'}`));
        const actions = element('div', 'account-actions');
        const login = element('button', 'button login-button', 'Đăng nhập');
        login.type = 'button';
        login.dataset.username = account.username;
        login.dataset.action = 'switch';
        login.setAttribute('aria-label', `Đăng nhập MSSV ${account.username}${selected ? ' (thử lại tài khoản đang chọn)' : ''}`);
        const remove = element('button', 'button button-quiet delete-button', 'Xóa');
        remove.type = 'button';
        remove.dataset.username = account.username;
        remove.dataset.action = 'remove';
        remove.setAttribute('aria-label', `Xóa tài khoản MSSV ${account.username}`);
        actions.append(login, remove);
        row.append(info, actions);
        items.append(row);
      }
      list.append(items);
    }
    renderStatus();
    if (focusKey && focusAction) {
      const target = Array.from(list.querySelectorAll('button')).find(button =>
        button.dataset.username === focusKey && button.dataset.action === focusAction);
      if (target && !target.disabled) target.focus();
      else if (!refreshButton.disabled) refreshButton.focus();
    }
  }

  async function request(payload) {
    let delivery;
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('Unavailable');
      delivery = chrome.runtime.sendMessage(payload);
    } finally {
      if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
        password.value = '';
        delete payload.password;
      }
    }
    const response = await delivery;
    if (!response || typeof response.ok !== 'boolean') throw new Error('Invalid response');
    return response;
  }

  function parseList(response) {
    if (!Array.isArray(response.accounts) || typeof response.selected !== 'string'
      || typeof response.enabled !== 'boolean' || typeof response.pending !== 'boolean') {
      throw new Error('Invalid account list');
    }
    const accounts = response.accounts.map(account => {
      if (!account || typeof account.username !== 'string' || !/^\d{6,20}$/.test(account.username)) {
        throw new Error('Invalid account');
      }
      return {
        username: account.username,
        name: typeof account.name === 'string' ? account.name : '',
        className: typeof account.className === 'string' ? account.className : ''
      };
    });
    const operation = response.status;
    return {
      accounts,
      selected: response.selected,
      enabled: response.enabled,
      pending: response.pending,
      status: operation && typeof operation.ok === 'boolean' && typeof operation.message === 'string' && operation.message.trim()
        ? { ok: operation.ok, message: operation.message } : null
    };
  }

  function refreshAccounts() {
    clearTimeout(pendingTimer);
    if (refreshPromise) {
      refreshAgain = true;
      return refreshPromise;
    }
    refreshing = true;
    renderStatus();
    refreshPromise = (async () => {
      try {
        do {
          refreshAgain = false;
          const response = await request({ type: 'lhu:accounts-list' });
          if (!response.ok) {
            available = false;
            connectionError = response.message || 'Không thể tải tài khoản. Hãy bấm Tải lại để thử lại.';
            break;
          }
          state = parseList(response);
          available = true;
          connectionError = '';
          if (state.pending || state.status) notice = null;
          renderAccounts();
        } while (refreshAgain);
      } catch {
        available = false;
        connectionError = 'Không kết nối được với dịch vụ tài khoản của tiện ích. Hãy tải lại tiện ích trong Chrome rồi bấm Tải lại; các thao tác đang được khóa để tránh thay đổi nhầm.';
      } finally {
        refreshing = false;
        refreshPromise = null;
        renderAccounts();
        if (state.pending) pendingTimer = setTimeout(refreshAccounts, 3000);
      }
    })();
    return refreshPromise;
  }

  async function mutate(payload, progress, accepted) {
    if (blocked()) {
      if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
        password.value = '';
        delete payload.password;
      }
      return;
    }
    busy = true;
    busyMessage = progress;
    notice = null;
    renderStatus();
    let outcome = null;
    try {
      const response = await request(payload);
      outcome = { ok: response.ok, message: response.message || (response.ok ? accepted : 'Không thực hiện được yêu cầu. Hãy kiểm tra tài khoản và thử lại.') };
    } catch {
      outcome = { ok: false, message: 'Không nhận được phản hồi từ tiện ích. Thao tác có thể đã bắt đầu; hãy kiểm tra trạng thái sau khi tải lại. Phiên Learn LHU có thể đã bị đăng xuất.' };
    }
    await refreshAccounts();
    busy = false;
    busyMessage = '';
    const verifiesLogin = payload.type === 'lhu:accounts-add' || payload.type === 'lhu:accounts-switch';
    if (!outcome.ok || (!state.pending && (!verifiesLogin || !state.status))) notice = outcome;
    renderStatus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (blocked()) return;
    const id = username.value.trim();
    username.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
    if (!/^\d{6,20}$/.test(id)) {
      username.setAttribute('aria-invalid', 'true');
      notice = { ok: false, message: 'MSSV phải gồm từ 6 đến 20 chữ số.' };
      renderStatus();
      username.focus();
      return;
    }
    if (!password.value.length) {
      password.setAttribute('aria-invalid', 'true');
      notice = { ok: false, message: 'Vui lòng nhập mật khẩu để xác minh tài khoản.' };
      renderStatus();
      password.focus();
      return;
    }
    if (!window.confirm(`Thêm MSSV ${id}?\n\nTiện ích sẽ đăng xuất phiên Learn LHU hiện tại và đăng nhập thật bằng tài khoản vừa nhập để xác minh. Nếu đăng nhập thất bại, bạn có thể bị để ở trạng thái đã đăng xuất.\n\nMật khẩu sẽ được lưu trong hồ sơ Chrome trên máy này sau khi xác minh thành công. Bạn có muốn tiếp tục?`)) {
      password.value = '';
      return;
    }
    username.value = id;
    void mutate({ type: 'lhu:accounts-add', username: id, password: password.value, confirm: true },
      `Đang xác minh MSSV ${id} bằng đăng nhập thật. Vui lòng chờ…`,
      'Đã gửi yêu cầu xác minh. Tài khoản chỉ được lưu sau khi đăng nhập thành công.');
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !list.contains(button) || blocked()) return;
    const id = button.dataset.username;
    if (button.dataset.action === 'switch') {
      if (!window.confirm(`Đăng nhập MSSV ${id}?\n\nTiện ích sẽ đăng xuất phiên Learn LHU hiện tại rồi đăng nhập tài khoản này. Nếu thất bại, bạn có thể bị để ở trạng thái đã đăng xuất. Bạn có muốn tiếp tục?`)) return;
      void mutate({ type: 'lhu:accounts-switch', username: id, confirm: true },
        `Đang đăng nhập MSSV ${id}. Vui lòng chờ…`, 'Đã gửi yêu cầu đăng nhập. Đang chờ kết quả xác minh.');
    } else if (button.dataset.action === 'remove') {
      if (!window.confirm(`Xóa tài khoản MSSV ${id} và mật khẩu đã lưu khỏi hồ sơ Chrome này?${id === state.selected ? '\n\nĐây là tài khoản đang chọn để tự động đăng nhập.' : ''}`)) return;
      void mutate({ type: 'lhu:accounts-remove', username: id }, 'Đang xóa tài khoản…', 'Đã xóa tài khoản đã lưu.');
    }
  });

  autoEnabled.addEventListener('change', () => {
    const enabled = autoEnabled.checked;
    if (blocked() || !hasSelected()) {
      updateControls();
      return;
    }
    void mutate({ type: 'lhu:accounts-enable', enabled }, 'Đang cập nhật tự động đăng nhập…',
      enabled ? 'Đã bật tự động đăng nhập.' : 'Đã tắt tự động đăng nhập.');
  });

  refreshButton.addEventListener('click', () => {
    notice = null;
    void refreshAccounts();
  });

  function applyTheme(prefs) {
    document.documentElement.dataset.theme = prefs?.theme === 'dark' ? 'dark' : 'light';
  }

  async function initializeTheme() {
    try {
      if (!globalThis.chrome?.storage?.local) throw new Error('Unavailable');
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[PREFS_KEY]) applyTheme(changes[PREFS_KEY].newValue);
      });
      const saved = await chrome.storage.local.get(PREFS_KEY);
      applyTheme(saved[PREFS_KEY]);
    } catch {
      preferenceStatus.textContent = 'Không đọc được tùy chọn giao diện trong Chrome. Tạm dùng giao diện sáng.';
      preferenceStatus.hidden = false;
      applyTheme(null);
    }
  }

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(message => {
      if (message?.type !== 'lhu:accounts-changed') return;
      notice = null;
      void refreshAccounts();
    });
  }
  window.addEventListener('focus', () => { void refreshAccounts(); });
  void initializeTheme();
  void refreshAccounts();
})();
