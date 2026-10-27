# Étkezés-csoportok (reggeli / ebéd / vacsora)

- `mealDict` a `mealType` → `breakfast | lunch | dinner (+brunch/snack)` leképezés.
  Ezt a `mergeWeekData()` gyűjti össze a hónapokból és az `ordersNext`-ből.
- `MEAL_GROUPS` adja a megjelenítési sorrendet és a magyar feliratot.
- `mealGroupOf(mealType)`: `mealDict` alapján; ha nincs, a magyar név kezdete alapján.
- `mealVariant(mealType)`: `"Ebéd A"` → `"A"`, `"Reggeli"` → `""` (a `choose-meal`
  `menu` mezőjébe megy; üresnél `"A"`).
- `dayInfo(key)` → `{ dateKey, iso, order, groups: [{key, label, menus, order}], … }`.
  A nap-szintű `order` az **ebéd** rendelése (lemondáshoz); a csoport saját
  `order`-je a választáshoz kell (a napon több order is lehet).
- A kártyán **mindig** van Ebéd blokk; Reggeli/Vacsora csak akkor, ha arra a napra
  van menü/rendelés. Így ha nincs reggeli, a UI változatlanul csak ebédet mutat.
- Renderelés: `renderDayCard()` → `mealGroupBlock()` → `mealCard()`.
