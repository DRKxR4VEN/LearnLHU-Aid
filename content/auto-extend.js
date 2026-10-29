(() => {
  'use strict';
  const LHU = globalThis.LHU;
  if (!LHU || LHU.autoExtend || !document.documentElement) return;
  LHU.autoExtend = true;

  const DIALOG = '#session-timeout-dialogue, .moodle-dialogue, .modal, [role="dialog"]';
  const STRONG = /^(?:extend(?:\s+session)?|keep\s+me\s+(?:signed|logged)\s+in|continue\s+session|gia\s+hạn(?:\s+phiên)?|tiếp\s+tục\s+phiên)$/i;
  const WEAK = /^(?:ok|okay|continue|agree|đồng\s+ý|tiếp\s+tục)$/i;
  // Moodle's own wording, both English and Vietnamese builds.
  const PROMPT = /(?:session|phiên)[\s\S]{0,140}?(?:time\s*out|timed\s*out|expir|kết\s*thúc|hết\s*hạn|hết\s*hiệu\s*lực)/i;
  const COOLDOWN = 30000;

  let enabled = false;
  let nextTry = 0;

  function visible(el) {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function label(el) {
    return (el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extend(dialog) {
    if (!PROMPT.test((dialog.textContent || '').slice(0, 2000))) return false;
    for (const button of dialog.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn')) {
      if (button.disabled) continue;
      const text = label(button);
      if (!STRONG.test(text) && !WEAK.test(text)) continue;
      nextTry = Date.now() + COOLDOWN;
      button.click();
      return true;
    }
    return false;
  }

  function scan() {
    if (!enabled || Date.now() < nextTry) return;
    for (const dialog of document.querySelectorAll(DIALOG)) {
      if (visible(dialog) && extend(dialog)) return;
    }
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, 150);
  }

  function addedDialog(records) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(DIALOG) || node.querySelector(DIALOG)) return true;
      }
    }
    return false;
  }

  // The dialog is injected by Moodle's own JS, so watching for new nodes fires
  // even while the tab is hidden; the interval only covers missed mutations.
  new MutationObserver((records) => {
    if (addedDialog(records)) scan();
    else schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, 20000);

  LHU.getPrefs().then(p => {
    enabled = p.autoExtend !== false;
    if (enabled) scan();
  });
  LHU.onPrefs(p => {
    enabled = p.autoExtend !== false;
    if (enabled) scan();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
})();
