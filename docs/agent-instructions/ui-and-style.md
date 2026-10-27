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

## Stílus, amihez igazodj

- Vanilla JS, 2 szóköz, egyszerű idézőjelek, pontosvessző, `const/let`, opcionális
  láncolás (`?.`), rövid kommentek **magyarul**.
- Ne vezess be build-eszközt, frameworköt vagy új függőséget.
- Minden felhasználónak látszó szöveg magyar, ékezetekkel.
