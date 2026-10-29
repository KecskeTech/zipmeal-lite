# Heti navigáció

- `state.weekOffset` (0 = aktuális hét), `weekRangeForOffset()` adja a hétfő/vasárnapot.
- `loadWeek(offset, force, { skipEmpty, dir })`: hónapok lekérése
  (`ensureMonthPayload`), összefűzés (`mergeWeekData`), majd ha `skipEmpty` és a
  **megjelenítendő adatban** nincs étel (`dataHasMeals`) → `findMealWeek(offset, dir)`
  megkeresi az első ételes hetet (max 52 hét).
- A nyilak a `navigateWeek(dir)`-en át hívják (dir = -1 / +1, `skipEmpty: true`).
- Induláskor (bejelentkezés, étkezőváltás, „Mai nap”, online visszatérés, offline
  cache-ből való betöltés) is `skipEmpty: true, dir: 1` fut, hogy ha az aktuális hét
  üres (szünet), egyből a következő ételes hét jelenjen meg. A módosítás utáni
  frissítés nem ugrik.
- Ha a keresett irányban nincs ételes hét (pl. a nyár elején), `findMealWeek` `null`-t
  ad: ilyenkor **nem lépünk sehova**, a legutóbbi ételes hét marad (és `stayPinned`
  miatt ugyanabba az irányba a további kattintások sem próbálkoznak újra).
- `state.weekOffset` **csak akkor** íródik át, amikor a hét tényleg kirajzolásra kerül.
  Így egy nem elérhető (jövőbeli) hétre lépés nem hagy „szellem” offsetet maga után:
  a visszalépéshez nem kell kétszer nyomni a balra nyilat, és a betöltés közbeni
  kattintás is a megjelenített hétből számol.
- `findMealWeek` azonnal `null`-t ad, ha a vizsgált hét utolsó hónapjára a szerver
  egyáltalán nem adott adatot (a válasz csak egy korábbi hónapot ismétel), mert a
  további hetek sem lesznek elérhetők – így nem fut végig hiába 52 héten.
- Kirajzolás után `prefetchNeighborWeeks(offset)` a háttérben lekéri az előző és a
  következő hét olyan hónapjait, amelyek még nincsenek a memória-cache-ben. Így a
  hónaphatáron átnyúló hétre (pl. november → december) lépés nem vár hálózatra.
  A folyamatban lévő kéréseket a `monthPrefetch` Map deduplikálja, az előtöltés
  hibáit csendben elnyeli, offline módban pedig nem indul.
- Az előtöltés `fetchMonth(..., { probe: true })`-dal csak a **kanonikus** orders
  kérést küldi el (startMonth = előző hónap, advance = 1), nem próbálja végig a
  három stratégiát. Ha abban nincs benne a hónap, az `prefetchMisses`-be kerül
  (a session során nem kérdezzük újra), a kipróbált body pedig az
  `attemptedBodies`-ba, így a tényleges hétváltás a maradék stratégiákkal
  próbálkozik, ugyanazt a kérést nem küldi el kétszer.
- Mobilon a `#days` területen **vízszintes swipe** is navigál: balra húzás →
  következő hét, jobbra → előző hét (`touchstart`/`touchmove`/`touchend`, csak
  egyértelműen vízszintes mozdulatnál; a függőleges görgetést nem fogja el).
  A swipe végén keletkező kattintást capture fázisban elnyeli, nehogy ételt
  válasszon. A húzás alatt `transform`, utána `week-in-next` / `week-in-prev`
  animáció; `prefers-reduced-motion` esetén nincs animáció.
- `weekLoadSeq` védi a versenyhelyzetet (közben másik hétre lépés).
- A felső sáv **„Mai nap”** gombja (`jumpToToday()`): `loadWeek(0)`, majd a mai
  napkártyára görget (ha nincs mai menü, a következő ételes napra, végső esetben
  az első kártyára). Ilyenkor `state.autoScrolled = false`, hogy a `focusToday()`
  is a mai napra álljon.

## Ismert csapdák (ezeket már egyszer elrontottuk)

- A napokat mindig `dayIso`/`dayKey`-jel számold (helyi nap), **ne** `ymd` + 1 nappal.
- A hét „üres-e” döntést a megjelenítendő (`mergeWeekData`) adatból hozd
  (`dataHasMeals`), ne egy hónap-payloadból (az más hónapokat is tartalmaz).
- Az átugrás iránya ne a `state.weekOffset`-ból legyen visszafejtve (az már átíródott),
  hanem paraméterként jöjjön (`dir`).
- A demó-ciklusban a dátumot (`new Date(d)`) rögzítsd, mert a `d` a ciklus végén továbblép.
