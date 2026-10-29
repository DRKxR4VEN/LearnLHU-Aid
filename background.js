'use strict';

const SITE = 'https://learn.lhu.edu.vn/';

function notifyTab(tabId, payload) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

const AUTH_OP = 'lhu.auth.operation';
const AUTH_STATUS = 'lhu.auth.status';
const AUTH_FAILED = 'lhu.auth.failed';
let authQueue = Promise.resolve();
let vaultPromise;

function vault() {
  if (!vaultPromise) vaultPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('lhu-accounts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { vaultPromise = null; reject(request.error); };
  });
  return vaultPromise;
}

async function readAccounts() {
  const db = await vault();
  return new Promise((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get('accounts');
    request.onsuccess = () => resolve(request.result || { accounts: [], selected: '', enabled: false });
    request.onerror = () => reject(request.error);
  });
}

async function writeAccounts(state) {
  const db = await vault();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put(state, 'accounts');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

function siteSender(sender) {
  return sender.frameId === 0 && Number.isInteger(sender.tab?.id) && sender.url?.startsWith(SITE);
}

function managerSender(sender) {
  return sender.url?.split('?')[0] === chrome.runtime.getURL('accounts.html');
}

function accountsChanged() {
  chrome.runtime.sendMessage({ type: 'lhu:accounts-changed' }).catch(() => {});
}

async function sessionChanged(exceptId) {
  const tabs = await chrome.tabs.query({ url: `${SITE}*` });
  for (const tab of tabs) if (tab.id !== exceptId) notifyTab(tab.id, { type: 'lhu:session-changed' });
}

// Scrape caches are keyed per student id, so a plain key list would never
// match them; drop every cache key by prefix instead.
const CACHE_KEY = /^lhu\.v2\.(?:courses|categories|category|deadlines)\./;

async function clearScrapeCache() {
  const keys = chrome.storage.local.getKeys
    ? await chrome.storage.local.getKeys()
    : Object.keys(await chrome.storage.local.get(null));
  const stale = keys.filter(key => CACHE_KEY.test(key));
  if (stale.length) await chrome.storage.local.remove(stale);
}

async function authOperation() {
  const data = await chrome.storage.session.get(AUTH_OP);
  const op = data[AUTH_OP];
  if (!op || Date.now() - op.started < 90000) return op || null;
  await chrome.storage.session.remove(AUTH_OP);
  await chrome.storage.session.set({
    [AUTH_FAILED]: op.username,
    [AUTH_STATUS]: { ok: false, tabId: op.tabId, message: 'Đăng nhập quá thời gian chờ. Kiểm tra kết nối rồi thử lại.' }
  });
  accountsChanged();
  return null;
}

async function startAuth(account, kind, tabId) {
  const op = { id: crypto.randomUUID(), username: account.username, password: account.password, kind, tabId, started: Date.now(), running: false };
  await chrome.storage.session.set({ [AUTH_OP]: op, [AUTH_STATUS]: { ok: false, message: 'Đang kiểm tra đăng nhập…', tabId } });
  accountsChanged();
  return op;
}

async function authMessage(message, sender) {
  const fromManager = managerSender(sender);
  const fromSite = siteSender(sender);
  if (!fromManager && !fromSite) return { ok: false, message: 'Yêu cầu không được phép.' };

  if (message.type === 'lhu:open-accounts' && fromSite) {
    await chrome.storage.session.set({ 'lhu.auth.sourceTab': sender.tab.id });
    await chrome.tabs.create({ url: chrome.runtime.getURL('accounts.html') });
    return { ok: true };
  }

  const op = await authOperation();
  if (message.type === 'lhu:auth-ready' && fromSite) {
    if (op) {
      if (op.tabId !== sender.tab.id || op.running || new URL(sender.url).pathname !== '/') return { ok: true, busy: true };
      op.running = true;
      await chrome.storage.session.set({ [AUTH_OP]: op });
      await sessionChanged(op.tabId);
      return { ok: true, auth: { id: op.id, kind: op.kind, username: op.username, password: op.password } };
    }
    const state = await readAccounts();
    const data = await chrome.storage.session.get([AUTH_FAILED, AUTH_STATUS]);
    const path = new URL(sender.url).pathname;
    const account = state.accounts.find(a => a.username === state.selected);
    if (path === '/' && !message.loggedIn && state.enabled && account && data[AUTH_FAILED] !== account.username) {
      const next = await startAuth(account, 'auto', sender.tab.id);
      next.running = true;
      await chrome.storage.session.set({ [AUTH_OP]: next });
      return { ok: true, auth: { id: next.id, kind: next.kind, username: next.username, password: next.password } };
    }
    const status = data[AUTH_STATUS];
    return { ok: true, status: status?.tabId === sender.tab.id && !status.ok ? status : null };
  }

  if (message.type === 'lhu:auth-finish' && fromSite) {
    if (!op || op.id !== message.id || op.tabId !== sender.tab.id || !op.running) return { ok: false };
    const result = message.result;
    const success = result?.ok === true && result.username === op.username && /^\d+$/.test(String(result.userId)) && !!result.name;
    const state = await readAccounts();
    let text;
    if (success) {
      const account = {
        username: op.username, password: op.password, userId: String(result.userId),
        name: String(result.name).slice(0, 150), className: String(result.className || '').slice(0, 100)
      };
      state.accounts = state.accounts.filter(a => a.username !== op.username);
      state.accounts.push(account);
      state.selected = op.username;
      await writeAccounts(state);
      await chrome.storage.session.remove(AUTH_FAILED);
      await clearScrapeCache();
      text = `Đăng nhập thành công: ${account.name} — ${account.username} · ${account.className ? `Lớp ${account.className}` : 'Hồ sơ chưa cung cấp lớp'}.`;
    } else {
      await chrome.storage.session.set({ [AUTH_FAILED]: op.username });
      text = String(result?.message || 'Không xác minh được phiên đăng nhập. Hãy thử lại.').slice(0, 500);
      if (state.enabled && state.selected === op.username) text += ' Tự động đăng nhập tạm dừng; chọn Đăng nhập hoặc bật lại để thử lại.';
    }
    await chrome.storage.session.remove(AUTH_OP);
    await chrome.storage.session.set({ [AUTH_STATUS]: { ok: success, message: text, tabId: op.tabId } });
    await sessionChanged(op.tabId);
    accountsChanged();
    return { ok: success, message: text };
  }

  if (!fromManager) return { ok: false, message: 'Hãy mở trang Tài khoản của tiện ích.' };
  const state = await readAccounts();
  if (message.type === 'lhu:accounts-list') {
    const status = (await chrome.storage.session.get(AUTH_STATUS))[AUTH_STATUS] || null;
    return {
      ok: true, accounts: state.accounts.map(({ username, name, className }) => ({ username, name, className })),
      selected: state.selected, enabled: state.enabled, pending: !!op, status
    };
  }
  if (op) return { ok: false, message: 'Đang có một lần đăng nhập. Vui lòng chờ.' };

  if (message.type === 'lhu:accounts-enable') {
    state.enabled = !!message.enabled && state.accounts.some(a => a.username === state.selected);
    await writeAccounts(state);
    await chrome.storage.session.remove(AUTH_FAILED);
    accountsChanged();
    if (state.enabled) {
      const tabs = await chrome.tabs.query({ url: `${SITE}*` });
      for (const tab of tabs) notifyTab(tab.id, { type: 'lhu:auth-check' });
    }
    return { ok: true };
  }
  if (message.type === 'lhu:accounts-remove') {
    state.accounts = state.accounts.filter(a => a.username !== message.username);
    if (state.selected === message.username) { state.selected = ''; state.enabled = false; }
    await writeAccounts(state);
    accountsChanged();
    return { ok: true };
  }
  if (message.type === 'lhu:accounts-add' || message.type === 'lhu:accounts-switch') {
    if (message.confirm !== true) return { ok: false, message: 'Cần xác nhận đổi phiên đăng nhập.' };
    let account;
    if (message.type === 'lhu:accounts-add') {
      if (!/^\d{6,20}$/.test(message.username || '') || typeof message.password !== 'string' || !message.password || message.password.length > 1024) {
        return { ok: false, message: 'MSSV phải là 6–20 chữ số và mật khẩu không được để trống.' };
      }
      account = { username: message.username, password: message.password };
    } else {
      account = state.accounts.find(a => a.username === message.username);
      if (!account) return { ok: false, message: 'Tài khoản không còn trong danh sách.' };
    }
    const tabs = await chrome.tabs.query({ url: `${SITE}*` });
    const preferred = (await chrome.storage.session.get('lhu.auth.sourceTab'))['lhu.auth.sourceTab'];
    let tab = tabs.find(t => t.id === preferred) || tabs.find(t => t.active) || tabs[0];
    if (!tab) tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    const next = await startAuth(account, 'manual', tab.id);
    try {
      await chrome.tabs.update(tab.id, { url: `${SITE}?redirect=0` });
    } catch (e) {
      await chrome.storage.session.remove(AUTH_OP);
      await chrome.storage.session.set({ [AUTH_STATUS]: { ok: false, message: 'Không mở được trang đăng nhập. Hãy thử lại.' } });
      accountsChanged();
      return { ok: false, message: 'Không mở được trang đăng nhập. Hãy thử lại.' };
    }
    return { ok: true, id: next.id };
  }
  return { ok: false, message: 'Yêu cầu không hợp lệ.' };
}

chrome.tabs.onRemoved.addListener(tabId => {
  authQueue = authQueue.catch(() => {}).then(async () => {
    const op = await authOperation();
    if (op?.tabId !== tabId) return;
    await chrome.storage.session.remove(AUTH_OP);
    await chrome.storage.session.set({ [AUTH_FAILED]: op.username, [AUTH_STATUS]: { ok: false, message: 'Tab đăng nhập đã đóng. Hãy mở lại và thử lại.' } });
    accountsChanged();
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;
  if (/^lhu:(accounts-|auth-|open-accounts)/.test(message.type || '')) {
    const response = authQueue.catch(() => {}).then(() => authMessage(message, sender));
    authQueue = response;
    response.then(sendResponse, () => sendResponse({ ok: false, message: 'Không truy cập được bộ nhớ tài khoản hoặc tab Learn LHU. Hãy thử lại.' }));
    return true;
  }
});

chrome.action.onClicked.addListener(tab => {
  if (tab?.id && typeof tab.url === 'string' && tab.url.startsWith(SITE)) {
    chrome.tabs.sendMessage(tab.id, { type: 'lhu:toggle' }).catch(() => {});
    return;
  }
  chrome.tabs.create({ url: `${SITE}my/` });
});
