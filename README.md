# ZipMeal Lite

Nem hivatalos, mobilbarát webes ebédválasztó a ZipMeal API-hoz. Egyetlen statikus
webalkalmazás, backend nélkül.

## Élő oldal

https://kecsketech.github.io/zipmeal-lite/

## Funkciók

- Bejelentkezés ZipMeal-fiókkal
- Havi étlap lekérdezése, **egy hétre bontva**: a felső nyilakkal hétre előre/hátra
  lehet lépni (a hónaphatáron átnyúló heteket is kezeli), hét sorszámmal és
  dátumtartománnyal
- Az étel kiválasztása, lemondása és a lemondás visszavonása
- A **választási (`selectMenuDeadline`) és lemondási (`cancelDeadline`) határidők**
  külön megjelenítése; a lejárt határidő után az érintett gombok szürkék / letiltottak
- Nyitáskor automatikusan az **aznapi ebédre ugrik** (ha nincs mai menü, a következő napra)
- Kiválasztás nélküli napok piros kiemelése
- Szülői fióknál gyermek kiválasztása belépés után, illetve későbbi váltás
- Telepíthető PWA; offline módban a korábban betöltött étlap a böngésző
  `localStorage` cache-éből jelenik meg (módosítás offline nem lehetséges)

## Offline működés

A service worker az app shellt (HTML/CSS/JS) cache-eli, az étlap-adatokat pedig az
alkalmazás menti el a `localStorage`-ba étkezőnként és hónaponként. Internet nélkül
a korábban betöltött hetek étlapja és a választások láthatók; a választó- és
lemondásgombok ilyenkor le vannak tiltva, és egy figyelmeztető sáv jelzi az offline
állapotot.

## Helyi futtatás

A `file://` megnyitás nem működik az API CORS/hálózati viselkedése miatt. Indíts
statikus szervert:

```powershell
python -m http.server -d . 8000
```

Utána: http://localhost:8000

## Licenc

A projekt **GNU Affero General Public License v3.0** alatt érhető el. A teljes
licencszöveg a [LICENSE](LICENSE) fájlban található.

Copyright (C) 2026 KecskeTech

Ez a program szabad szoftver: terjeszthető és/vagy módosítható a Free Software
Foundation által kiadott GNU Affero General Public License feltételei szerint,
akár a licenc 3. verziója, akár (választásod szerint) egy későbbi verzió alapján.

## Megjegyzés

Az alkalmazás a `zipmeal.hu` nyilvános API-ját használja a felhasználó saját
bejelentkezési adataival. A belépési tokenek kizárólag a böngésző
`localStorage`-ában tárolódnak, a repóban nem szerepelnek. A kijelentkezés törli
a helyben cache-elt étlap-adatokat is.
