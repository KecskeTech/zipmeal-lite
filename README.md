# ZipMeal Lite

Nem hivatalos, mobilbarát webes ebédválasztó a ZipMeal API-hoz. Egyetlen statikus
webalkalmazás, backend nélkül.

## Élő oldal

https://kecsketech.github.io/zipmeal-lite/

## Funkciók

- Bejelentkezés ZipMeal-fiókkal
- Havi étlap és napi menük megjelenítése
- Ebéd kiválasztása, lemondása és visszavonása
- Kiválasztás nélküli napok piros kiemelése
- Szülői fióknál gyermek kiválasztása belépés után, illetve későbbi váltás
- Telepíthető PWA (offline shell cache)

## Helyi futtatás

A `file://` megnyitás nem működik az API CORS/hálózati viselkedése miatt. Indíts
statikus szervert:

```powershell
python -m http.server -d . 8000
```

Utána: http://localhost:8000

## Megjegyzés

Az alkalmazás a `zipmeal.hu` nyilvános API-ját használja a felhasználó saját
bejelentkezési adataival. A belépési tokenek kizárólag a böngésző
`localStorage`-ában tárolódnak, a repóban nem szerepelnek.
