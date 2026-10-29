(() => {
  'use strict';
  const LHU = globalThis.LHU = globalThis.LHU || {};
  if (LHU.scrape) return;
  LHU.scrape = true;

  const BASE = location.origin;
  const userKey = LHU.sessionUser().userId || 'guest';
  const K = {
    courses: `lhu.v2.courses.${userKey}`,
    categories: `lhu.v2.categories.${userKey}`,
    cat: `lhu.v2.category.${userKey}`,
    deadlines: `lhu.v2.deadlines.${userKey}`
  };
  const TTL = {
    courses: 6 * 3600e3,
    categories: 6 * 3600e3,
    cat: 3600e3,
    deadlines: 5 * 60e3
  };
  const PAST_DAYS = 90;

  const memory = new Map();
  const hasChromeStore = () => !!(globalThis.chrome && chrome.storage && chrome.storage.local);

  async function get(key) {
    try {
      if (hasChromeStore()) {
        const res = await chrome.storage.local.get(key);
        return res[key] ?? null;
      }
      return memory.get(key) ?? null;
    } catch (e) {
      return null;
    }
  }

  async function set(key, value) {
    try {
      if (hasChromeStore()) await chrome.storage.local.set({ [key]: value });
      else memory.set(key, value);
    } catch (e) {
      /* quota exceeded: drop caches and continue */
    }
  }

  let decoder;
  function decodeEntities(s) {
    if (!/[&<>]/.test(s)) return s;
    if (!decoder) decoder = document.createElement('textarea');
    decoder.innerHTML = s;
    return decoder.value;
  }

  let sesskeyCache;
  function sesskey() {
    if (sesskeyCache) return sesskeyCache;
    sesskeyCache = document.querySelector('input[name="sesskey"]')?.value || '';
    if (!sesskeyCache) {
      // Serializing the whole DOM is expensive, so only do it once per page.
      const html = document.documentElement.innerHTML;
      const m = html.match(/"sesskey":"([A-Za-z0-9]+)"/) || html.match(/name="sesskey"\s+value="([A-Za-z0-9]+)"/);
      if (m) sesskeyCache = m[1];
    }
    return sesskeyCache || null;
  }

  async function ajax(methodname, args) {
    if (!LHU.isLoggedIn()) return null;
    const sk = sesskey();
    if (!sk) return null;
    try {
      const r = await fetch(`${BASE}/lib/ajax/service.php?sesskey=${sk}&info=${methodname}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname, args }])
      });
      if (!r.ok) return null;
      const json = await r.json();
      const first = json && json[0];
      if (!first || first.error) return null;
      return first.data;
    } catch (e) {
      return null;
    }
  }

  async function fetchDoc(url) {
    if (!LHU.isLoggedIn()) return null;
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok || /\/login\//.test(r.url)) return null;
      return new DOMParser().parseFromString(await r.text(), 'text/html');
    } catch (e) {
      return null;
    }
  }

  function scrapeCourseLinks() {
    const seen = new Map();
    for (const a of document.querySelectorAll('a[href*="/course/view.php?id="]')) {
      const id = (a.href.match(/[?&]id=(\d+)/) || [])[1];
      if (!id || seen.has(id)) continue;
      const name = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      seen.set(id, {
        id: Number(id),
        name,
        short: (a.dataset?.shortname || '').trim(),
        category: '',
        image: '',
        url: `${BASE}/course/view.php?id=${id}`
      });
    }
    return Array.from(seen.values());
  }

  function categoryName(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    return String(value.name || '').trim();
  }

  let coursesInflight = null;

  async function loadCourses(force) {
    const cached = await get(K.courses);
    if (!force && cached && cached.list?.length && Date.now() - cached.ts < TTL.courses) return cached;
    if (coursesInflight) return coursesInflight;

    const run = (async () => {
      const data = await ajax('core_course_get_enrolled_courses_by_timeline_classification', {
        offset: 0, limit: 0, classification: 'all', sort: 'fullname'
      });

      let list = null;
      if (data && Array.isArray(data.courses) && data.courses.length) {
        list = data.courses.map(c => ({
          id: c.id,
          name: (c.fullname || '').replace(/\s+/g, ' ').trim(),
          short: (c.shortname || '').trim(),
          category: categoryName(c.coursecategory),
          image: c.courseimage && !/^data:/i.test(c.courseimage) && !isPlaceholderImage(c.courseimage) ? c.courseimage : '',
          url: c.viewurl || `${BASE}/course/view.php?id=${c.id}`
        }));
      } else {
        list = scrapeCourseLinks();
      }
      if (!list.length) return cached?.list?.length ? cached : { ts: 0, list: [] };

      const fresh = { ts: Date.now(), list };
      await set(K.courses, fresh);
      return fresh;
    })();

    coursesInflight = run.finally(() => { coursesInflight = null; });
    return coursesInflight;
  }

  function isPlaceholderImage(url) {
    return /\/theme\/[^/]+\/pix\/default_course\.(jpe?g|png|svg)(\?|$)/i.test(url || '');
  }

  function courseCategories(doc) {
    const out = [];
    const seen = new Set();
    const nodes = doc.querySelectorAll(
      '.course_category_tree.category-browse-0 > .content > .subcategories > .category[data-categoryid]'
    );
    for (const category of nodes) {
      const id = Number(category.dataset.categoryid);
      const link = category.querySelector(':scope > .info .categoryname a[href*="categoryid="]');
      const name = (link?.textContent || '').replace(/\s+/g, ' ').trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, url: `${BASE}/course/index.php?categoryid=${id}` });
    }
    return out;
  }

  let categoriesInflight = null;

  async function loadCourseCategories(force = false) {
    const cached = await get(K.categories);
    if (!force && cached?.list?.length && Date.now() - cached.ts < TTL.categories) return cached.list;
    if (categoriesInflight) return categoriesInflight;

    const run = (async () => {
      const doc = await fetchDoc(`${BASE}/course/index.php`);
      const list = doc ? courseCategories(doc) : [];
      if (!list.length) return cached?.list || [];
      await set(K.categories, { ts: Date.now(), list });
      return list;
    })();

    categoriesInflight = run.finally(() => { categoriesInflight = null; });
    return categoriesInflight;
  }

  function categoryCourses(doc) {
    const out = new Map();
    const add = (id, name, category, image) => {
      id = Number(id);
      name = String(name || '').replace(/\s+/g, ' ').trim();
      if (!id || !name || out.has(id)) return;
      out.set(id, {
        id,
        name,
        short: '',
        category: String(category || '').trim(),
        image: image && !isPlaceholderImage(image) && !/^data:/i.test(image) ? image : '',
        url: `${BASE}/course/view.php?id=${id}`
      });
    };

    for (const box of doc.querySelectorAll('.c-course-box[data-courseid]')) {
      const title = box.querySelector('.course-box-title-txt');
      const style = box.querySelector('.courseimage')?.getAttribute('style') || '';
      const image = (style.match(/url\((['"]?)(.*?)\1\)/) || [])[2] || '';
      add(
        box.dataset.courseid,
        title?.getAttribute('title') || title?.textContent,
        box.querySelector('.coursecat a')?.textContent,
        image
      );
    }

    for (const box of doc.querySelectorAll('.coursebox')) {
      const link = box.querySelector('a[href*="/course/view.php?id="]');
      if (!link) continue;
      const id = (link.href.match(/[?&]id=(\d+)/) || [])[1];
      const name = box.querySelector('.coursename')?.textContent || link.getAttribute('title') || link.textContent;
      const image = box.querySelector('img.courseimage, .courseimage img')?.getAttribute('src') || '';
      add(id, name, box.querySelector('.coursecat')?.textContent, image);
    }

    return Array.from(out.values());
  }

  const catInflight = new Map();

  async function loadCategoryCourses(id = 5, force = false) {
    const key = String(id);
    const all = (await get(K.cat)) || {};
    const cached = all[key];
    if (!force && cached && cached.list?.length && Date.now() - cached.ts < TTL.cat) return cached.list;
    if (catInflight.has(key)) return catInflight.get(key);

    const run = (async () => {
      const doc = await fetchDoc(`${BASE}/course/index.php?categoryid=${id}`);
      const list = doc ? categoryCourses(doc) : [];
      if (!list.length) return cached?.list || [];
      const fresh = (await get(K.cat)) || {};
      fresh[key] = { ts: Date.now(), list };
      await set(K.cat, fresh);
      return list;
    })();

    catInflight.set(key, run.finally(() => catInflight.delete(key)));
    return catInflight.get(key);
  }

  function isDeadlineEvent(ev) {
    if (!ev || !ev.timesort) return false;
    const name = String(ev.name || '').trim();
    if (!name) return false;
    if (/\sopens$/i.test(name)) return false;
    return /\s(is due|closes)$/i.test(name) || ev.modulename === 'assign';
  }

  function parseEvent(ev) {
    const name = decodeEntities(String(ev.name || ''))
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+(is due|closes)$/i, '');
    if (!name) return null;
    return {
      id: ev.id,
      name,
      url: ev.action?.url || ev.url || ev.viewurl || ev.course?.viewurl || '',
      due: Number(ev.timesort) * 1000,
      module: ev.modulename || '',
      courseId: ev.course?.id || 0,
      courseName: ev.course?.fullname || ev.course?.shortname || 'Môn học',
      courseShort: ev.course?.shortname || ev.course?.fullname || 'Môn học'
    };
  }

  async function fetchEventRange(from, to) {
    const out = [];
    let after = 0;
    for (let page = 0; page < 4; page++) {
      const args = { limitnum: 50, timesortfrom: from, timesortto: to };
      if (after) args.aftereventid = after;
      const data = await ajax('core_calendar_get_action_events_by_timesort', args);
      if (!data) return page === 0 ? null : out;
      const events = Array.isArray(data.events) ? data.events : [];
      if (!events.length) break;
      out.push(...events);
      if (events.length < 50) break;
      after = events[events.length - 1].id;
      if (!after) break;
    }
    return out;
  }

  let deadlinesInflight = null;

  async function loadDeadlines(force = false) {
    const cached = await get(K.deadlines);
    if (!force && cached && Date.now() - cached.ts < TTL.deadlines) return cached;
    if (deadlinesInflight) return deadlinesInflight;

    const run = (async () => {
      const now = Math.floor(Date.now() / 1000);
      const chunks = [];
      for (let end = now + 1; end > now - PAST_DAYS * 86400; end -= 30 * 86400) {
        chunks.push([Math.max(now - PAST_DAYS * 86400, end - 30 * 86400), end]);
      }

      const results = await Promise.all([
        fetchEventRange(now, now + 365 * 86400),
        ...chunks.map(([a, b]) => fetchEventRange(a, b))
      ]);

      if (results.some(r => r === null) && cached && (cached.upcoming?.length || cached.past?.length)) {
        return cached;
      }

      const seen = new Set();
      const upcoming = [];
      const past = [];
      const add = (ev, bucket) => {
        if (!isDeadlineEvent(ev)) return;
        const item = parseEvent(ev);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        bucket.push(item);
      };

      for (const ev of results[0] || []) add(ev, upcoming);
      for (const arr of results.slice(1)) for (const ev of arr || []) add(ev, past);

      upcoming.sort((a, b) => a.due - b.due);
      past.sort((a, b) => b.due - a.due);

      const fresh = { ts: Date.now(), upcoming, past };
      await set(K.deadlines, fresh);
      return fresh;
    })();

    deadlinesInflight = run.finally(() => { deadlinesInflight = null; });
    return deadlinesInflight;
  }

  Object.assign(LHU, {
    loadCourses, loadCourseCategories, loadCategoryCourses, loadDeadlines
  });
})();
