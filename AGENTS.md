# ZipMeal Lite

Egyetlen statikus PWA (vanilla JS, build és csomagkezelő nélkül) a zipmeal.hu
étkezésrendelés klienséhez, GitHub Pages-en kiszolgálva a
`https://ziplite.kecske.win/` címen.

## Quick Reference

- **Build / csomagkezelő:** nincs (statikus fájlok)
- **Deploy:** `main` ágra push → GitHub Actions / Pages automatikusan publikál
- **Futtatás:** `index.html` böngészőben nyitva
- **Nyelv:** minden felhasználónak látszó szöveg és komment magyar, ékezetekkel

## Mielőtt kódot olvasol

Ez a fájl a projekt térképe: ne olvasd végig az `app.js`-t, a részletek a lent
linkelt fájlokban vannak. A `README.md` a felhasználóknak szól, ez itt a
fejlesztői/AI kontextus.

## Részletes útmutatók

- [Architektúra, fájlok, állapot és cache](docs/agent-instructions/architecture.md)
- [API és dátumkezelés](docs/agent-instructions/api-and-dates.md)
- [Étkezés-csoportok](docs/agent-instructions/meals.md)
- [Heti navigáció és ismert csapdák](docs/agent-instructions/week-navigation.md)
- [UI és kódstílus](docs/agent-instructions/ui-and-style.md)
- [Demó és tesztelés](docs/agent-instructions/testing-demo.md)
- [Terminál-szabályok (Windows / PowerShell)](docs/agent-instructions/terminal-windows.md)

## Mindig érvényes

- Ne vezess be build-eszközt, frameworköt vagy új függőséget.
- Ha a HTML/CSS/JS változik, emeld a `sw.js`-ben a `CACHE` verziót.
- A forrásfájlok UTF-8-asak; a repóban a tárolt sorvég LF.
- A korábbi munkamenetek tanulságai (terminál, dátum, navigáció) kötelezőek.
