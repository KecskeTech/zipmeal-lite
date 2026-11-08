# Architektúra, fájlok, állapot és cache

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
| `styles.css` | design tokenek a `:root`-ban (`--primary`, `--bg`, `--card`, `--line`…), a világos téma felülírása `:root[data-theme="light"]` alatt; BEM-szerű, sima osztálynevek. A `.landing-*` osztályok a statikus SEO-aloldalakhoz tartoznak |
| `zipmeal-*.html` | statikus, indexelhető SEO-aloldalak (bejelentkezés, étlap, Zalaegerszeg, Kaposvár, web/eszközök). Nem appnézetek: nincs bennük `app.js`, csak a közös `styles.css` és a téma-inline szkript. A kanonikus URL kiterjesztés nélküli (`/zipmeal-etlap`), a fájl viszont `.html` |
| `sw.js` | app shell cache; az API-t **nem** cache-eli. Ha a HTML/CSS/JS változik, **emeld a `CACHE` verziót** (pl. `zipmeal-lite-v38`) |
| `sitemap.xml` | a főoldal + az összes SEO-aloldal; új aloldalnál ide is fel kell venni |
| `CNAME` | `ziplite.kecske.win` |
| `LICENSE` | AGPL-3.0 (a fejlécet ne töröld a fájlokból) |

## Állapot & cache

`state`: `diner, profile, diners, isParent, data, dataNext, months, weekOffset,
weekRange, busy, refreshing, offline, autoScrolled, demo`.

- Induláskor cache-first: ha van token + `session` cache, a `restoreCachedSession({offline:false})`
  azonnal renderel a `loadCachedWeek()`-kel, majd a háttérben `startSession({keepActiveDiner:true})`
  frissít (`state.refreshing` alatt a kártyák tiltottak, status: „Frissítés…”).

- Tokenek: `localStorage` (`zm_access`, `zm_refresh`).
- Téma: `localStorage` `zm_theme` (`dark` az alap, `light` opcionális).
- Offline cache: `zm_cache_v1_*` (`month_<cardId>_<YYYYMM>` és `session`).
  A cache-elt `data` a `mergeWeekData()` kimenete, tehát a `mealDict`-et is tartalmazza.
- `logout()` mindent töröl (tokenek + cache), és a login nézetre vált.

## Deploy

`main` ágra push → GitHub Actions / Pages automatikusan publikál. A `CNAME` fájlban
beállított saját domain (`ziplite.kecske.win`) szolgálja ki ugyanazt a tartalmat.
