(() => {
  'use strict';
  const LHU = globalThis.LHU;
  if (!LHU || !LHU.PAGE_CSS) return;

  const STYLE_ID = 'lhu-page-theme';
  const INVERT_ATTR = 'data-lhu-invert';
  const CHECKED_ATTR = 'data-lhu-imgchecked';

  function apply(theme) {
    const root = document.documentElement;
    if (!root) return;
    if (theme === 'dark') root.setAttribute('data-lhu-theme', 'dark');
    else root.removeAttribute('data-lhu-theme');
  }

  // Moodle stores hand-written notes as white screenshots, which glare out of
  // the dark page. Sample each content image and invert only white documents.
  function processImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.hasAttribute(CHECKED_ATTR)) return;
    if (img.closest('#lhu-aid-root')) return;
    if (!img.closest('#region-main')) return;
    if (img.classList.contains('icon') || img.classList.contains('userpicture') || img.classList.contains('fp-thumbnail')) return;
    if (!img.complete) {
      img.addEventListener('load', () => processImage(img), { once: true });
      return;
    }
    if (img.naturalWidth < 120 || img.naturalHeight < 80) return;
    img.setAttribute(CHECKED_ATTR, '1');
    try {
      const width = 240;
      const height = Math.max(1, Math.round((width * img.naturalHeight) / img.naturalWidth));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      const total = width * height;
      let white = 0;
      let ink = 0;
      let mid = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (l >= 232) white++;
        else if (l <= 110) ink++;
        else mid++;
      }
      // A document scan is mostly a white sheet with some ink and colour
      // marks; a photo keeps its subject in the mid range and is left alone.
      if (white / total >= 0.55 && mid / total <= 0.45 && ink / total >= 0.002) {
        img.setAttribute(INVERT_ATTR, '1');
      }
    } catch (e) {
      // Cross-origin image: leave it untouched.
    }
  }

  function scanImages(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img').forEach(processImage);
  }

  function watchImages() {
    if (!document.body) return;
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => scanImages(document), 250);
    };
    scanImages(document);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('load', schedule);
  }

  function mountStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = LHU.PAGE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function start() {
    if (!document.documentElement) {
      document.addEventListener('readystatechange', start, { once: true });
      return;
    }
    mountStyle();
    // The localStorage mirror avoids a light flash while chrome.storage resolves.
    const mirror = LHU.readThemeMirror();
    if (mirror) apply(mirror);
    LHU.getPrefs().then((p) => apply(p.theme));
    LHU.onPrefs((p) => apply(p.theme));
    if (document.body) watchImages();
    else document.addEventListener('DOMContentLoaded', watchImages, { once: true });
  }

  start();
})();
