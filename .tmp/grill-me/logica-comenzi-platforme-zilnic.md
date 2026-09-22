# Grill: Logică mai ușoară pentru comenzile zilnice din Comenzi Platforme (eMAG/Trendyol/Vinted)
Started: 2026-09-23

## Summary of the Idea
Utilizatorul vrea o logică mai simplă pentru rutina zilnică de procesare a comenzilor din cele 3 platforme (eMAG, Trendyol, Vinted) din secțiunea „Comenzi Platforme". Sesiunea curentă (aceeași conversație) a avut deja o rundă lungă și intensă de reparații punctuale pe partea de **asociere AWB** (6 formate de etichetă recunoscute, protecție la ambiguitate, etc.) — deci acea bucată e deja relativ matură. Întrebarea de-acum e mai largă: cum arată o zi normală de lucru în Comenzi Platforme, și unde anume se pierde timp/răbdare.

Rutina de azi, așa cum reiese din cod, are aproximativ acești pași separați:
1. `🛒 Adu comenzi eMAG` — buton propriu, prin Conectorul local
2. `🛍️ Adu comenzi Trendyol` — buton propriu, interval de date
3. Vinted — capturi de ecran lipite manual, una câte una, per vânzare + per ecran de expediere
4. Revizuire linie cu linie (produs auto-potrivit, cantitate, preț, linii „amânate"/fără produs)
5. `✓ Selectează toate` (sau bifare individuală) + `Aplică import`
6. SEPARAT: fișierele AWB puse manual în `Desktop/AWB-uri`
7. `📂 Citește din dosarul AWB-uri de pe Mac`
8. Revizuire previzualizare AWB (găsite/nerezolvate/ambigue/anulate)
9. `Asociază AWB-urile`

## Open Threads
- Pragul de încredere pentru auto-includere (ex. >90% potrivire produs) — unde se pune linia exactă?
- Există un checkpoint final („Aplică tot?") înainte ca scrierile reale (stoc, AWB) să se întâmple, sau rutina scrie direct, fără pauză?
- Ce se întâmplă cu liniile „amânate" (stoc negativ) — rămân doar semnalate, sau se leagă automat de „Produse de comandat"?
- Unde trăiește butonul „▶️ Rulează rutina zilnică" (Dashboard, Comenzi Platforme)?
- Rulare doar manuală (apăsat de tine), sau și automată/programată (ex. în fiecare dimineață)?
- Prețurile sub minim / discrepanțe de preț la eMAG/Trendyol — blochează auto-includerea sau doar se semnalează după?

## Decisions Log

### Q1 (comenzi platforme): Direcția „▶️ Rulează rutina zilnică" — un buton care aduce automat comenzile de pe toate 3 platformele, include automat liniile cu potrivire clară, și rulează automat citirea/asocierea AWB, lăsând doar excepțiile pentru tine.
- **Recommended:** Da, exact asta — colapsează 9 pași manuali într-unul singur + o listă scurtă de excepții.
- **User's answer / preference:** Confirmat — „da, e bine așa".
- **Rationale / constraints:** —
- **Knock-on effects:** Deschide întrebări despre praguri de încredere, checkpoint final, și unde trăiește butonul.

### Q2 (comenzi platforme): Etichetele Vinted/GLS fără nicio comandă existentă de asociat — ce se întâmplă?
- **Recommended:** În loc să rămână doar „nepotrivită", creează automat o linie nouă de comandă Vinted din informația de pe PDF (produs potrivit automat, client = destinatar, cod/AWB deja cunoscut, preț necompletat/editabil) — comenzile Vinted pot veni și direct din PDF, nu doar din captură. Cazurile ambigue (2+ candidați existenți) rămân neatinse, tot manuale.
- **User's answer / preference:** Confirmat — „hai să mergem pe logica asta".
- **Rationale / constraints:** Utilizatorul a subliniat explicit: „avem PDF în calcul pentru Vinted, comenzile pot veni prin PDF" — deci PDF-ul trebuie tratat ca sursă validă de comandă nouă, nu doar ca mijloc de asociere AWB la o comandă deja existentă.
- **Knock-on effects:** Linia nouă creată din PDF intră în categoria „preț necompletat" — trebuie decis dacă blochează includerea sau doar rămâne editabilă (întrebare încă deschisă, ridicată dar nerezolvată explicit).

### Q3 (comenzi platforme): Linia Vinted creată din PDF, fără preț — se poate include așa, sau e blocată până completezi prețul?
- **Recommended:** Blocată până completezi prețul — o comandă fără preț inclusă din greșeală ar strica profitul/marja din Dashboard și Jurnal.
- **User's answer / preference:** NU — rămâne includerea posibilă și fără preț, „pentru atunci când ne grăbim".
- **Rationale / constraints:** Utilizatorul preferă viteza/flexibilitatea în momentele aglomerate față de o protecție automată aici — preferă să completeze prețul ulterior, manual, dacă e cazul.
- **Knock-on effects:** Rapoartele de profit/marjă trebuie să tolereze linii Vinted cu preț 0/necompletat fără să crape sau să distorsioneze grav cifrele — posibil un semn vizual („⚠ preț necompletat") în Jurnal/Dashboard pentru aceste linii, de revizuit ulterior.

### Q4 (comenzi platforme): Rutina scrie direct (stoc, AWB) fără pauză, sau un singur checkpoint final înainte de scriere?
- **Recommended:** Un singur checkpoint, la final — rezumat scurt („N comenzi gata, M excepții") + un buton „Aplică tot", nu revizuire linie cu linie ca azi.
- **User's answer / preference:** De acord.
- **Rationale / constraints:** —
- **Knock-on effects:** Confirmă modelul „un click de pornire + un click de aplicare, cu o listă scurtă de excepții la mijloc" — următoarea întrebare firească e dacă rularea se declanșează doar manual sau și programat (ceea ce ar intra în conflict cu un checkpoint uman, dacă nimeni nu e prezent să apese „Aplică").

### Q5 (comenzi platforme): Rutina se pornește doar manual, sau și programat/automat?
- **Recommended:** Doar manual — un checkpoint uman final (Q4) nu se împacă cu o rulare complet automată, fără nimeni prezent să aplice.
- **User's answer / preference:** Doar manuală.
- **Rationale / constraints:** Consecvent cu decizia de la Q4.
- **Knock-on effects:** Niciun mecanism de scheduling/cron de construit — rămâne un buton simplu, apăsat de utilizator.

### Q6 (comenzi platforme): Liniile „amânate" (stoc insuficient) — rămân doar excepție manuală, sau se leagă automat de „Produse de comandat"?
- **Recommended:** Se leagă automat — produsul apare pe lista de comandat, fără să caute separat.
- **User's answer / preference:** Confirmat, cu clarificare cerută și confirmată explicit: linia de comandă RĂMÂNE manuală/în excepții (nu se auto-include/aplică, exact ca azi) — DOAR produsul respectiv se adaugă automat pe „Produse de comandat". Cele două decizii (ce se întâmplă cu comanda blocată vs. ce trebuie recomandat) rămân separate, dar acum vizibile împreună, nu izolate ca azi.
- **Rationale / constraints:** Utilizatorul a vrut să confirme explicit că nu se schimbă decizia de business (tot manual dacă forțează comanda pe stoc negativ) — doar vizibilitatea automată câștigată.
- **Knock-on effects:** Leagă acest fir direct de firul întrerupt „logica-comenzi-stoc.md" (Comandă furnizor / Produse de comandat) — cele două idei converg aici, în punctul unde o comandă client blocată alimentează automat lista de reordonare.

### Q7 (comenzi platforme): Unde trăiește butonul „▶️ Rulează rutina zilnică" — Dashboard sau Comenzi Platforme?
- **Recommended:** Dashboard — primul lucru văzut la deschiderea aplicației.
- **User's answer / preference:** În Comenzi Platforme (nu Dashboard).
- **Rationale / constraints:** Nespecificat explicit de utilizator.
- **Knock-on effects:** Butonul se adaugă în interfața existentă din `#page-pcom`, lângă/înlocuind fluxul actual de import (nu necesită modificări pe Dashboard).

### Q8 (comenzi platforme): Liniile „⚠ vândut sub minim" — excepție manuală, sau auto-incluse cu avertisment vizual?
- **Recommended:** Excepție manuală — o vânzare sub prag înseamnă bani pierduți, merită un ochi înainte de confirmare.
- **User's answer / preference:** Auto-incluse, doar cu avertisment vizual (nu blochează).
- **Rationale / constraints:** Nespecificat explicit — pattern consecvent cu Q3 (preferă viteză/flux neîntrerupt în fața protecțiilor automate care ar opri rutina).
- **Knock-on effects:** Rutina auto-include liniile sub minim; avertismentul „⚠ vândut sub minim" rămâne vizibil DOAR în rezumatul/istoricul post-aplicare, nu ca blocaj — consecvent cu modelul „excepții = doar lucruri genuin nerezolvabile automat (fără produs, ambiguu), nu avertismente de business".

### Q9 (comenzi platforme): Ce prag de încredere la potrivirea produsului e „suficient de sigur" pentru auto-includere?
- **Recommended:** 100% pentru potrivire exactă (cod/EAN/SKU cunoscut) — deja sigură; ~70% pentru potrivire fuzzy pe nume (coborât de la 90% aruncat inițial, ca să prindă majoritatea cazurilor clare, consecvent cu tiparul „flux neîntrerupt" din Q3/Q8).
- **User's answer / preference:** Confirmat — „da, hai așa".
- **Rationale / constraints:** —
- **Knock-on effects:** Fixează ultimul parametru numeric rămas deschis. Toate firele deschise ale acestui subiect sunt acum rezolvate.

## Open Threads
_(toate rezolvate — vezi Resolved Plan mai jos)_

## Resolved Plan

**Butonul „▶️ Rulează rutina zilnică"**, în Comenzi Platforme (`#page-pcom`), apăsat manual (fără scheduling/cron). La apăsare, rulează automat, într-un singur pas, tot ce azi sunt 9 acțiuni separate:

1. **Aducere comenzi** — eMAG (`Adu comenzi eMAG`) + Trendyol (`Adu comenzi Trendyol`) + verificare Vinted-uri nerezolvate, toate deodată.
2. **Potrivire + auto-includere**:
   - Potrivire EXACTĂ (cod/EAN/SKU cunoscut) → auto-inclusă, prag 100% (deja sigură).
   - Potrivire FUZZY pe nume → auto-inclusă de la **~70%** în sus (coborât de la ideea inițială de 90%, ca să prindă majoritatea cazurilor clare fără blocaje).
   - Linii „⚠ vândut sub minim" → **auto-incluse**, cu avertisment vizual păstrat în rezumat/istoric — NU blochează.
3. **Etichete Vinted/GLS (digitale sau PDF generat de noi) fără nicio comandă existentă de asociat** → se creează automat o **linie nouă de comandă Vinted**, direct din informația de pe etichetă:
   - Produs → potrivit automat cu produsul intern (aceeași logică fuzzy ca la capturi).
   - Client → numele destinatarului de pe etichetă.
   - Cod/AWB → deja cunoscut din etichetă.
   - Preț → necompletat, **editabil, dar NU blochează includerea** — poate fi lăsat 0/gol pentru cazurile în care te grăbești, completat manual ulterior.
   - Cazurile AMBIGUE (2+ comenzi Vinted existente, nerezolvate, cu titlu identic) rămân NEATINSE — tot manuale, ca azi (fără schimbare aici, e deja construit din sesiunea curentă).
4. **Linii „amânate" (stoc insuficient)** — rămân EXACT ca azi, excepție manuală, NU se auto-includ/aplică. În plus, automat, produsul respectiv e adăugat pe „Produse de comandat" — vizibilitate câștigată, fără să schimbe decizia de business.
5. **Citire + asociere AWB din `Desktop/AWB-uri`** — rulează automat, folosind logica deja construită (6 formate + protecția la ambiguitate/comenzi împachetate).
6. **UN SINGUR checkpoint final, uman**: un rezumat scurt („N comenzi gata, M excepții") + un buton „Aplică tot" — nicio scriere reală (stoc, AWB) nu se întâmplă înainte de acest click.
7. **Excepțiile rămase pentru tine** (lista scurtă, nu revizuire linie cu linie ca azi): linii fără produs, ambigue, sau cu stoc insuficient (amânate).

**Ce NU se schimbă**: logica deja construită azi în sesiune pentru recunoașterea celor 6 formate de etichetă AWB, protecția la ambiguitate Vinted, excluderea comenzilor deja împachetate din potrivire — toate rămân neatinse, doar orchestrate automat de rutina nouă.

**Fir conex, netratat aici**: legătura automată produs-amânat → „Produse de comandat" (Q6) deschide o punte spre fluxul „Comandă furnizor" discutat în `.tmp/grill-me/logica-comenzi-stoc.md` (întrerupt la cererea utilizatorului, nefinalizat) — merită revizitat separat dacă se implementează asta.

**Implementare — NU s-a discutat încă**: acesta e planul de LOGICĂ/UX, nu de implementare. Rămân de stabilit: structura exactă a codului (funcție nouă vs. reorganizare `pcxRenderOrders`/`readAwbFolderPdfs`), UI-ul exact al ecranului de rezumat/excepții, și ordinea de construire (probabil: mai întâi auto-includerea cu praguri, apoi legătura AWB, apoi crearea de comenzi Vinted din PDF, apoi legătura cu „Produse de comandat").
