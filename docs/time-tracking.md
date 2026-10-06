# Time tracking per proiect

Două tipuri de timp, **separate** în statistici:

| Sursă | Ce măsoară | Cine îl scrie |
|---|---|---|
| **În aplicație** (`source='web'`) — cronometrul „Timp azi" | Cât lucrezi TU efectiv în aplicația respectivă: tabul e cel selectat, fereastra are focus și ai input real. **Se oprește imediat când pleci de pe tab** (taburile fixate rămân deschise în fundal fără să acumuleze nimic) și continuă când revii. | `time-tracking.js`, direct din pagină |
| **Dezvoltare AI** (`source='claude-code'/'codex'`) | Cât lucrezi cu AI la codul proiectului (activitatea sesiunilor Claude Code / Codex). | trackerul de pe Mac, `scripts/time-tracker.js` |

Totul se salvează în **Supabase** (proiectul `cbpavtvrfpkbaeueexlw`, tabelul `time_sessions`), nu doar în browser.

## Cum măsoară „Timp azi" (în aplicație)

Activ = `document.visibilityState==='visible'` ȘI `document.hasFocus()` ȘI input (mouse/tastatură/scroll) în ultimele 180 s.
- Pleci pe alt tab / altă aplicație / minimizezi → `visibilitychange` / `blur` / `pagehide` închid sesiunea **imediat**, cu salvare `keepalive`.
- Integritatea nu depinde de `beforeunload`: progresul se salvează și la fiecare 15 s (heartbeat). Un tab crăpat lasă cel mult ~15 s nesalvate; sesiunea rămasă deschisă se închide la următoarea deschidere.
- Ceas întârziat (laptop închis / tab suspendat) → intervalul ratat nu se numără. Miezul nopții (ora României) → sesiunea se împarte, „Timp azi" repornește de la 00:00:00, istoricul rămâne.
- Un „dispozitiv" = un browser (id în `localStorage`); indexul unic din bază interzice două sesiuni deschise pe același dispozitiv.
- Parametri (`data-*` pe `<script>`): `idle` (secunde fără input, implicit 180), `mode` (`tab` = măsoară și salvează [implicit], `view` = doar afișează).

## Arhitectură

Un sistem partajat între toate aplicațiile tale: fiecare aplicație își măsoară și arată propriul „Timp azi"; trackerul de pe Mac
adaugă separat timpul de dezvoltare cu AI; **Supabase** păstrează sesiunile și din ele se calculează statisticile.

```
Tab-ul aplicației (time-tracking.js) ┐
Tracker Mac (scripts/time-tracker.js) ┴→  Supabase (time_sessions)  →  widget „Timp azi" + statistici în fiecare aplicație
                                                       ↓
                                          time_daily (view) → statistici: azi / 7 zile / luna / total / comparație
```

## Activare (o singură dată)

1. **Baza de date** — rulează `migration_time_tracking.sql` în Supabase → SQL Editor (idempotent). Creează
   `time_projects`, `time_sessions`, view-ul `time_daily` și indexul unic „o singură sesiune deschisă per dispozitiv".
2. **Trackerul** — pe Mac, din folderul repo-ului:
   ```bash
   node scripts/time-tracker.js run --dry      # test: arată ce detectează, fără să scrie nimic
   node scripts/time-tracker.js install        # pornește automat la logare (launchd, ro.abhomes.time-tracker)
   node scripts/time-tracker.js status         # timpul de azi pe proiect, din baza de date
   node scripts/time-tracker.js uninstall
   ```
   Log: `~/.ab-homes/time-tracker/tracker.log`. Configurare opțională: `~/.ab-homes/time-tracker/config.json`
   (suprascrie orice din `DEFAULTS` — ferestre de timp, aplicații de lucru, lista de proiecte).
3. **Aplicația** — „Timp azi" apare singur în Stoc Manager (sidebar, deasupra „Update #N").

## Trackerul de pe Mac („Dezvoltare AI") — cum decide proiectul activ

Fără permisiuni macOS speciale și fără să citească conținutul conversațiilor — doar *când* s-au scris sesiunile Claude Code
(`~/.claude/projects/<cwd>/*.jsonl`, inclusiv desktop și extensia din IDE) și Codex (`~/.codex/sessions/.../rollout-*.jsonl`).

- **Lucrezi efectiv** = activitate recentă pe proiect (ultimele 2 min) **sau** tastezi/folosești mouse-ul într-o aplicație de
  lucru la cel mult 15 min după ultima activitate. Fără input peste 5 min → nu se numără nimic.
- **Un singur proiect activ**: cel cu activitatea cea mai recentă; schimbarea e imediată, dar nu mai des de 30 s.
  În plus, baza de date refuză două sesiuni deschise pe același dispozitiv (index unic).
- **Sleep / pauză sistem**: intervalul ratat nu se numără. **Schimbarea zilei** (miezul nopții, ora României): sesiunea se
  împarte, „Timp azi" repornește de la 00:00:00, istoricul zilei anterioare rămâne.
- **Crash / oprire bruscă**: sesiunea rămasă deschisă se închide la ultimul heartbeat la următoarea pornire; heartbeat-ul
  salvează progresul la fiecare 15 s, deci se pierd cel mult câteva secunde.

Limită cunoscută: trackerul vede *activitatea AI pe proiect*, nu ce tab e în față în aplicația Claude. Timpul petrecut doar
privind un tab fără activitate sau fără input nu se numără. (Detectarea după titlul ferestrei ar cere permisiunea macOS
Accesibilitate; se poate adăuga ulterior ca semnal suplimentar.)

## Conectarea unui alt proiect (ex. AB Textile)

1. În `scripts/time-tracker.js` (sau în `~/.ab-homes/time-tracker/config.json`) proiectul trebuie să existe în `projects`:
   `{id:'ab-textile', name:'AB Textile', match:['spalatorie-ab-textile']}` — `match` = numele folderului repo-ului. Cele 5
   proiecte curente sunt deja definite.
2. În `index.html`-ul aplicației, înainte de `</body>`:
   ```html
   <script src="https://gestiune-stoc-pi.vercel.app/time-tracking.js" data-project="ab-textile" defer></script>
   ```
   Opțiuni `data-*`: `label` (implicit „Timp azi"), `mount` (selector CSS unde se montează; implicit un element fix în colț),
   `supa-url` / `supa-key` (implicit baza comună). Stilul moștenește variabilele CSS ale aplicației.
3. (Opțional) un rând în `time_projects` pentru nume/culoare în statistici.

### Aplicații Next.js / React (ex. ContaFlow)
Scriptul se încarcă cu `next/script` în layout-ul rădăcină, iar cronometrul se montează într-un container din UI, ca să stea în sidebar,
nu plutitor. `mount-only` îl afișează DOAR în container și îl reatașează singur dacă React îl recreează (ex. după login):
```tsx
<Script src="https://gestiune-stoc-pi.vercel.app/time-tracking.js" data-project="contaflow"
        data-mount="#tt-mount" data-mount-only="true" strategy="lazyOnload" />
// în sidebar: <div id="tt-mount" className="tt-mount" />
```
Culorile widget-ului vin din variabile generice (`--surf`, `--b2`, `--t1`, `--acc`, ...); aplicația le mapează pe propriile token-uri într-un
bloc CSS scurt (vezi `.tt-mount .tt-widget` în `contaflow/app/globals.css`) ca să urmeze tema.

**Conectate acum:** `gestiune-stoc` (Stoc Manager), `contaflow`.

Fiecare aplicație își arată doar propriul „Timp azi", dar panoul de statistici (click pe cronometru) compară toate proiectele.

## Model de date

`time_sessions`: `id`, `project_id`, `device`, `started_at`, `last_seen_at` (heartbeat), `ended_at` (NULL cât e deschisă),
`duration_seconds` (timp activ acumulat, fără pauze), `date` (ziua în Europe/Bucharest), `source` (claude-code / codex).
Statisticile se calculează din aceste sesiuni (view-ul `time_daily` = suma pe proiect/zi).

## Teste

`node scripts/time-tracker.test.js` — nucleul trackerului cu ceas și bază simulate: scenariul „intru → 2 min → schimb proiectul
→ 1 min → revin → refresh → statistici", sleep, inactivitate, miezul nopții, rețea căzută, sesiuni paralele, potrivirea proiectelor.
