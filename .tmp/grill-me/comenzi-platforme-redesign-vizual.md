# Grill: Redesign vizual — Comenzi Platforme (Import & AWB)

Started: 2026-10-02

## Summary of the Idea

Redesign vizual (nu funcțional) al ecranului „Import & AWB" din Comenzi Platforme (`index.html`,
`USE_PCOM_REDESIGN`/clasele `.pcx-*`) — ghidul cu 6 pași (`.pcx-check-step`), cardul „▶️ Rulează rutina
zilnică", formularul de import comenzi (eMAG/Trendyol/Vinted/Fișier/Manual) și secțiunea „Expediere"
cu cele 3 module A/B/C (`.pcx-shipping-grid`). Cerut direct, cu o captură de ecran a stării curente:
„cum am putea să dăm redesign aici, să fie mai frumos și mai vizibil, mai premium și mai ușor de
folosit". Logica/fluxul din spate (deja stabilite în `.tmp/grill-me/comenzi-platforme.md` și
`.tmp/grill-me/logica-comenzi-platforme-zilnic.md`) rămân neatinse — doar stilul vizual.

Context tehnic relevant găsit în cod:
- `:root` deja definește o paletă „SaaS light" (`--bg`/`--surf`/`--acc`/`--r`/`--sh`/`--sh2`...),
  extinsă peste toată aplicația (nu doar Research, de unde a pornit).
- `.pcx-*` e deja un prim pas de redesign (cardul alb, pastilele „automat"/"manual", flow cu cercuri
  numerotate) — ecranul din captură NU e stilul vechi, neatins, ci deja o iterație — se cere ÎNCĂ o
  trecere, mai premium.
- Staff (`staff.html`) are un limbaj vizual diferit, mai „glass" (`--glass`/`backdrop-filter:blur`,
  gradient radial discret) — pagină separată, device diferit (tabletă), nu neapărat referința.

## Open Threads
- Direcția vizuală (flat/SaaS curat vs. glass/premium vs. altceva)
- Scopul exact al redesign-ului (doar ecranul din captură vs. tot Comenzi Platforme)
- Ce anume nu „funcționează" vizual acum, din perspectiva utilizatorului
- Densitate/ierarhie: ce trebuie să iasă mai mult în evidență
- Culoare per platformă (eMAG/Trendyol/Vinted) — folosită mai mult sau păstrată minimală
- Cardul „Rutina zilnică" — rol de hero/CTA principal sau unul dintre mai multe
- Ghidul cu 6 pași — păstrat ca listă sau transformat (accordion/progres vizual/altceva)
- Validare: cum evaluăm rezultatul (preview înainte de a atinge fișierul live?)

## Decisions Log

### Q1: Ce direcție vizuală ți se pare „premium"?
- **Recommended:** SaaS curat, dus mai departe (păstrează paleta/stilul actual din index.html, mai rafinat).
- **User's answer / preference:** Glass, ca în Staff (carduri semi-transparente cu blur, gradient discret).
- **Rationale / constraints:** Preferă explicit estetica deja validată pe Staff, nu varianta conservatoare.
- **Knock-on effects:** Trebuie adus `--glass`/`--glass-strong`/`--glass-bd`/`--glass-blur`/`backdrop-filter` (sau echivalent) în index.html, scopat la secțiunea asta (nu global — ar afecta tot admin-ul, risc mare). Fundalul paginii probabil are nevoie de un gradient discret în spate (ca în Staff) ca blur-ul să aibă ce „citi" — de verificat dacă fundalul actual al `#page-research`/body e suficient de variat sau e nevoie de un accent nou.

### Q2: Cât de larg să fie redesign-ul — doar „Import comenzi" sau toate cele 4 taburi din Comenzi Platforme?
- **Recommended:** Doar „Import comenzi" acum, restul separat.
- **User's answer / preference:** Tot Comenzi Platforme — toate cele 4 taburi (Import comenzi, Profit vânzări, Total încasări, Produse de comandat) dintr-o dată.
- **Rationale / constraints:** Vrea consistență completă pe toată pagina, nu un amestec de stiluri între taburi.
- **Knock-on effects:** Scop mult mai mare — trebuie inventariate și celelalte 3 taburi (structură/clase CSS actuale) înainte de implementare. Container real confirmat din cod: `#page-pcom` (nu `#page-sync`, acela e „Sincronizare", o pagină diferită).

### Descoperire tehnică importantă (din cod, nu o întrebare)
`#page-dashboard` are deja EXACT acest tratament „liquid glass" (cerut direct, anterior, pe un mockup
dedicat), explicit scopat să NU afecteze restul aplicației. Reteta exactă există deja în cod:
- Fundal pagină: 3 `radial-gradient`-uri discrete (mov/verde/portocaliu, opacitate 8-14%) peste `var(--bg)`.
- Cadrane (`.stat`/`.dash-total-card`): `background:radial-gradient(...glow mic lângă iconiță din --stat-accent...), rgba(255,255,255,.55)`, `backdrop-filter:blur(20px) saturate(180%)`, border alb semi-transparent, umbră + inset highlight, hover cu translateY.
- **Bonus găsit**: `.stat`/`.dash-total-card` NU mai sunt scopate doar la Dashboard — au fost deja extinse „pe toată aplicația", inclusiv în Comenzi Platforme → Profit vânzări (`#pcom-profit-summary`) — o parte din tabul „Profit vânzări" e deci DEJA parțial în stilul glass cerut.
Plan: reutilizez exact această rețetă (nu inventez una nouă) — extinsă la `#page-pcom` (fundal) și la
`.pcx-card`/`.pcx-shipping-module`/`.pcx-flow`/`.pcx-check-step`/`.pcx-btn` (suprafețele încă „flat").
Consistent cu Dashboard = nu mai arată ca „a 3-a estetică" din aplicație, ci ca aceeași familie vizuală,
dusă acum și în Comenzi Platforme.

### Q3: Sursa exactă a stilului „glass" — rețeta deja aprobată de pe Dashboard, sau tokens-urile din Staff?
- **Recommended:** Rețeta de pe Dashboard (același fișier, deja aprobată).
- **User's answer / preference:** Rețeta de pe Dashboard.
- **Rationale / constraints:** Confirmă explicit — o singură familie vizuală în index.html, nu două sisteme paralele.
- **Knock-on effects:** Implementarea extinde `.stat`/`.dash-total-card`/fundalul `#page-dashboard` la `#page-pcom`, nu portează CSS din staff.html. Risc tehnic mult mai mic (zero coliziuni de nume de clase între fișiere).

### Q4: Ordinea livrării — un tab o dată sau toate 4 deodată?
- **Recommended:** Un tab o dată, încep cu „Import comenzi".
- **User's answer / preference:** Un tab o dată, încep cu „Import comenzi".
- **Rationale / constraints:** Vede rezultatul rapid, corectează o dată, aplică consecvent la rest.
- **Knock-on effects:** Implementarea de ACUM se limitează la tabul „Import comenzi" (ghidul 6 pași, Rutina zilnică, formularul de import, Expediere A/B/C) — Profit vânzări/Total încasări/Produse de comandat rămân pentru o rundă separată, după confirmare.

### Q5: Accent de culoare per platformă (eMAG/Trendyol/Vinted) în taburile de import?
- **Recommended:** Da, discret — eMAG rămâne accentul mov existent, Trendyol capătă portocaliu (`--or`), Vinted verde (`--gr`) — exact tokens-urile deja folosite în Staff, deja în `:root`.
- **User's answer / preference:** Da.
- **Rationale / constraints:** Ajută recunoașterea rapidă a platformei curente.
- **Knock-on effects:** `.pcx-plat-btn.on[data-source="trendyol/vinted"]` capătă reguli noi, scopate `#page-pcom` (nu ating `.research-tab`/alte clase globale). Extins și la modulele B/C din Expediere (bordură stânga colorată: B=verde/Vinted, C=mov/eMAG, A rămâne neutru — multi-curier).

### Q6: „Rutina zilnică" — hero vizual mai pronunțat sau card normal, doar restilizat?
- **Recommended:** Hero vizual — card mai mare, glow mov în jurul butonului, titlu mai mare.
- **User's answer / preference:** Hero vizual.
- **Rationale / constraints:** E acțiunea principală de zi cu zi.
- **Knock-on effects:** Rămâne ca poziție (după checklist — logic, pașii 1-2 manuali trebuie făcuți ÎNAINTE de a rula rutina), dar capătă greutate vizuală clar mai mare: titlu mai mare, glow radial mov (ca la `.stat`), buton mai mare cu umbră proprie — imposibil de ratat cu privirea, chiar fără să fie primul element din DOM.

## Resolved Plan

**Scop exact, runda asta**: doar tabul „Import comenzi" din Comenzi Platforme (`#page-pcom`) — ghidul
cu 6 pași, cardul „Rutina zilnică", formularul de import (eMAG/Trendyol/Vinted/Fișier/Manual) și
„Expediere" (A/B/C). Pentru că aceste carduri folosesc clase PARTAJATE (`.pcx-card`/`.pcx-card-compact`),
restilizarea claselor acoperă automat și cardurile de mai jos din aceeași pagină (Previzualizare
comenzi, Comenzi rămase în urmă, Comenzi anulate, Reactivează, Istoric importuri, Verifică duplicate) —
bonus, nu muncă suplimentară. Profit vânzări/Total încasări/Produse de comandat rămân neatinse, pentru
o rundă separată, după confirmarea asta.

**Rețetă vizuală**: reutilizată EXACT cea deja aprobată pe Dashboard (`#page-dashboard`/`.stat`/
`.dash-total-card`) — niciun sistem nou de clase, niciun import din staff.html.
1. Fundal `#page-pcom`: 3 `radial-gradient` discrete (mov/verde/portocaliu) peste `var(--bg)`, identic ca pe Dashboard.
2. `.pcx-card`/`.pcx-card-compact`/`.pcx-checklist`/`.pcx-flow`: sticlă — `background:rgba(255,255,255,.6)`, `backdrop-filter:blur(18px) saturate(180%)`, border alb semi-transparent, umbră + inset highlight (exact rețeta `#page-dashboard .stat`).
3. „Rutina zilnică": tratament hero — titlu mai mare, glow radial mov în fundal (ca la `.stat`), buton mai mare, umbră proprie.
4. Taburi platformă (`.pcx-plat-btn.on`): eMAG mov (existent), Trendyol portocaliu (`--or`), Vinted verde (`--gr`).
5. Module Expediere (`.pcx-shipping-module`): sticlă mai subtilă + accent stânga colorat (B=verde/Vinted, C=mov/eMAG, A neutru).
6. Butoane (`.pcx-btn-primary`): hover cu ridicare ușoară (`translateY(-1px)`) + umbră mai pronunțată, consistent cu `.stat:hover`.

**Livrare**: implementez, verific sintaxa (2x), fără server local cu date reale conectate — nu pot
vedea rezultatul randat în acest mediu (fără browser/screenshot) — public direct pe Vercel și cer
confirmare vizuală de la utilizator înainte de a trece la celelalte 3 taburi.

