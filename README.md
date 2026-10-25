# ZipMeal Lite

Nem hivatalos, mobilbarát webes ebédválasztó a ZipMeal API-hoz. Egyetlen statikus
webalkalmazás, backend nélkül.

Az alkalmazás **vibe codeolva** van. A promptokat ember írja, minden mást az AI.

## Élő oldal

https://ziplite.kecske.win/

## Funkciók

- Bejelentkezés ZipMeal-fiókkal (a jelszó kizárólag a ZipMeal szervereire megy, a
  bejelentkezés csak a saját eszközön, a böngésző tárolójában marad meg – ezt a
  login képernyő alján egy rövid figyelmeztetés is jelzi)
- Havi étlap lekérdezése, **egy hétre bontva**: a felső nyilakkal hétre előre/hátra
  lehet lépni (a hónaphatáron átnyúló heteket is kezeli), hét sorszámmal és
  dátumtartománnyal
- **„Mai nap” gomb** a felső sávban: bármelyik hétnél jársz, visszaugrik az aktuális
  hétre, és a mai (ha nincs mai menü, a következő ételes) napkártyára görget
- **Az étel nélküli (szüneti) heteket a nyilak automatikusan átugorják**: ha egy
  héten egyáltalán nincs menü (őszi/téli szünet), a navigáció a következő (illetve
  visszafelé az előző) étellel rendelkező hétre lép. Ha abban az irányban már nincs
  több ételes hét (pl. a nyár elején), a kép az ételes héten marad.
- **Reggeli / Ebéd / Vacsora**: az orders válasz `mealDict` mezője alapján a napkártya
  az összes olyan étkezést megjeleníti, amelyre az adott napon **tényleg van menü**.
  Ha nincs reggeli (vagy vacsora), az a blokk egyszerűen nem jelenik meg – ilyenkor
  csak az ebéd látszik, pontosan úgy, ahogy korábban
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

## Étkezés-típusok (reggeli / vacsora)

Az orders válasz `mealDict` mezője képezi le a `mealType`-ot étkezésre:

```json
{ "Reggeli": "breakfast", "Ebéd": "lunch", "Ebéd A": "lunch",
  "Ebéd B": "lunch", "Vacsora": "dinner" }
```

A napkártyán megjelenő blokkok sorrendje: **Reggeli → Ebéd → Vacsora**. Egy blokk
csak akkor jelenik meg, ha az adott napra van hozzá menü (vagy rendelés) az orders
válaszban, így a reggeli/vacsora nélküli napokon a kártya változatlanul csak az
ebédet mutatja. A `menu` mezőből csak a választási betűt (`mealType` → `"Ebéd A"` ⇒
`"A"`) küldjük a `choose-meal` kérésben; a reggeli/vacsora esetén ez üres, és a kód
ilyenkor `"A"`-t küld.

## Fejlesztői demó (API és fiók nélkül)

A böngésző konzoljából hamis étlap tölthető be, hogy a reggeli/vacsora megjelenítés
és a szüneti hetek átugrása kipróbálható legyen:

```js
ZipMealLite.demo({ breakfast: true, dinner: true }) // van reggeli és vacsora is
ZipMealLite.demo({ breakfast: false, dinner: false }) // csak ebéd
ZipMealLite.clearDemo() // vissza a login képernyőre
```

A demó minden harmadik hetet üresnek jelöl, így a nyilakkal való átugrás is
kipróbálható.

## Helyi futtatás

A `file://` megnyitás nem működik az API CORS/hálózati viselkedése miatt. Indíts
statikus szervert:

```powershell
python -m http.server -d . 8000
```

Utána: http://localhost:8000

## Vibe coding

Ez a projekt vibe codeolva van: a funkciók nagy része AI-asszisztens
segítségével, gyors iterációkkal született, emberi ötletadás ~~és utóellenőrzés~~
mellett. A kód ennek megfelelően egyszerű, olvasható és könnyen módosítható.

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
