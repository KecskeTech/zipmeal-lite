# Demó és tesztelés

- `ZipMealLite.demo({breakfast, dinner})` hamis étlapot tölt be (minden 3. hét üres),
  `ZipMealLite.clearDemo()` visszaállít. `ZipMealLite.debug` a belső segédfüggvényeket adja.
- jsdom-alapú ellenőrzés: a repón kívül, temp mappában (`npm i jsdom`), a valódi
  `index.html` + `app.js` betöltésével: login disclaimer, csoportok sorrendje,
  „csak ebéd” eset, üres hét átugrása.
- Windows-on a `node`/`git` könnyen „beragad” – kövesd a
  [Terminál-szabályok](terminal-windows.md) szabályait (`git --no-pager`,
  `Start-Process` + `WaitForExit`, `process.exit(0)`).
