# AGENTS.md – ZipMeal Lite (kanonikus jegyzet AI-asszisztenseknek)

Ez a fájl a projekt „térképe”. Ha új munkamenetben dolgozol rajta, **ezt olvasd el
először**, és ne az egész `app.js`-t olvasd végig. A felhasználói/repo-szintű
`README.md` a felhasználóknak szól; ez itt a fejlesztői/AI kontextus.

## Mi ez?

Egyetlen statikus PWA (nincs build, nincs csomagkezelő): `index.html` + `styles.css`
+ `app.js` (vanilla JS, `'use strict'`, IIFE nélkül, globális függvényekkel) +
`sw.js` + `manifest.json`. A GitHub Pages szolgálja ki a
`https://ziplite.kecske.win/` címen (a repóban lévő `CNAME` miatt).

## Fájlok

| Fájl | Szerep |
| --- | --- |
| `app.js` | teljes klienslogika: API-hívások, tokenek, heti nézet, renderelés, demó |
| `index.html` | 3 nézet: `#login-view`, `#diner-view` (szülői gyermekválasztó), `#main-view` |
| `styles.css` | design tokenek a `:root`-ban (`--primary`, `--bg`, `--card`, `--line`…), BEM-szerű, sima osztálynevek |
| `sw.js` | app shell cache; az API-t **nem** cache-eli. Ha a HTML/CSS/JS változik, **emeld a `CACHE` verziót** (pl. `zipmeal-lite-v8`) |
| `CNAME` | `ziplite.kecske.win` |
| `LICENSE` | AGPL-3.0 (a fejlécet ne töröld a fájlokból) |

## API (https://zipmeal.hu/api)

- `POST /users/token` → `{access_token, refresh_token}` (plaintext jelszó, HTTPS-en)
- `POST /users/refresh-token` → új tokenpár; access ~4 óra, refresh ~31 nap
- `GET /users/details`, `GET /users/diner-info` → profil / étkező(k)
- `POST /users/orders` `{cardId, startMonth: "YYYYMM", advance}` → `{orders, menu, allergenes, mealDict, ordersNext}`
- `POST /users/choose-meal` `{cardId, orderId, organOrder:{fejId, etkezesTipusId, kezdete, vege, cancelDate}, version, institutionId, menu}`
- `POST /users/cancel-meals` és `POST /users/add-meal` `{cardId, organOrder:{kezdete, vege}}` (lemondás / visszavonás)

### Dátum-csapda (fontos!)

`mealDate` / `orderDate` értéke `…T23:00:00.000Z`, ami **magyar idő szerint a
következő nap 00:00**. Ezért:
- az API kulcs (`kezdete`/`vege`, `YYYYMMDD`) = az ISO string első 10 karaktere
  (`ymd()`), és a kijelzett (magyar) nap ennél **+1 nap** (`displayIso()`).
- `dayInfo()` a **kulcsot** kapja (pl. `"20261019"`), az `iso` mező a magyar nap.
- A `menu`/`orders` szűrése mindig a kulccsal történik.

### Ékezetes stringek

A forrásfájlok **UTF-8 + CRLF**. Az ékezetes stringek (`Ebéd`, `Reggeli`, `Vacsora`,
`Betöltés…`, `✓`, `–`) részei a logikának (pl. `mealVariant()` a `"Ebéd A"` → `"A"`
kivágáshoz a magyar feliratot használja) – ne írd át ASCII-ra.

## Étkezés-csoportok (reggeli / ebéd / vacsora)

- `mealDict` a `mealType` → `breakfast | lunch | dinner (+brunch/snack)` leképezés.
  Ezt a `mergeWeekData()` gyűjti össze a hónapokból és az `ordersNext`-ből.
- `MEAL_GROUPS` adja a megjelenítési sorrendet és a magyar feliratot.
- `mealGroupOf(mealType)`: `mealDict` alapján; ha nincs, a magyar név kezdete alapján.
- `mealVariant(mealType)`: `"Ebéd A"` → `"A"`, `"Reggeli"` → `""` (a `choose-meal`
  `menu` mezőjébe megy; üresnél `"A"`).
- `dayInfo(key)` → `{ dateKey, iso, order, groups: [{key, label, menus, order}], … }`.
  A nap-szintű `order` az **ebéd** rendelése (lemondáshoz); a csoport saját
  `order`-je a választáshoz kell (a napon több order is lehet).
- A kártyán **mindig** van Ebéd blokk; Reggeli/Vacsora csak akkor, ha arra a napra
  van menü/rendelés. Így ha nincs reggeli, a UI változatlanul csak ebédet mutat.
- Renderelés: `renderDayCard()` → `mealGroupBlock()` → `mealCard()`.

## Heti navigáció

- `state.weekOffset` (0 = aktuális hét), `weekRangeForOffset()` adja a hétfő/vasárnapot.
- `loadWeek(offset, force, { skipEmpty })`: hónapok lekérése (`ensureMonthPayload`),
  összefűzés (`mergeWeekData`), majd ha `skipEmpty` és nincs menü →
  `findMealWeek(offset, dir)` megkeresi a következő nem üres hetet (max 52 hét).
- A nyilak (`#prev-week`, `#next-week`) `skipEmpty: true`-val hívják; a többi hívás
  (bejelentkezés, módosítás utáni frissítés, online visszatérés) nem ugrik.
- `weekLoadSeq` védi a versenyhelyzetet (közben másik hétre lépés).

## Állapot & cache

`state`: `diner, profile, diners, isParent, data, dataNext, months, weekOffset,
weekRange, busy, offline, autoScrolled, demo`.

- Tokenek: `localStorage` (`zm_access`, `zm_refresh`).
- Offline cache: `zm_cache_v1_*` (`month_<cardId>_<YYYYMM>` és `session`).
  A cache-elt `data` a `mergeWeekData()` kimenete, tehát a `mealDict`-et is tartalmazza.
- `logout()` mindent töröl (tokenek + cache), és a login nézetre vált.

## UI

- Nézetek: `showView('login' | 'diner' | 'main')`.
- A `.day-card` szándékosan **határozottabb** hátterű/árnyékú, mint a `.week-group`
  (ami áttetsző) – így a kártyák elválnak az oldal háttérétől. Ne „világosítsd” vissza.
- A login képernyő alján `.login-disclaimer` (adatkezelési figyelmeztetés).
- Toast: `setStatus()`; a gombok letiltása `state.busy` és a határidők alapján történik.

## Demó / tesztelés

- `ZipMealLite.demo({breakfast, dinner})` hamis étlapot tölt be (minden 3. hét üres),
  `ZipMealLite.clearDemo()` visszaállít. `ZipMealLite.debug` a belső segédfüggvényeket adja.
- jsdom-alapú ellenőrzés: a repón kívül, temp mappában (`npm i jsdom`), a valódi
  `index.html` + `app.js` betöltésével: login disclaimer, csoportok sorrendje,
  „csak ebéd” eset, üres hét átugrása.
- Windows-on a `node`/`git` könnyen „beragad” (lapozó, élő timeoutok):
  `git --no-pager …` és `Start-Process node -PassThru` + `WaitForExit(ms)` használata,
  a script végén `process.exit(0)`.

## Stílus, amihez igazodj

- Vanilla JS, 2 szóköz, egyszerű idézőjelek, pontosvessző, `const/let`, opcionális
  láncolás (`?.`), rövid kommentek **magyarul**.
- Ne vezess be build-eszközt, frameworköt vagy új függőséget.
- Minden felhasználónak látszó szöveg magyar, ékezetekkel.

## Deploy

`main` ágra push → GitHub Actions / Pages automatikusan publikál. A `CNAME` miatt a
saját domain szolgálja ki ugyanazt a tartalmat (lásd az issue-ban/README-ben a
domain-magyarázatot).
