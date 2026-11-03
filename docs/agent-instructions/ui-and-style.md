# UI és kódstílus

## UI

- Nézetek: `showView('login' | 'diner' | 'main')`.
- A `.day-card` szándékosan **határozottabb** hátterű/árnyékú, mint a `.week-group`
  (ami áttetsző) – így a kártyák elválnak az oldal hátterétől. Ne „világosítsd” vissza.
- A topbar csak a felhasználónevet mutatja; az iskola neve és az osztály
  szándékosan **nem** jelenik meg ott (a gyermekválasztó listában igen).
- A login képernyőn `.login-features` (Offline működés, Gyors, egyszerű), alján
  `.login-disclaimer` (adatkezelési figyelmeztetés) és `.login-vibecoded` jelzés.
- Toast: `setStatus()`; a gombok letiltása `state.busy` és a határidők alapján történik.
- Mobilon (≤640px) a hét-navigációs nyilak `position: fixed`-del a képernyő
  bal/jobb szélén, függőlegesen középen lebegnek (safe-area-t figyelve), így
  egy kézzel is elérhetők és nem foglalnak helyet a tartalomból. Desktopon
  maradnak a hét címkéje mellett, a normál folyamban.

## Téma (sötét / világos)

- A **sötét téma az alapértelmezett** (`<html data-theme="dark">`); a világos
  témát a `data-theme="light"` kapcsolja be.
- Minden szín a `:root` design tokenjeiből jön; a világos értékeket a
  `:root[data-theme="light"]` blokk írja felül. Ne írj bele hardcode-olt
  világos színt a szabályokba – használd a tokent (pl. `--card`, `--surface-2`,
  `--text`, `--primary-line`).
- A választást a fejléchez közeli inline szkript olvassa még a CSS előtt
  (`zm_theme` a localStorage-ban), így nincs villanás; az `app.js`
  `initTheme()`/`setTheme()` csak szinkronban tartja a meta `theme-color`-t,
  a gomb feliratát, és ment.
- A váltó gomb `#theme-toggle` fixen a jobb alsó sarokban van, minden nézetben.

## Stílus, amihez igazodj

- Vanilla JS, 2 szóköz, egyszerű idézőjelek, pontosvessző, `const/let`, opcionális
  láncolás (`?.`), rövid kommentek **magyarul**.
- Ne vezess be build-eszközt, frameworköt vagy új függőséget.
- Minden felhasználónak látszó szöveg magyar, ékezetekkel.
