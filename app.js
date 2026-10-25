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
    // A mealDict is kell az offline módhoz, különben a reggeli/vacsora
    // étkezés-típus nem azonosítható a cache-elt menüből.
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
  state.months = {};
  state.weekOffset = 0;
  state.weekRange = null;
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
  data: null,    // a kiválasztott hétre összefűzött orders response
  dataNext: null,
  months: {},    // hónaponkénti API-válaszok (memória-cache a heti navigációhoz)
  weekOffset: 0, // 0 = aktuális hét, -1 = előző hét, +1 = következő hét
  weekRange: null, // { week, monday, sunday, offset }
  busy: false,
  offline: false, // offline mód: becsült adatok, módosítás tiltva
  autoScrolled: false, // már az aznapi ebédre ugrottunk?
};

/* month key: YYYYMM for a Date shifted by the given month offset */
function monthKey(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
}

/* Egy adott YYYYMM hónap offsetje az aktuális hónaphoz képest (a fetchMonth
   ezt várja). Heti navigációnál a kiválasztott hét hónapjait kérjük le. */
function monthOffsetForKey(key) {
  const y = +key.slice(0, 4), m = +key.slice(4, 6) - 1;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - now.getMonth());
}

/* A mai naphoz viszonyított ISO hét (hétfő–vasárnap). */
function weekRangeForOffset(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset * 7);
  const info = weekInfo(localIso(d));
  return { week: info.week, monday: info.monday, sunday: info.sunday, offset };
}

/* A hét által érintett hónapok YYYYMM kulcsai (hónaphatáron kettő is lehet). */
function monthsForWeek(range) {
  const out = [];
  const d = new Date(range.monday + 'T12:00:00');
  const end = new Date(range.sunday + 'T12:00:00');
  while (d <= end) {
    const key = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    if (!out.includes(key)) out.push(key);
    d.setDate(d.getDate() + 1);
  }
  return out;
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
    loadWeek(0);
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
        saveMonthCache(target);
        setOffline(false);
        return { data: hit, dataNext: state.dataNext };
      }
      if (!fallback && chunks.some((m) => m.menu || m.orders)) fallback = r;
    }
    if (fallback) {
      // válasz jött, csak a kért hónaphoz nincs menü -> "Nincs menü ebben a hónapban"
      state.data = fallback;
      state.dataNext = fallback.ordersNext || null;
      saveMonthCache(target);
      setOffline(false);
      return { data: fallback, dataNext: state.dataNext };
    }
    throw lastErr || new Error('Nem sikerült betölteni a menüt.');
  } catch (err) {
    // Hálózati hiba / offline: a korábban lekért havi adatokból dolgozunk.
    const cached = loadMonthCache(target);
    if (cached?.data && isNetworkError(err)) {
      state.data = cached.data;
      state.dataNext = cached.dataNext || null;
      setOffline(true);
      return { data: cached.data, dataNext: state.dataNext };
    }
    if (!navigator.onLine) {
      throw new Error('Nincs becsült adat erre a hónapra offline módban.');
    }
    throw err;
  }
}

/* ---------- étkezés-típusok (reggeli / ebéd / vacsora) ----------
   Az API `mealDict` mezője a mealType -> étkezés kulcs leképezése, pl.
   "Reggeli" -> "breakfast", "Ebéd A" -> "lunch", "Vacsora" -> "dinner".
   Ha a válaszban van reggeli vagy vacsora, akkor ezekre is lehet választani. */

/* Az étkezés-csoportok megjelenítési sorrendje és felirata. */
const MEAL_GROUPS = [
  { key: 'breakfast', label: 'Reggeli' },
  { key: 'lunch', label: 'Ebéd' },
  { key: 'dinner', label: 'Vacsora' },
];
const MEAL_ORDER = MEAL_GROUPS.map((g) => g.key);

function mealGroupOf(mealType) {
  const dict = state.data?.mealDict;
  const mapped = mealType ? dict?.[mealType] : null;
  if (mapped) return mapped;
  // tartalék: a mealDict hiányában a magyar étkezésnév kezdete alapján
  return /^\s*reggeli/i.test(mealType || '') ? 'breakfast'
    : /^\s*vacsora/i.test(mealType || '') ? 'dinner'
      : 'lunch';
}

/* A menüelem "másodlagos" jelölése: "Ebéd A" -> "A", "Reggeli" -> "".
   A take-meal body-ba a választási betű (A/B/...) megy (implicit A, ha nincs). */
function mealVariant(mealType) {
  const type = String(mealType || '').trim();
  const group = mealGroupOf(type);
  const pretty = MEAL_GROUPS.find((g) => g.key === group)?.label || 'Ebéd';
  if (type === pretty) return '';
  return type.startsWith(pretty) ? type.slice(pretty.length).trim() : '';
}

/* Az étkezés teljes felirata a menükártyán, pl. "Ebéd A", "Reggeli". */
function mealDisplayType(group, mealType) {
  const pretty = MEAL_GROUPS.find((g) => g.key === group)?.label || 'Ebéd';
  const variant = mealVariant(mealType);
  return variant ? `${pretty} ${variant}` : pretty;
}

/* A kártyán megjelenő étkezés-csoportok: mindig van ebéd, reggeli/vacsora
   csak akkor, ha az adott napra az orders válaszban tényleg van ilyen menü
   (őszi/téli szünetben, vagy ha az intézmény nem ad ilyet, egyszerűen nincs). */
function dayGroups(menusByGroup, ordersByGroup) {
  return MEAL_ORDER.filter((key) => key === 'lunch' ||
    (menusByGroup[key]?.length || 0) > 0 || (ordersByGroup[key]?.length || 0) > 0);
}

/* adott dátumhoz (YYYYMMDD) összeállítja a nap adatait étkezésenként.
   A `groups` az adott napra létező étkezések [{key, label, menus, order}]:
   a `menus` a választható menük (pl. A és B ebéd), az `order` pedig az adott
   étkezéshez tartozó rendelés (a napon tehát reggelihez és ebédhez külön
   rendelés lehet). A nap-szintű `order` a lemondáshoz az ebéd rendelése. */
function dayInfo(dateKey) {
  const resp = state.data;
  const iso = displayIso(dateKey); // HU nap a kijelzéshez
  const menu = (resp?.menu || []).filter((m) => ymd(m.mealDate) === dateKey);
  const orders = (resp?.orders || [])
    .filter((o) => ymd(o.orderDate || o.menuMeal?.mealDate) === dateKey);

  const menusByGroup = {};
  for (const m of menu) {
    const group = mealGroupOf(m.mealType);
    (menusByGroup[group] = menusByGroup[group] || []).push(m);
  }
  const ordersByGroup = {};
  for (const o of orders) {
    const group = mealGroupOf(o.menuMeal?.mealType);
    (ordersByGroup[group] = ordersByGroup[group] || []).push(o);
  }

  // A rendelés a választási határidőket tartalmazza. Ha a napra több
  // étkezés is tartozik, az ebédét használjuk a nap-szintű lemondáshoz.
  const order = ordersByGroup.lunch?.[0] || orders[0] || null;

  const groups = dayGroups(menusByGroup, ordersByGroup).map((key) => {
    const info = MEAL_GROUPS.find((g) => g.key === key);
    return {
      key,
      label: info.label,
      menus: menusByGroup[key] || [],
      order: ordersByGroup[key]?.[0] || null,
    };
  });

  const selectDeadline = order?.selectMenuDeadline || null;
  const cancelDeadline = order?.cancelDeadline || null;
  return {
    dateKey, iso, order, groups,
    selectDeadline,
    cancelDeadline,
    selectClosed: isDeadlinePassed(selectDeadline),
    cancelClosed: isDeadlinePassed(cancelDeadline),
  };
}

/* A kiválasztott hét napjai, amelyekhez van menü. A hónaphatáron átnyúló
   heteket a loadWeek két hónap adataiból fűzi össze. */
function collectDays() {
  const range = state.weekRange;
  if (!range) return [];
  const keys = new Set((state.data?.menu || []).map((m) => ymd(m.mealDate)));
  return [...keys].sort().map((k) => dayInfo(k))
    .filter((d) => d.iso >= range.monday && d.iso <= range.sunday);
}

/* ---------- mutations ---------- */
/* Az `o` a kiválasztott étkezés rendelése (reggeli / ebéd / vacsora),
   a `menuLetter` pedig a választási betű (A/B/…; üres = egyetlen menü). */
async function chooseMeal(day, o, menuLetter) {
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
    menu: menuLetter || 'A',
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

/* Egy menükártya egy étkezés-csoporton belül (pl. "Ebéd A", "Reggeli").
   A `group.order` a csoport rendelése; ha nincs (pl. vacsorára nincs
   rendelés, csak menü), a kártya csak megjelenít, választani nem lehet. */
function mealCard(day, group, meal) {
  if (!meal) return '';
  const allerg = allergeneNames(meal.allergenes, state.data?.allergenes);
  const letter = mealVariant(meal.mealType);
  const o = group.order;
  const tag = mealDisplayType(group.key, meal.mealType);
  const chosen = !!o?.menuMeal?.chosen && mealVariant(o.menuMeal.mealType) === letter;
  const cancelled = !!o?.cancelDate;
  let reason = '';
  if (!o) reason = `Erre a napra nincs rendelés (${group.label.toLowerCase()}).`;
  else if (cancelled) reason = 'A nap le van mondva – előbb vond vissza a lemondást.';
  else if (state.offline) reason = 'Offline módban nem módosítható.';
  else if (isDeadlinePassed(o.selectMenuDeadline)) {
    reason = `A választási határidő lejárt (${fmtDeadline(o.selectMenuDeadline)}).`;
  } else if (state.busy) reason = 'Feldolgozás…';
  const disabled = !!reason;
  return `
    <button class="meal-choice${chosen ? ' selected' : ''}${cancelled ? ' cancelled' : ''}${isDeadlinePassed(o?.selectMenuDeadline) ? ' closed' : ''}"
            data-day="${day.dateKey}" data-group="${group.key}" data-meal="${esc(meal.id || '')}" data-menu="${esc(letter)}"
            title="${esc(reason)}" ${disabled ? 'disabled' : ''}>
      <span class="meal-tag meal-tag-${group.key}">${esc(tag)}</span>
      <div class="meal-name">${esc(meal.mealName)}</div>
      <div class="meal-meta">${meal.energy ? meal.energy + ' kcal' : ''}${allerg ? ' • ' + esc(allerg) : ''}</div>
    </button>`;
}

/* Egy étkezés-csoport (Reggeli / Ebéd / Vacsora) blokkja a napkártyán. */
function mealGroupBlock(day, group) {
  const menus = Array.isArray(group.menus) ? group.menus : [];
  if (!menus.length) return '';
  return `
    <section class="meal-group meal-group-${group.key}">
      <header class="meal-group-head">
        <span class="meal-group-title">${esc(group.label)}</span>
      </header>
      <div class="meal-choices">
        ${menus.map((meal) => mealCard(day, group, meal)).join('')}
      </div>
    </section>`;
}

function isUnselected(day) {
  const groups = Array.isArray(day.groups) ? day.groups : [];
  return groups.some((g) => g.order && !g.order.cancelDate && !g.order.menuMeal?.chosen);
}

function dayBadge(day) {
  const groups = (Array.isArray(day.groups) ? day.groups : []).filter((g) => g.order);
  const active = groups.filter((g) => !g.order.cancelDate);
  if (!active.length) return '<span class="day-badge cancelled">Lemondva</span>';
  if (active.every((g) => g.order.menuMeal?.chosen)) {
    return '<span class="day-badge ok">✓ Választva</span>';
  }
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

  // A lemondás a nap egészére szól (ebéd), ezért csak akkor jelenik meg,
  // ha erre a napra tényleg van rendelés.
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
        ${(day.groups || []).map((group) => mealGroupBlock(day, group)).join('')}
        ${day.order ? `
        <button class="btn ${cancelled ? 'primary' : 'danger'} day-cancel${day.cancelClosed ? ' closed' : ''}"
                data-day="${day.dateKey}" data-action="${cancelled ? 'uncancel' : 'cancel'}"
                title="${esc(cancelReason)}" ${cancelReason ? 'disabled' : ''}>
          ${cancelled ? 'Mégis kérem (visszavonás)' : 'Ebéd lemondása'}
        </button>` : ''}
      </div>
    </section>`;
}

/* Nyitáskor az aznapi ebédre (ha nincs, a következő elérhető napra) ugrunk. */
function focusToday(days) {
  if (state.autoScrolled || state.weekOffset !== 0) return;
  const today = todayIso();
  const target = days.find((d) => d.iso === today) || days.find((d) => d.iso > today);
  if (!target) return;
  state.autoScrolled = true;
  requestAnimationFrame(() => {
    const el = DAYS_EL.querySelector(`.day-card[data-date="${target.iso}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderDays() {
  const days = collectDays();
  const range = state.weekRange || weekRangeForOffset(state.weekOffset);
  const weekNumEl = document.getElementById('week-number');
  const weekDatesEl = document.getElementById('week-dates');
  if (weekNumEl) weekNumEl.textContent = `${range.week}. hét`;
  if (weekDatesEl) weekDatesEl.textContent = fmtWeekRange(range.monday, range.sunday);

  if (!days.length) {
    DAYS_EL.innerHTML = '<p class="foot">Nincs menü ezen a héten.</p>';
    return;
  }

  const today = todayIso();
  const current = today >= range.monday && today <= range.sunday;
  // A heti összesítő csak a rendeléssel rendelkező napokat számolja,
  // így a reggeli/vacsora nélküli napok nem rontják az "x/y ebéd" arányt.
  const orderDays = days.filter((d) => d.order);
  const chosen = orderDays.filter((d) => d.order.menuMeal?.chosen && !d.order.cancelDate).length;
  DAYS_EL.innerHTML = `
    <section class="week-group${current ? ' week-current' : ''}" data-week-offset="${state.weekOffset}">
      <header class="week-head">
        <span class="week-label">${current ? 'Ez a hét' : 'Kiválasztott hét'}</span>
        <span class="week-meta">${chosen}/${orderDays.length} ebéd kiválasztva</span>
      </header>
      <div class="week-days">
        ${days.map((day) => renderDayCard(day, today)).join('')}
      </div>
    </section>`;
  focusToday(days);
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
  state.months = {};
  state.weekOffset = 0;
  state.weekRange = null;
  state.data = null;
  state.dataNext = null;
  state.autoScrolled = false;
  showView('main');
  await loadWeek(0);
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
  await loadWeek(0);
}


/* ---------- orchestration ---------- */
/* Egy hónap adatainak biztosítása. A hétváltásnál csak akkor kérünk újra,
   ha még nincs a memória-cache-ben (vagy módosítás után force=true). */
async function ensureMonthPayload(key, force = false) {
  if (!force && state.months[key]) return state.months[key];
  const payload = await fetchMonth(monthOffsetForKey(key));
  const normalized = { data: payload?.data || null, dataNext: payload?.dataNext || null };
  state.months[key] = normalized;
  return normalized;
}

/* A hét napjaihoz szükséges hónapok válaszainak összefűzése. A hónaphatáron
   átnyúló hétnél így a két hónap menüje/rendelése is megjelenik. */
function mergeWeekData(payloads) {
  const menu = [], orders = [];
  const seenMenu = new Set(), seenOrder = new Set();
  let allergenes = {};
  const mealDict = {};
  for (const payload of payloads) {
    for (const chunk of [payload?.data, payload?.dataNext]) {
      if (!chunk) continue;
      if (!Object.keys(allergenes).length && chunk.allergenes) allergenes = chunk.allergenes;
      // a mealType -> étkezés leképezés hónaponként/ordersNextenként eltérhet
      Object.assign(mealDict, chunk.mealDict || {});
      for (const m of chunk.menu || []) {
        const key = ymd(m.mealDate) + '|' + m.mealType;
        if (seenMenu.has(key)) continue;
        seenMenu.add(key);
        menu.push(m);
      }
      for (const o of chunk.orders || []) {
        const key = ymd(o.orderDate || o.menuMeal?.mealDate) + '|' +
          (o.externalOrderId ?? o.orderVersion ?? '');
        if (seenOrder.has(key)) continue;
        seenOrder.add(key);
        orders.push(o);
      }
    }
  }
  return { menu, orders, allergenes, mealDict };
}

/* Egy megadott hétre betöltött (memória- vagy localStorage-) adatokból
   megmondja, van-e egyáltalán étel (menü) azon a héten. Az őszi/téli
   szünetek hetei üresek, ezeket a nyilakkal való navigáció átugorja. */
function weekHasMeals(range, payloads) {
  const data = mergeWeekData(payloads);
  return (data.menu || []).some((m) => {
    const iso = displayIso(ymd(m.mealDate));
    return iso >= range.monday && iso <= range.sunday;
  });
}

/* A localStorage-ba mentett havi válasz betöltése egy hónaphoz (offline
   esethez), ugyanabban a formában, ahogy az ensureMonthPayload visszaadja. */
function cachedPayloadForMonth(key) {
  const cached = loadMonthCache(key);
  return cached ? { data: cached.data || null, dataNext: cached.dataNext || null } : null;
}

/* Merre és meddig keressük a nem üres hetet (kb. egy év, előre/hátra). */
const WEEK_SKIP_LIMIT = 52;

/* A megadott héttől a `dir` (-1 vagy +1) irányban az első olyan hét
   offsetje, amelyen van étel. Ha nincs ilyen (pl. nyár közepe), akkor az
   utolsó vizsgált hét jön vissza, hogy a felhasználó lássa, ott nincs menü. */
async function findMealWeek(startOffset, dir, force = false) {
  let lastChecked = startOffset;
  for (let step = 1; step <= WEEK_SKIP_LIMIT; step++) {
    const offset = startOffset + dir * step;
    const range = weekRangeForOffset(offset);
    const payloads = [];
    for (const key of monthsForWeek(range)) {
      try {
        payloads.push(await ensureMonthPayload(key, force));
      } catch (_) {
        // hálózati hiba: a localStorage-os tartalékot használjuk
        const cached = cachedPayloadForMonth(key);
        if (cached) payloads.push(cached);
      }
    }
    lastChecked = offset;
    // ha egyetlen hónap adatát sem sikerült megszerezni, ne ugorjunk tovább
    if (!payloads.length) return offset;
    if (weekHasMeals(range, payloads)) return offset;
  }
  return lastChecked;
}

let weekLoadSeq = 0;

async function loadWeek(offset, force = false, { skipEmpty = false } = {}) {
  const seq = ++weekLoadSeq;
  const prevOffset = state.weekOffset; // a navigáció irányához (üres hét átugrása)
  state.weekOffset = offset;
  state.weekRange = weekRangeForOffset(offset);
  state.autoScrolled = state.autoScrolled && offset === 0;

  if (!state.diner) return;
  if (force) state.months = {};

  setStatus('Betöltés…');
  let months = monthsForWeek(state.weekRange);
  let payloads = [];
  let lastErr = null;

  for (const key of months) {
    try {
      payloads.push(await ensureMonthPayload(key, force));
    } catch (e) {
      lastErr = e;
    }
  }

  // Közben másik hétre navigált a felhasználó: a régi választ eldobjuk.
  if (seq !== weekLoadSeq) return;

  if (!payloads.length) {
    state.data = null;
    state.dataNext = null;
    setStatus('Hiba: ' + (lastErr?.message || 'Nem sikerült betölteni a menüt.'));
    renderDays();
    return;
  }

  const data = mergeWeekData(payloads);

  // Nyilakkal való navigációnál az üres (szünet) heteket átugorjuk.
  if (skipEmpty && !data.menu.length) {
    const dir = offset >= prevOffset ? 1 : -1;
    const target = await findMealWeek(offset, dir, force);
    if (seq !== weekLoadSeq) return;
    if (target !== offset) {
      // a továbblépés már nem ugrik, hogy ne lehessen végtelen ciklusba futni
      await loadWeek(target, force);
      return;
    }
  }

  state.data = data;
  state.dataNext = null;
  renderDays();
  setStatus(lastErr ? 'Figyelem: ehhez a hétre csak részleges adat érhető el.' : '');
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
    await loadWeek(state.weekOffset, true); // friss orderVersion miatt mindig újra
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
  state.months = {};
  state.weekOffset = 0;
  state.weekRange = null;
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

// A nyilakkal lépkedve az étel nélküli (szünet) heteket átugorjuk, hogy
// ne kelljen üres étlapokon keresztül görgetni.
document.getElementById('prev-week').addEventListener('click', () => loadWeek(state.weekOffset - 1, false, { skipEmpty: true }));
document.getElementById('next-week').addEventListener('click', () => loadWeek(state.weekOffset + 1, false, { skipEmpty: true }));

DAYS_EL.addEventListener('click', (e) => {
  const mealBtn = e.target.closest('.meal-choice');
  if (mealBtn && !mealBtn.disabled) {
    const day = dayInfo(mealBtn.dataset.day);
    // A kattintott étkezés (reggeli / ebéd / vacsora) rendelését használjuk,
    // mert a napon több rendelés is lehet (a choose-meal az orderId-t várja).
    const group = (day.groups || []).find((g) => g.key === mealBtn.dataset.group);
    withBusy(() => chooseMeal(day, group?.order || day.order, mealBtn.dataset.menu));
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
      await loadWeek(state.weekOffset, true);
    } else {
      await startSession();
    }
  } catch (e) {
    setStatus('Hiba: ' + e.message);
    if (state.data) renderDays();
  }
}

/* ---------- fejlesztői demó (bejelentkezés és API nélkül) ----------
   Böngészőben:  ZipMealLite.demo({ breakfast: true, dinner: true })
   A megadott hétre hamis étlapot/rendeléseket tölt be, hogy a reggeli/vacsora
   megjelenítés kipróbálható legyen valódi fiók nélkül. */
function demoWeekRange(offset, withMeals) {
  const range = weekRangeForOffset(offset);
  const menu = [];
  const orders = [];
  if (!withMeals) return { menu, orders };

  const types = ['Ebéd A', 'Ebéd B'];
  if (state.demo?.breakfast) types.unshift('Reggeli');
  if (state.demo?.dinner) types.push('Vacsora');

  const d = new Date(range.monday + 'T12:00:00');
  const end = new Date(range.sunday + 'T12:00:00');
  const deadline = new Date(Date.now() + 86400000).toISOString();
  let n = 0;
  while (d <= end) {
    // hétvégén nincs menü
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      const key = localIso(d);
      // Az API a magyar éjfélt T23:00:00Z-ként küldi (előző nap 23:00 UTC),
      // ezért a mealDate az előző napot tartalmazza – a demó is így utánozza.
      const utcKey = localIso(new Date(d.getTime() - 86400000));
      const mealDate = utcKey + 'T23:00:00Z';
      const orderDate = utcKey + 'T23:00:00.000Z';
      for (const type of types) {
        const group = mealGroupOf(type);
        const variant = mealVariant(type);
        menu.push({
          id: `demo-${key}-${type}`,
          mealDate,
          mealType: type,
          mealName: `${group} ${variant} mintaétel – ${key}`.trim(),
          energy: String(600 + (n++ % 250)),
          allergenes: '1,7,12',
        });
        orders.push({
          orderDate,
          selectMenuDeadline: deadline,
          cancelDeadline: deadline,
          cancelDate: null,
          consumedDate: null,
          quantity: 1,
          cardId: state.diner?.cardId,
          externalOrderId: `${key}${type}`,
          externalOrderTypeId: 1,
          version: 1,
          orderVersion: 1,
          institutionId: state.diner?.institutionId,
          menuMeal: {
            id: `demo-order-${key}-${type}`,
            mealDate,
            mealName: `${group} ${variant} mintaétel – ${key}`.trim(),
            mealType: type,
            chosen: variant === 'A' || !variant,
          },
        });
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return { menu, orders };
}

function demoMerge(payloads) {
  const data = mergeWeekData(payloads);
  data.mealDict = {
    Reggeli: 'breakfast', Tízórai: 'brunch', Ebéd: 'lunch', 'Ebéd A': 'lunch',
    'Ebéd B': 'lunch', Uzsonna: 'snack', Vacsora: 'dinner',
  };
  data.allergenes = {
    1: 'Glutén', 3: 'Tojás', 7: 'Tej / laktóz', 10: 'Mustár', 12: 'Kén-dioxid',
  };
  return data;
}

const realLoadWeek = loadWeek;

async function demoLoadWeek(offset = 0, force = false, { skipEmpty = false } = {}) {
  const prevOffset = state.weekOffset;
  // Demóban minden 3. hét üres (pl. szünet), hogy az átugrás kipróbálható legyen.
  const withMeals = ((offset % 3) + 3) % 3 !== 1;
  state.weekOffset = offset;
  state.weekRange = weekRangeForOffset(offset);
  setStatus('Demó adatok – bejelentkezés nélkül.');
  const week = demoWeekRange(offset, withMeals);
  const data = demoMerge([{ data: { menu: week.menu, orders: week.orders }, dataNext: null }]);

  if (skipEmpty && !data.menu.length) {
    const dir = offset >= prevOffset ? 1 : -1;
    return demoLoadWeek(offset + dir, force, { skipEmpty });
  }
  state.data = data;
  renderDays();
}

window.ZipMealLite = {
  state,
  // belső segédfüggvények (teszteléshez / hibakereséshez)
  debug: {
    displayIso: (k) => displayIso(k),
    ymd: (i) => ymd(i),
    dayInfo: (k) => dayInfo(k),
    collectDays: () => collectDays(),
    // a kijelzett nap ellenőrzése: a menu/order UTC kulcsa + 1 nap
    dayKeyFromMenu: (m) => displayIso(ymd(m.mealDate)),
  },
  clearDemo() {
    state.data = null;
    showView('login');
    loadWeek = realLoadWeek;
  },
  demo({ breakfast = false, dinner = false, weekOffset = 0 } = {}) {
    state.demo = { breakfast, dinner };
    state.diner = state.diner || {
      cardId: 'DEMO', institutionId: 'DEMO', fullName: 'Demó Diák',
      group: '9.A', institutionName: 'Demó Iskola',
    };
    state.profile = state.profile || { fullName: 'Demó Diák', group: '9.A' };
    state.autoScrolled = false;
    loadWeek = demoLoadWeek;
    showView('main');
    document.getElementById('user-name').textContent = 'Demó Diák';
    document.getElementById('user-group').textContent = 'Demó Iskola • 9.A';
    return demoLoadWeek(weekOffset);
  },
};

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

