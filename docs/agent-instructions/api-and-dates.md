# API és dátumkezelés

## API (https://zipmeal.hu/api)

- `POST /users/token` → `{access_token, refresh_token}` (plaintext jelszó, HTTPS-en)
- `POST /users/refresh-token` → új tokenpár; access ~4 óra, refresh ~31 nap
- `GET /users/details`, `GET /users/diner-info` → profil / étkező(k)
- `POST /users/orders` `{cardId, startMonth: "YYYYMM", advance}` → `{orders, menu, allergenes, mealDict, ordersNext}`
- `POST /users/choose-meal` `{cardId, orderId, organOrder:{fejId, etkezesTipusId, kezdete, vege, cancelDate}, version, institutionId, menu}`
- `POST /users/cancel-meals` és `POST /users/add-meal` `{cardId, organOrder:{kezdete, vege}}` (lemondás / visszavonás)

## Dátum-csapda (fontos!)

`mealDate` / `orderDate` a **helyi (magyar) napot** 23:00-kor jelöli, pl.
`"2026-11-01T23:00:00.000Z"` = november 2. Helyi nap = `new Date(iso)` helyi
napja (így számol az eredeti zipmeal kliens is, `new Date(o).toDateString()`).

**Ne** a UTC dátumrészhez adjunk +1 napot: az csak télen (UTC+1) esik egybe a
helyi nappal, nyáron (CEST, UTC+2) 01:00-re csúszik → a hétfői/vasárnapi ételek
rossz hétre kerülnek, és a szüneti hetek átugrása elromlik.

Kétféle kulcs:
- `ymd(iso)` → `"YYYYMMDD"`, a **szerver** napja (choose-meal / cancel-meals
  `kezdete`/`vege`): az ISO UTC dátumrésze.
- `dayIso(iso)` / `dayKey(iso)` → a **megjelenített** helyi nap (`YYYY-MM-DD` /
  `YYYYMMDD`). `dayInfo()`, `collectDays()`, a hét-ellenőrzés (`dataHasMeals`,
  `weekHasMeals`) és a napkártyák kulcsa mindez.
- `apiDayKey(day, order)` adja a `choose-meal`/`cancel-meals`/`add-meal` body-ba
  a napot (az order `orderDate`/`menuMeal.mealDate` UTC kulcsa).

## Ékezetes stringek

A forrásfájlok UTF-8 kódolásúak. Az ékezetes stringek (`Ebéd`, `Reggeli`, `Vacsora`,
`Betöltés…`, `✓`, `–`) részei a logikának (pl. `mealVariant()` a `"Ebéd A"` → `"A"`
kivágáshoz a magyar feliratot használja) – ne írd át ASCII-ra.
