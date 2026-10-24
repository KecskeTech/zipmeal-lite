/* ZipMeal Lite – alternatív zipmeal.hu kliens (PWA)
 *
 * Copyright (C) 2026 KecskeTech
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
'use strict';

const API = 'https://zipmeal.hu/api';

/* ---------- token storage ---------- */
const store = {
  get access() { return localStorage.getItem('zm_access'); },
  set access(t) { t ? localStorage.setItem('zm_access', t) : localStorage.removeItem('zm_access'); },
  get refresh() { return localStorage.getItem('zm_refresh'); },
  set refresh(t) { t ? localStorage.setItem('zm_refresh', t) : localStorage.removeItem('zm_refresh'); },
};

/* ---------- offline cache (localStorage) ----------
   A havi orders válasz és a munkamenet-adatai localStorage-ba kerülnek, hogy
   offline is látható legyen a becsült étlap. Az API-t a service worker nem
   cache-eli, ezért ez az app-szintű cache fontos a PWA offline módhoz. */
const CACHE_PREFIX = 'zm_cache_v1_';
const cache = {
  set(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), value }));
    } catch (_) { /* quota / privát mód */ }
  },
  get(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw)?.value ?? null;
    } catch (_) { return null; }
  },
  clear() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  },
};

function monthCacheKey(cardId, target) { return 'month_' + cardId + '_' + target; }

function saveMonthCache(target) {
  if (!state.diner?.cardId || !state.data) return;
  cache.set(monthCacheKey(state.diner.cardId, target), {
    data: state.data,
    dataNext: state.dataNext || null,
  });
}

function loadMonthCache(target) {
  if (!state.diner?.cardId) return null;
  return cache.get(monthCacheKey(state.diner.cardId, target));
}

const sessionCache = {
  save() {
    cache.set('session', {
      isParent: state.isParent,
      diners: state.diners,
      diner: state.diner,
      profile: state.profile,
    });
  },
  load() { return cache.get('session'); },
};

/* ---------- api layer ---------- */

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-type'] = 'application/json';
  if (auth && store.access) headers['Authorization'] = 'Bearer ' + store.access;

  let res = await fetch(API + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // access token lejár -> refresh, majd újra
  if (res.status === 401 && auth && store.refresh) {
    const ok = await refreshTokens();
    if (!ok) { logout(); throw new Error('A munkamenet lejárt, jelentkezz be újra.'); }
    return api(path, { method, body, auth });
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.message || ''; } catch (_) {}
    throw new Error(`HTTP ${res.status} ${detail}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

async function refreshTokens() {
  try {
    const res = await fetch(API + '/users/refresh-token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: store.refresh }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    if (!d?.access_token) return false;
    store.access = d.access_token;
    store.refresh = d.refresh_token;
    return true;
  } catch { return false; }
}

function logout() {
  store.access = null;
  store.refresh = null;
  state.diner = null;
  state.diners = [];
  state.isParent = false;
  state.data = null;
  state.dataNext = null;
  state.monthOffset = 0;
  state.profile = null;
  state.autoScrolled = false;
  cache.clear(); // offline másolat törlése kijelentkezéskor
  setOffline(false);
  showView('login');
}

/* ---------- app state ---------- */
const state = {
  diner: null,   // { cardId, institutionId, fullName, group, institutionName }
  profile: null, // az étkező nyers diner-info objektuma (avatarhoz, cache-hez)
  diners: [],    // szülői fióknál az összes kezelhető étkező (gyermek)
  isParent: false,
  data: null,    // aktuális hónap orders response
  dataNext: null,
  monthOffset: 0, // 0 = current month
  busy: false,
  offline: false, // offline mód: becsült adatok, módosítás tiltva
  autoScrolled: false, // már az aznapi ebédre ugrottunk?
};

/* month key: YYYYMM for a Date shifted by monthOffset */
function monthKey(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
}

function monthLabel(key) {
  const y = +key.slice(0, 4), m = +key.slice(4, 6) - 1;
  const d = new Date(y, m, 1);
  return d.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' });
}

/* orderDate/mealDate -> 'YYYYMMDD' (UTC dátumrész, API kulcs – a szerver ezt várja,
   az eredeti app is ezt küldi kezdete/vege mezőként) */
function ymd(iso) { return iso.slice(0, 10).replace(/-/g, ''); }

/* A mealDate mindig T23:00:00Z = magyar idő KÖVETKEZŐ nap 00:00.
   Tehát a tényleges (HU) étkezés napja = UTC dátumrész + 1 nap.
   Kijelzéshez ezt használjuk, API-híváshoz az UTC kulcsot (ymd). */
function displayIso(key) {
  const d = new Date(key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6, 8) + 'T23:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z');
  return d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'long' });
}

/* Helyi (magyar) mai nap YYYY-MM-DD formában. Az UTC-s slice éjfél körül
   elcsúszhat, ezért itt a böngésző helyi idejét használjuk. */
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function localIso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* A választási / lemondási határidők UTC ISO stringek; a megjelenítés helyi idő. */
function isDeadlinePassed(iso) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= Date.now();
}

function fmtDeadline(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('hu-HU', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function isNetworkError(err) {
  return !navigator.onLine || err instanceof TypeError ||
    /Failed to fetch|NetworkError|Load failed|ERR_NETWORK|ERR_INTERNET_DISCONNECTED/i.test(err?.message || '');
}

function setOffline(flag, message) {
  state.offline = !!flag;
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.hidden = !flag;
    banner.textContent = message ||
      'Offline mód – a becsült étlap látható. Az étel kiválasztása és a lemondás most nem elérhető.';
  }
  document.body.classList.toggle('is-offline', !!flag);
}

/* ---------- iso hét ---------- */
function weekInfo(iso) {
  const base = new Date(iso + 'T12:00:00');
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / 604800000);
  return { week, monday: localIso(monday), sunday: localIso(sunday) };
}

function fmtWeekRange(mondayIso, sundayIso) {
  const m = new Date(mondayIso + 'T12:00:00');
  const s = new Date(sundayIso + 'T12:00:00');
  const mName = m.toLocaleDateString('hu-HU', { month: 'long' });
  const sName = s.toLocaleDateString('hu-HU', { month: 'long' });
  if (m.getFullYear() !== s.getFullYear()) {
    return `${m.getFullYear()}. ${mName} ${m.getDate()}. – ${s.getFullYear()}. ${sName} ${s.getDate()}.`;
  }
  if (mName === sName) return `${mName} ${m.getDate()}. – ${s.getDate()}.`;
  return `${mName} ${m.getDate()}. – ${sName} ${s.getDate()}.`;
}

function groupDaysByWeek(days) {
  const groups = [];
  for (const day of days) {
    const w = weekInfo(day.iso);
    let group = groups[groups.length - 1];
    if (!group || group.key !== w.monday) {
      group = { key: w.monday, week: w.week, monday: w.monday, sunday: w.sunday, days: [] };
      groups.push(group);
    }
    group.days.push(day);
  }
  return groups;
}

/* allergén kódok -> nevek, ha van szótár */
function allergeneNames(str, dict) {
  if (!str) return '';
  return str.split(',').map((c) => dict?.[c.trim()] || c.trim()).join(', ');
}

/* ---------- data fetch ---------- */

/* A /users/details roles mezője alapján ismerjük fel a szülői fiókot
   (az eredeti app is a "parent" role-ra szűr). */
async function fetchParentRole() {
  try {
    const details = unwrap(await api('/users/details'));
    const roles = Array.isArray(details?.roles) ? details.roles : [];
    state.isParent = roles.includes('parent');
  } catch (err) {
    // Hálózati hiba esetén ne írjuk felül a cache-elt szerepkört.
    if (!isNetworkError(err)) state.isParent = false;
  }
}

/* A /users/diner-info szülőnél több étkezőt (gyermeket) ad vissza,
   sima fióknál egyet. Mindig tömbként dolgozunk vele. */
async function fetchDiners() {
  let infos = unwrap(await api('/users/diner-info'));
  if (infos && !Array.isArray(infos) && Array.isArray(infos.diners)) infos = infos.diners;
  state.diners = Array.isArray(infos) ? infos : infos ? [infos] : [];
  // Ha a details nem elérhető, a több étkező is szülői fiókra utal.
  state.isParent = state.isParent || state.diners.length > 1;
  sessionCache.save();
  return state.diners;
}

function setActiveDiner(me) {
  if (!me) throw new Error('Nem található étkező profil.');
  state.profile = me;
  state.diner = {
    cardId: me.cardId,
    institutionId: me.institutionId || me.institution?.id,
    fullName: me.fullName,
  };
  document.getElementById('user-name').textContent = me.nickname || me.fullName || '';
  document.getElementById('user-group').textContent =
    [me.institution?.name?.trim(), me.group].filter(Boolean).join(' • ');
  document.getElementById('user-avatar').textContent =
    (me.fullName || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  document.getElementById('switch-diner-btn').hidden = !state.isParent;
  sessionCache.save();
}

/* Offline indulás: a legutóbbi munkamenet (étkezők + aktív étkező + havi
   adatok) visszaállítása a localStorage cache-ből. */
function restoreCachedSession() {
  const saved = sessionCache.load();
  if (!saved || !Array.isArray(saved.diners) || !saved.diners.length) return false;

  state.isParent = !!saved.isParent;
  state.diners = saved.diners;
  state.autoScrolled = false;

  if (saved.diner && saved.profile) {
    setActiveDiner(saved.profile);
    showView('main');
    setOffline(true);
    loadMonth(0);
    return true;
  }

  state.diner = null;
  state.profile = null;
  renderDiners();
  showView('diner');
  DINER_ERROR_EL.textContent = 'Offline mód: a becsült adatok láthatók, a módosítás nem elérhető.';
  DINER_ERROR_EL.hidden = false;
  return true;
}

/* Egyes válaszok { result: {...} } csomagolásban is jöhetnek – levesszük */
function unwrap(d) {
  return d && typeof d === 'object' && !Array.isArray(d) &&
    d.result && typeof d.result === 'object' &&
    d.orders === undefined && d.access_token === undefined
    ? d.result : d;
}

/* Az adott (orders|ordersNext) blokk tartalmazza-e a target (YYYYMM) hónapot */
function monthHasData(m, target) {
  if (!m || typeof m !== 'object') return false;
  const menu = Array.isArray(m.menu) ? m.menu : [];
  const orders = Array.isArray(m.orders) ? m.orders : [];
  return menu.some((x) => ymd(x?.mealDate || '').slice(0, 6) === target) ||
    orders.some((x) => ymd(x?.orderDate || x?.menuMeal?.mealDate || '').slice(0, 6) === target);
}

/* A szerver a "orders" blokkba a startMonth+advance hónapot adja, az "ordersNext"-be
   a rákövetkezőt (leírás 7. pont). A kért hónap ehhez startMonth = monthKey(offset-1),
   advance = 1 – de ha a szerver máshogy értelmezi (pl. múltbeli startMonth-ot nem fogad),
   a kért hónap az ordersNext-ben van, vagy a startMonth = kért hónap, advance nélküli
   kérés működik. Ezért több stratégiával kérünk, és azt a blokkot használjuk,
   amelyik tényleg a kért hónap adatait tartalmazza. */
async function fetchMonth(offset) {
  const target = monthKey(offset);
  const bodies = [
    { cardId: state.diner.cardId, startMonth: monthKey(offset - 1), advance: 1 },
    { cardId: state.diner.cardId, startMonth: target },
    { cardId: state.diner.cardId, startMonth: monthKey(Math.max(offset, 0)), advance: offset },
  ];
  const seen = new Set();
  let fallback = null;
  let lastErr = null;
  try {
    for (const body of bodies) {
      const key = JSON.stringify(body);
      if (seen.has(key)) continue;
      seen.add(key);
      let r;
      try {
        r = unwrap(await api('/users/orders', { method: 'POST', body }));
      } catch (e) {
        lastErr = e;
        continue;
      }
      const chunks = [r, r && r.ordersNext].filter(Boolean);
      const hit = chunks.find((m) => monthHasData(m, target));
      if (hit) {
        state.data = hit;
        state.dataNext = chunks.find((m) => m !== hit) || null;
        state.monthOffset = offset;
        saveMonthCache(target);
        setOffline(false);
        return;
      }
      if (!fallback && chunks.some((m) => m.menu || m.orders)) fallback = r;
    }
    if (fallback) {
      // válasz jött, csak a kért hónaphoz nincs menü -> "Nincs menü ebben a hónapban"
      state.data = fallback;
      state.dataNext = fallback.ordersNext || null;
      state.monthOffset = offset;
      saveMonthCache(target);
      setOffline(false);
      return;
    }
    throw lastErr || new Error('Nem sikerült betölteni a menüt.');
  } catch (err) {
    // Hálózati hiba / offline: a korábban lekért havi adatokból dolgozunk.
    const cached = loadMonthCache(target);
    if (cached?.data && isNetworkError(err)) {
      state.data = cached.data;
      state.dataNext = cached.dataNext || null;
      state.monthOffset = offset;
      setOffline(true);
      return;
    }
    if (!navigator.onLine) {
      throw new Error('Nincs becsült adat erre a hónapra offline módban.');
    }
    throw err;
  }
}

/* adott dátumhoz (YYYYMMDD) összeállítja a nap adatait:
   menuA, menuB (menü elemek), order (ha van rendelés az adott napra) */
function dayInfo(dateKey) {
  const resp = state.data;
  const iso = displayIso(dateKey); // HU nap a kijelzéshez
  const menu = (resp?.menu || []).filter((m) => ymd(m.mealDate) === dateKey);
  const menuA = menu.find((m) => /A$/.test(m.mealType)) || null;
  const menuB = menu.find((m) => /B$/.test(m.mealType)) || null;
  const order = (resp?.orders || []).find((o) => ymd(o.orderDate || o.menuMeal?.mealDate) === dateKey) || null;
  const selectDeadline = order?.selectMenuDeadline || null;
  const cancelDeadline = order?.cancelDeadline || null;
  return {
    dateKey, iso, menuA, menuB, order,
    selectDeadline,
    cancelDeadline,
    selectClosed: isDeadlinePassed(selectDeadline),
    cancelClosed: isDeadlinePassed(cancelDeadline),
  };
}

/* a betöltött hónap napjai, amikhez van menü */
function collectDays() {
  const keys = new Set((state.data?.menu || []).map((m) => ymd(m.mealDate)));
  const target = monthKey(state.monthOffset);
  return [...keys].sort().map((k) => dayInfo(k))
    .filter((d) => d.iso.slice(0, 7).replace('-', '') === target);
}

/* ---------- mutations ---------- */
async function chooseMeal(day, menuLetter) {
  const o = day.order;
  if (!o) throw new Error('Nincs rendelés erre a napra.');
  if (state.offline) throw new Error('Offline módban nem módosítható.');
  if (isDeadlinePassed(o.selectMenuDeadline)) throw new Error('A választási határidő lejárt.');
  const body = {
    cardId: state.diner.cardId,
    orderId: o.externalOrderId,
    organOrder: {
      fejId: o.externalOrderTypeId,
      etkezesTipusId: o.externalMealTypeId,
      kezdete: day.dateKey,
      vege: day.dateKey,
      cancelDate: o.cancelDate,
    },
    version: o.orderVersion,
    institutionId: state.diner.institutionId,
    menu: menuLetter,
  };
  await api('/users/choose-meal', { method: 'POST', body });
}

async function cancelDay(day) {
  if (state.offline) throw new Error('Offline módban nem módosítható.');
  if (isDeadlinePassed(day.order?.cancelDeadline) || day.order?.consumedDate) {
    throw new Error('A lemondási határidő lejárt.');
  }
  await api('/users/cancel-meals', {
    method: 'POST',
    body: { cardId: state.diner.cardId, organOrder: { kezdete: day.dateKey, vege: day.dateKey } },
  });
}

async function uncancelDay(day) {
  if (state.offline) throw new Error('Offline módban nem módosítható.');
  if (isDeadlinePassed(day.order?.cancelDeadline) || day.order?.consumedDate) {
    throw new Error('A lemondási határidő lejárt.');
  }
  await api('/users/add-meal', {
    method: 'POST',
    body: { cardId: state.diner.cardId, organOrder: { kezdete: day.dateKey, vege: day.dateKey } },
  });
}

/* ---------- rendering ---------- */
const DAYS_EL = document.getElementById('days');
const STATUS_EL = document.getElementById('status');
const DINERS_EL = document.getElementById('diner-list');
const DINER_ERROR_EL = document.getElementById('diner-error');

function showView(name) {
  document.getElementById('login-view').hidden = name !== 'login';
  document.getElementById('diner-view').hidden = name !== 'diner';
  document.getElementById('main-view').hidden = name !== 'main';
}

function setStatus(msg) {
  STATUS_EL.hidden = !msg;
  STATUS_EL.textContent = msg || '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mealCard(day, meal, letter) {
  if (!meal) return '';
  const allerg = allergeneNames(meal.allergenes, state.data?.allergenes);
  const chosen = !!day.order?.menuMeal?.chosen &&
    (day.order.menuMeal.mealType || '').endsWith(letter);
  const cancelled = !!day.order?.cancelDate;
  let reason = '';
  if (!day.order) reason = 'Erre a napra nincs rendelés.';
  else if (cancelled) reason = 'A nap le van mondva – előbb vond vissza a lemondást.';
  else if (state.offline) reason = 'Offline módban nem módosítható.';
  else if (day.selectClosed) reason = `A választási határidő lejárt (${fmtDeadline(day.selectDeadline)}).`;
  else if (state.busy) reason = 'Feldolgozás…';
  const disabled = !!reason;
  return `
    <button class="meal-choice${chosen ? ' selected' : ''}${cancelled ? ' cancelled' : ''}${day.selectClosed ? ' closed' : ''}"
            data-day="${day.dateKey}" data-menu="${letter}"
            title="${esc(reason)}" ${disabled ? 'disabled' : ''}>
      <span class="meal-tag">Ebéd ${letter}</span>
      <div class="meal-name">${esc(meal.mealName)}</div>
      <div class="meal-meta">${meal.energy ? meal.energy + ' kcal' : ''}${allerg ? ' • ' + esc(allerg) : ''}</div>
    </button>`;
}

function isUnselected(day) {
  return !day.order?.cancelDate && !day.order?.menuMeal?.chosen;
}

function dayBadge(day) {
  if (day.order?.cancelDate) return '<span class="day-badge cancelled">Lemondva</span>';
  if (day.order?.menuMeal?.chosen) return '<span class="day-badge ok">✓ Választva</span>';
  return '<span class="day-badge none">Nincs választva</span>';
}

/* A választási és a lemondási határidő külön dátum lehet – mindkettőt kiírjuk,
   a lejártat áthúzva/szürkén. */
function deadlineChips(day) {
  if (!day.order) return '';
  const parts = [];
  if (day.selectDeadline) {
    parts.push(`<span class="deadline${day.selectClosed ? ' expired' : ''}" title="Étel kiválasztásának / módosításának határideje">
      ✎ Választás: ${esc(fmtDeadline(day.selectDeadline))}${day.selectClosed ? ' (lejárt)' : ''}</span>`);
  }
  if (day.cancelDeadline) {
    parts.push(`<span class="deadline${day.cancelClosed ? ' expired' : ''}" title="Ebéd lemondásának / visszavonásának határideje">
      ✕ Lemondás: ${esc(fmtDeadline(day.cancelDeadline))}${day.cancelClosed ? ' (lejárt)' : ''}</span>`);
  }
  return parts.length ? `<div class="deadlines">${parts.join('')}</div>` : '';
}

function renderDayCard(day, today) {
  const d = new Date(day.iso + 'T12:00:00');
  const dayNum = d.getDate();
  const weekday = d.toLocaleDateString('hu-HU', { weekday: 'short' });
  const month = d.toLocaleDateString('hu-HU', { month: 'long' });
  const isToday = day.iso === today;
  const cancelled = !!day.order?.cancelDate;

  let cancelReason = '';
  if (!day.order) cancelReason = 'Erre a napra nincs rendelés.';
  else if (day.order.consumedDate) cancelReason = 'Az ebéd már elfogyasztva.';
  else if (state.offline) cancelReason = 'Offline módban nem módosítható.';
  else if (day.cancelClosed) cancelReason = `A lemondási határidő lejárt (${fmtDeadline(day.cancelDeadline)}).`;
  else if (state.busy) cancelReason = 'Feldolgozás…';

  return `
    <section class="day-card${isToday ? ' day-today' : ''}${isUnselected(day) ? ' day-unselected' : ''}"
             data-date="${day.iso}">
      <div class="day-head">
        <div class="day-num"><b>${dayNum}</b><small>${esc(weekday)}</small></div>
        <span class="day-title">${esc(month)}${isToday ? ' <span class="today-tag">Ma</span>' : ''}</span>
        ${dayBadge(day)}
      </div>
      <div class="day-body">
        ${deadlineChips(day)}
        <div class="meal-choices">
          ${mealCard(day, day.menuA, 'A')}
          ${mealCard(day, day.menuB, 'B')}
        </div>
        <button class="btn ${cancelled ? 'primary' : 'danger'} day-cancel${day.cancelClosed ? ' closed' : ''}"
                data-day="${day.dateKey}" data-action="${cancelled ? 'uncancel' : 'cancel'}"
                title="${esc(cancelReason)}" ${cancelReason ? 'disabled' : ''}>
          ${cancelled ? 'Mégis kérem (visszavonás)' : 'Ebéd lemondása'}
        </button>
      </div>
    </section>`;
}

/* Nyitáskor az aznapi ebédre (ha nincs, a következő elérhető napra) ugrunk. */
function focusToday(groups) {
  if (state.autoScrolled || state.monthOffset !== 0) return;
  const today = todayIso();
  const all = groups.flatMap((g) => g.days);
  const target = all.find((d) => d.iso === today) || all.find((d) => d.iso > today);
  if (!target) return;
  state.autoScrolled = true;
  requestAnimationFrame(() => {
    const el = DAYS_EL.querySelector(`.day-card[data-date="${target.iso}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderDays() {
  const days = collectDays();
  document.getElementById('month-label').textContent = monthLabel(monthKey(state.monthOffset));
  if (!days.length) {
    DAYS_EL.innerHTML = '<p class="foot">Nincs menü ebben a hónapban.</p>';
    return;
  }
  const today = todayIso();
  const groups = groupDaysByWeek(days);
  DAYS_EL.innerHTML = groups.map((group) => {
    const chosen = group.days.filter((d) => d.order?.menuMeal?.chosen && !d.order?.cancelDate).length;
    const current = group.days.some((d) => d.iso === today);
    return `
      <section class="week-group${current ? ' week-current' : ''}">
        <header class="week-head">
          <span class="week-label">${esc(fmtWeekRange(group.monday, group.sunday))}${current ? ' · ez a hét' : ''}</span>
          <span class="week-meta">${group.week}. hét · ${chosen}/${group.days.length} ebéd kiválasztva</span>
        </header>
        <div class="week-days">
          ${group.days.map((day) => renderDayCard(day, today)).join('')}
        </div>
      </section>`;
  }).join('');
  focusToday(groups);
}
/* ---------- diner (child) selector ---------- */
function dinerInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function renderDiners() {
  DINERS_EL.innerHTML = state.diners.map((d) => {
    const name = d.nickname || d.fullName || '?';
    const sub = [d.nickname ? d.fullName : '', d.institution?.name?.trim(), d.group]
      .filter(Boolean).join(' • ');
    const active = state.diner?.cardId === d.cardId ? ' active' : '';
    return `
      <button class="diner-option${active}" data-card="${esc(d.cardId)}" ${state.busy ? 'disabled' : ''}>
        <span class="diner-avatar">${esc(dinerInitials(d.fullName))}</span>
        <span class="diner-meta">
          <span class="diner-name">${esc(name)}</span>
          ${sub ? `<span class="diner-sub">${esc(sub)}</span>` : ''}
        </span>
        <span class="diner-arrow" aria-hidden="true">›</span>
      </button>`;
  }).join('');
}

async function chooseDiner(cardId) {
  const me = state.diners.find((d) => d.cardId === cardId);
  if (!me) return;
  setActiveDiner(me);
  state.monthOffset = 0;
  state.data = null;
  state.dataNext = null;
  state.autoScrolled = false;
  showView('main');
  await loadMonth(0);
}

/* Bejelentkezés / munkamenet indítása: szülőnél előbb étkezőt választunk. */
async function startSession() {
  await fetchParentRole();
  const diners = await fetchDiners();
  if (!diners.length) throw new Error('Nem található étkező profil.');
  state.autoScrolled = false;
  sessionCache.save();
  if (state.isParent) {
    state.diner = null;
    state.profile = null;
    DINER_ERROR_EL.hidden = true;
    renderDiners();
    showView('diner');
    return;
  }
  setActiveDiner(diners[0]);
  showView('main');
  await loadMonth(0);
}


/* ---------- orchestration ---------- */
async function loadMonth(offset, silent = false) {
  if (!silent) setStatus('Betöltés…');
  try {
    await fetchMonth(offset);
    renderDays();
    setStatus('');
  } catch (e) {
    setStatus('Hiba: ' + e.message);
    renderDays();
  }
}

async function withBusy(fn) {
  if (state.busy) return;
  if (state.offline || !navigator.onLine) {
    setOffline(true);
    setStatus('Offline módban nem lehet módosítani. Csatlakozz az internethez!');
    renderDays();
    return;
  }
  state.busy = true;
  renderDays(); // gombok letiltása
  try {
    await fn();
    await fetchMonth(state.monthOffset); // friss orderVersion miatt mindig újra
    renderDays();
    setStatus('');
  } catch (e) {
    setStatus('Hiba: ' + e.message);
    renderDays();
  } finally {
    state.busy = false;
    renderDays();
  }
}

/* ---------- events ---------- */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.hidden = true;
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const d = unwrap(await api('/users/token', {
      method: 'POST', auth: false,
      body: {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      },
    }));
    if (!d?.access_token) throw new Error(d?.message || 'Sikertelen bejelentkezés.');
    store.access = d.access_token;
    store.refresh = d.refresh_token;
    await startSession();
  } catch (err) {
    if (!navigator.onLine) {
      errEl.textContent = 'Nincs internetkapcsolat. Az offline módhoz korábbi bejelentkezés szükséges.';
    } else if (err instanceof TypeError) {
      errEl.textContent = 'Hálózati hiba: a böngésző blokkolja a kérést. Valószínűleg file://-ként nyitottad az oldalt. Futtass szerverrel: python -m http.server -d c:\\prog\\zipm_clone\\webui 8000, majd nyisd: http://localhost:8000';
    } else {
      errEl.textContent = err.message;
    }
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('diner-logout').addEventListener('click', logout);

document.getElementById('switch-diner-btn').addEventListener('click', () => {
  if (!state.isParent) return;
  state.data = null;
  state.dataNext = null;
  state.monthOffset = 0;
  setStatus('');
  DINER_ERROR_EL.hidden = true;
  renderDiners();
  showView('diner');
});

DINERS_EL.addEventListener('click', async (e) => {
  const btn = e.target.closest('.diner-option');
  if (!btn || btn.disabled) return;
  DINER_ERROR_EL.hidden = true;
  state.busy = true;
  renderDiners();
  try {
    await chooseDiner(btn.dataset.card);
  } catch (err) {
    DINER_ERROR_EL.textContent = err.message;
    DINER_ERROR_EL.hidden = false;
  } finally {
    state.busy = false;
    if (!document.getElementById('diner-view').hidden) renderDiners();
  }
});

document.getElementById('prev-month').addEventListener('click', () => loadMonth(state.monthOffset - 1));
document.getElementById('next-month').addEventListener('click', () => loadMonth(state.monthOffset + 1));

DAYS_EL.addEventListener('click', (e) => {
  const mealBtn = e.target.closest('.meal-choice');
  if (mealBtn && !mealBtn.disabled) {
    const day = dayInfo(mealBtn.dataset.day);
    withBusy(() => chooseMeal(day, mealBtn.dataset.menu));
    return;
  }
  const cancelBtn = e.target.closest('.day-cancel');
  if (cancelBtn && !cancelBtn.disabled) {
    const day = dayInfo(cancelBtn.dataset.day);
    withBusy(() => cancelBtn.dataset.action === 'cancel' ? cancelDay(day) : uncancelDay(day));
  }
});

/* ---------- online / offline ---------- */
async function handleOnline() {
  setOffline(false);
  if (!store.access) return;
  try {
    if (store.refresh) {
      const ok = await refreshTokens();
      if (!ok && !store.access) { logout(); return; }
    }
    if (state.diner) {
      await fetchMonth(state.monthOffset);
      renderDays();
      setStatus('');
    } else {
      await startSession();
    }
  } catch (e) {
    setStatus('Hiba: ' + e.message);
    if (state.data) renderDays();
  }
}

/* ---------- init ---------- */
(async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.addEventListener('offline', () => {
    setOffline(true);
    if (state.data) renderDays();
  });
  window.addEventListener('online', handleOnline);

  // Lejárt határidők frissítése a nyitva hagyott oldalon is.
  setInterval(() => {
    if (!document.getElementById('main-view').hidden && !state.busy) renderDays();
  }, 60000);

  if (!navigator.onLine) {
    setOffline(true);
    if (store.access && store.refresh) restoreCachedSession();
    return;
  }

  if (store.access && store.refresh) {
    try {
      const ok = await refreshTokens(); // induláskor frissít, ha lehet
      if (!ok && !store.access) return;
      await startSession();
    } catch (err) {
      // Csak hálózati hiba esetén használjuk a cache-elt munkamenetet;
      // lejárt/érvénytelen token után jelentkezni kell.
      if (isNetworkError(err) || !navigator.onLine) {
        if (!restoreCachedSession()) logout();
      } else {
        logout();
      }
    }
  }
})();

