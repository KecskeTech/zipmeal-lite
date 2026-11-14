# ZiPMEAL Lite

Nem hivatalos, mobilbarát webes ebédválasztó a ZiPMEAL API-hoz. Egyetlen statikus
webalkalmazás, backend nélkül.

Az alkalmazás vibe codeolva van. A promptokat ember írja, minden mást az AI.

## Élő oldal

https://ziplite.kecske.win/

## Funkciók

- Bejelentkezés ZiPMEAL-fiókkal. A jelszó kizárólag a ZiPMEAL szervereire megy, a
  bejelentkezés csak a saját eszközön, a böngésző tárolójában marad meg. Erre a
  login képernyő alján egy rövid figyelmeztetés is felhívja a figyelmet.
- Havi étlap lekérdezése egy hétre bontva. A felső nyilakkal hétre előre és hátra
  lehet lépni, a hónaphatáron átnyúló heteket is kezeli. Minden hét sorszámot és
  dátumtartományt kap.
- Mai nap gomb a felső sávban. Bármelyik hétnél jársz, visszaugrik az aktuális
  hétre, és a mai napkártyára görget. Ha nincs mai menü, a következő ételes napra
  ugrik.
- Az étel nélküli, szüneti heteket a nyilak automatikusan átugorják. Ha egy héten
  egyáltalán nincs menü, például őszi vagy téli szünetben, a navigáció a következő,
  visszafelé pedig az előző ételes hétre lép. Ha abban az irányban már nincs több
  ételes hét, például a nyár elején, a nézet az ételes héten marad.
- Reggeli, ebéd és vacsora. Az orders válasz `mealDict` mezője alapján a napkártya
  minden olyan étkezést megjelenít, amelyre az adott napon tényleg van menü. Ha
  nincs reggeli vagy vacsora, az a blokk nem jelenik meg, ilyenkor csak az ebéd
  látszik, pontosan úgy, ahogy korábban.
- Az étel kiválasztása, lemondása és a lemondás visszavonása.
- A választási (`selectMenuDeadline`) és lemondási (`cancelDeadline`) határidő külön
  jelenik meg. A lejárt határidő után az érintett gombok szürkék és letiltottak.
- A kártyacsippantás ideje. Ha az ebéd kártyádat már lecsippantották, az ebéd
  fejlécében megjelenik, hány órakor ettél, például "12:35-kor ettél". Az adat az
  orders válasz `consumedDate` mezőjéből jön, ugyanúgy, ahogy az eredeti kliensnél.
- Nyitáskor automatikusan az aznapi ebédre ugrik. Ha nincs mai menü, a következő
  napra ugrik.
- Cache-elt indulás. Ha korábban már be voltál jelentkezve, az app a mentett
  étlapot azonnal megjeleníti, a mai napra görgetve, a login képernyő helyett, és
  a háttérben frissít. A "Frissítés…" jelzés alul látszik. Ha közben változott a
  menü, automatikusan az új étlap jelenik meg.
- A kiválasztás nélküli napokat piros kiemelés jelöli.
- Szülői fióknál belépés után kiválasztható a gyermek, és később is váltható.
- Sötét téma alapértelmezésként. A jobb alsó sarokban lévő gombbal világosra
  váltható, és a választás megmarad a böngészőben.
- Telepíthető PWA. Offline módban a korábban betöltött étlap a böngésző
  `localStorage` cache-éből jelenik meg. Módosítás offline nem lehetséges.

## Offline működés

A service worker az app shellt, vagyis a HTML-, CSS- és JS-fájlokat cache-eli, az
étlap-adatokat pedig az alkalmazás étkezőnként és hónaponként a `localStorage`-ba
menti. Internet nélkül a korábban betöltött hetek étlapja és a választások láthatók.
A választó- és lemondásgombok ilyenkor le vannak tiltva, és egy figyelmeztető sáv
jelzi az offline állapotot.

## SEO-aloldalak

A főoldal mellett önálló, statikus aloldalak is vannak a gyakori keresésekre:
`zipmeal-bejelentkezes.html`, `zipmeal-etlap.html`, `zipmeal-zalaegerszeg.html`,
`zipmeal-kaposvar.html` és `zipmeal-web.html`. A fájlok `.html` végződésűek, a
kanonikus URL viszont kiterjesztés nélküli, például `/zipmeal-etlap`, mert a GitHub
Pages ezt is kiszolgálja. Az oldalak valódi tartalmat adnak, nem átirányítások.
Szerepelnek a `sitemap.xml`-ben, és a főoldalról is linkeljük őket. Új aloldalnál a
`sitemap.xml`-t és a `sw.js` `SHELL` listáját is frissíteni kell.

## Étkezés-típusok

Az orders válasz `mealDict` mezője képezi le a `mealType`-ot étkezésre:

```json
{ "Reggeli": "breakfast", "Ebéd": "lunch", "Ebéd A": "lunch",
  "Ebéd B": "lunch", "Vacsora": "dinner" }
```

A napkártyán a blokkok sorrendje reggeli, ebéd, vacsora. Egy blokk csak akkor
jelenik meg, ha az adott napra van hozzá menü vagy rendelés az orders válaszban,
így a reggeli és vacsora nélküli napokon a kártya csak az ebédet mutatja. A `menu`
mezőből csak a választási betűt küldjük a `choose-meal` kérésben, tehát a `mealType`
"Ebéd A" értékéből "A" lesz. Reggeli és vacsora esetén ez üres, és a kód ilyenkor
"A"-t küld.

## Fejlesztői demó API és fiók nélkül

A böngésző konzoljából hamis étlap tölthető be, hogy kipróbálható legyen a reggeli
és vacsora megjelenítése, valamint a szüneti hetek átugrása:

```js
ZiPMEALLite.demo({ breakfast: true, dinner: true }) // van reggeli és vacsora is
ZiPMEALLite.demo({ breakfast: false, dinner: false }) // csak ebéd
ZiPMEALLite.clearDemo() // vissza a login képernyőre
```

A demó minden harmadik hetet üresnek jelöl, így a nyilakkal való átugrás is
kipróbálható.

## Helyi futtatás

A `file://` megnyitás nem működik az API CORS- és hálózati viselkedése miatt.
Indíts statikus szervert:

```powershell
python -m http.server -d . 8000
```

Utána nyisd meg a http://localhost:8000 címet.

## Vibe coding

Ez a projekt vibe codeolva van. A funkciók nagy része AI-asszisztens segítségével,
gyors iterációkkal született, emberi ötletadás ~~és utóellenőrzés~~ mellett. A kód
ennek megfelelően egyszerű, olvasható és könnyen módosítható.

## Licenc

A projekt GNU Affero General Public License v3.0 alatt érhető el. A teljes
licencszöveg a [LICENSE](LICENSE) fájlban található.

Copyright (C) 2026 KecskeTech

Ez a program szabad szoftver: terjeszthető és/vagy módosítható a Free Software
Foundation által kiadott GNU Affero General Public License feltételei szerint,
akár a licenc 3. verziója, akár (választásod szerint) egy későbbi verzió alapján.

## Megjegyzés

Az alkalmazás a `zipmeal.hu` nyilvános API-ját használja a felhasználó saját
bejelentkezési adataival. A belépési tokeneket kizárólag a böngésző
`localStorage`-a tárolja, a repóban nem szerepelnek. A kijelentkezés törli a
helyben cache-elt étlap-adatokat is.
