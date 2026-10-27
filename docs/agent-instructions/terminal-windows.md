# Terminál-szabályok (Windows / PowerShell) – KÖTELEZŐ

A felhasználónak nem kell fejlesztenie a git/node ismereteit, ezért a parancsokat
mindig a lenti formában futtasd. A szabályok **korábbi munkamenetek tanulságai**;
nem kell újra megkérdezni/megbeszélni őket, csak tartsd be őket.

A felhasználói környezetben a `node` és a `git` parancsok **beragadhatnak** (a
terminál csak Ctrl+C-vel jön vissza, gitnél `:` prompt + `q` kell). Ennek okai és a
kikerülésük:

- **Git lapozó/prompt**: a `git log`, `git diff`, `git show` alapból `less`-be megy
  (ott a `:` keresőprompt), a `pull`/`merge`/`commit` editorba, a `push` pedig
  jelszót kérhet. Mindig így hívd:
  - `git --no-pager <alparancs>`
  - `$env:GIT_PAGER='cat'; $env:GIT_EDITOR='true'; $env:GIT_TERMINAL_PROMPT='0'`
  - commit üzenet mindig `-m`-mel (ne nyíljon editor). **Ne** használj a
    commit body-ban PowerShell backtick-es `n`-t: a fájl LF-re normalizálásakor a
    PowerShell `Out-File`/heredoc CRLF-et ír, ami teljes fájlos diffet okoz.
- **Node „lógás”**: a jsdom `setTimeout`-jai életben tartják a folyamatot, ezért a
  szkript végén `process.exit(0)` kell. Hosszú futású parancsot így futtass:

  ```powershell
  $p = Start-Process -FilePath node -ArgumentList 'test.js' -NoNewWindow -PassThru `
       -RedirectStandardOutput out.txt -RedirectStandardError err.txt
  if (-not $p.WaitForExit(30000)) { $p.Kill(); 'TIMEOUT' }
  Get-Content out.txt -Encoding UTF8
  ```

  Ugyanez `git push`-ra: `Start-Process git -ArgumentList 'push','origin','main'` +
  `WaitForExit(90000)`.
- **Ne** futtass `node -e "..."` + `Select-String -Context` kombót PowerShellből: a
  heredoc/quote/konzolkódolás elrontja az idézőjeleket és az ékezeteket. Írj `.js`
  fájlt (pl. a temp mappába), és `Start-Process`-szel futtasd.
- **Kimenet olvasása**: a PowerShell konzol nem UTF-8, ezért az ékezetek `??`/`├│`
  formában jelenhetnek meg — ez csak megjelenítési hiba. A fájlok épségét
  `node -e "…readFileSync(...,'utf8')…"`-vel ellenőrizd (round-trip + `\uFFFD`).
- **Sorvég**: a repóban a tárolt sorvég **LF** (`core.autocrlf=true` csak a
  munkapéldányt teszi CRLF-fé). Ha PowerShell-lel írsz fájlt, normalizáld:
  `node -e "const fs=require('fs');const p='x';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))"`
  és utána `git add`.
