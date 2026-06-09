# Grill: Sincronizare stoc eMAG/Trendyol
Started: 2026-06-07

## Summary of the Idea
O secțiune nouă în aplicația Stoc Manager (index.html) prin care utilizatorul ar putea sincroniza
cumva stocul produselor sale (array `P`, tabela `produse`) cu stocul/listările de pe platformele
de marketplace eMAG și Trendyol. Momentan aplicația are doar un calculator de profit cu valori
introduse manual pentru aceste platforme (pcCalcEmag/pcCalcTrendyol, ~linia 1233-1257), nu există
nicio integrare reală cu API-urile eMAG Marketplace sau Trendyol Seller.

## Open Threads
_(toate rezolvate — vezi Resolved Plan)_

## Decisions Log

### Q1: Cum rezolvăm partea de backend/autentificare pentru API-urile eMAG/Trendyol, având în vedere că aplicația e un fișier HTML static fără server propriu?
- **Recommended:** Construim un mic backend/proxy nou (ex: Vercel Serverless Function) care ține credențialele eMAG/Trendyol în siguranță pe server și face apelurile API în numele aplicației.
- **User's answer / preference:** A ales recomandarea mea ("recomandă tu") — construim un backend/proxy nou.
- **Rationale / constraints:** API-urile de marketplace cer credențiale secrete și foarte probabil nu permit CORS direct din browser; expunerea lor în clientul static ar fi o vulnerabilitate de securitate (spre deosebire de cheia anon Supabase, care e sigură de expus per design).
- **Knock-on effects:** Deschide întrebări noi: ce platformă de hosting/funcții serverless folosim (Vercel Functions?), unde stocăm credențialele (env vars Vercel), ce limbaj/runtime pentru proxy, cum testăm local. De asemenea trebuie clarificat scopul exact al sincronizării (citire stoc, scriere stoc, prețuri, comenzi) înainte de a proiecta proxy-ul.

### Q2: Care e direcția sincronizării — citire, scriere sau bidirecțională?
- **Recommended:** Doar citire la început (vezi stocul de pe eMAG/Trendyol în aplicație, fără a modifica nimic acolo) — risc minim, util pentru a depista discrepanțe înainte de a automatiza scrierea.
- **User's answer / preference:** Bidirecțional — ambele sensuri, cu reconciliere.
- **Rationale / constraints:** Utilizatorul vrea sincronizare completă (nu doar vizualizare), ceea ce înseamnă că modificările de stoc trebuie să curgă în ambele sensuri.
- **Knock-on effects:** Deschide nevoia critică de: (1) reguli clare de rezolvare a conflictelor — ce se întâmplă când stocul local diferă de cel de pe platformă la momentul sincronizării; (2) o "sursă de adevăr" sau strategie de reconciliere (ex: cea mai recentă modificare câștigă, sau local e mereu maestru, sau se cere confirmare manuală la conflict); (3) urmărirea modificărilor (cine/ce a schimbat ultima dată stocul — local vs. comandă nouă pe platformă) — probabil necesită timestamp-uri/log de sincronizare în Supabase.

### Q3: La conflict (stoc local 10, stoc eMAG 7 din cauza unei comenzi noi), care valoare câștigă?
- **Recommended:** Comenzile de pe platformă scad automat stocul local — platforma e sursa de adevăr pentru vânzări, local rămâne sursa pentru reaprovizionări.
- **User's answer / preference:** A confirmat recomandarea — comenzile de pe platformă scad automat stocul local.
- **Rationale / constraints:** Modelul reflectă fluxul real: o vânzare pe eMAG/Trendyol e un eveniment ireversibil care trebuie reflectat local; reaprovizionările pornesc din aplicația locală (unde se gestionează achizițiile/`P`).
- **Knock-on effects:** Acest model seamănă conceptual cu jurnalul de vânzări existent (`JL`/`vanzari_zilnice`/`saveJurnalEntry`) — comenzile de pe platforme ar trebui probabil să apară și în jurnalul de vânzări local, ca să rămână coerent cu vânzările directe. Trebuie clarificat: (a) sincronizarea trebuie să creeze și intrări în jurnal pentru comenzile online, sau doar să ajusteze cantitatea?; (b) cum se evită dubla scădere dacă utilizatorul a introdus deja manual vânzarea?; (c) sensul invers — când utilizatorul modifică stocul local (ex. adaugă marfă nouă), cum/când ajunge actualizarea pe eMAG/Trendyol (manual, automat, la fiecare modificare, programat)?

### Q4: Comenzile online ar trebui să apară și în Jurnalul de vânzări, sau doar să ajusteze stocul?
- **Recommended:** Da — comanda online devine o intrare în Jurnal (JL/jurnal), marcată vizibil cu sursa (eMAG/Trendyol), pentru istoric complet și statistici de profit corecte într-un singur loc.
- **User's answer / preference:** A confirmat recomandarea — apare și în jurnal, cu sursa marcată.
- **Rationale / constraints:** Coerență cu fluxul existent de vânzări (JL/vanzari_zilnice/jurnal) — utilizatorul vrea o singură sursă de adevăr pentru istoricul vânzărilor, indiferent de canal.
- **Knock-on effects:** Necesită: (a) extinderea schemei `jurnal` (și posibil a UI-ului Jurnalului) cu un câmp "sursă/canal" (manual, eMAG, Trendyol); (b) un mecanism de deduplicare — sincronizarea trebuie să recunoască o comandă deja procesată (ex. ID extern de comandă salvat) ca să nu o introducă de două ori la sincronizări succesive; (c) posibil impact asupra calculului de profit — comenzile eMAG/Trendyol au comisioane diferite (vezi pcCalcEmag/pcCalcTrendyol) față de vânzarea directă, deci profitul afișat în jurnal ar trebui calculat diferit în funcție de sursă.

### Q5: Când se declanșează sincronizarea — manual, automat (programat), sau ambele?
- **Recommended:** Manual, la apăsarea unui buton — simplu, fără infrastructură suplimentară (cron jobs), control total al utilizatorului.
- **User's answer / preference:** Manual, la apăsarea unui buton.
- **Rationale / constraints:** Pornire simplă, fără costuri/complexitate de cron jobs pe Vercel și fără riscul de a depăși limitele de request-uri (rate limits) impuse de eMAG/Trendyol prin polling automat.
- **Knock-on effects:** Simplifică semnificativ arhitectura — proxy-ul serverless poate fi un endpoint simplu invocat la cerere (fără nevoie de cron/job scheduler). Rămâne deschisă întrebarea UI: unde apare acest buton (tab nou dedicat vs. integrat în Inventar) și ce feedback vizual primește utilizatorul în timpul/după sincronizare (progres, rezultate, erori per produs).

### Q6: Unde apare noua secțiune — tab nou dedicat, integrată în Inventar, sau per-produs?
- **Recommended:** Tab nou dedicat „Sincronizare” — al patrulea tab, cu buton de sincronizare, status conexiune, jurnal de sincronizări și conflicte/erori, izolat și ușor de extins.
- **User's answer / preference:** Tab nou dedicat „Sincronizare”.
- **Rationale / constraints:** Funcționalitatea e suficient de complexă (mapare produse, status, conflicte, erori per platformă) încât merită spațiu propriu, fără să aglomereze Inventarul existent.
- **Knock-on effects:** Necesită adăugarea unui buton nou în navigarea principală (`goPage`/`.h-tab`, ~linia 951) și o pagină `#page-sync` nouă în structura existentă de tab-uri. Deschide întrebarea despre maparea produselor: cum leagă utilizatorul un produs din `P` de oferta corespunzătoare de pe eMAG (de obicei prin `part_number_key`/SKU) și de pe Trendyol (prin `barcode`/`productMainId`) — mapare manuală, automată după SKU, sau mixtă cu confirmare?

### Q7: Cum se face maparea produs local <-> ofertă eMAG/Trendyol, având în vedere că SKU-urile NU coincid?
- **Recommended:** (întrebarea inițială propunea potrivire automată după SKU cu confirmare manuală — dar utilizatorul a clarificat că SKU-urile nu se potrivesc deloc).
- **User's answer / preference:** SKU-ul nu ajută — doar titlul se aseamănă (parțial) cu titlul din ERP-ul local. Propune potrivire după titlu sau imagine. În plus, există mai multe listări (oferte) pe platforme care corespund aceluiași produs de bază local — sistemul trebuie să le consolideze pe toate către produsul de bază unic.
- **Rationale / constraints:** Identificatoarele tehnice (part_number_key, productMainId, barcode) nu coincid cu SKU-ul intern; titlul e singurul punct de ancorare aproximativ, iar relația e many-to-one (mai multe listări -> un singur produs local).
- **Knock-on effects:** (a) Aplicația are deja un mecanism de potrivire fuzzy după nume — `fuzzyMatch`/`findExistingProduct`, folosit la import facturi — care poate fi reutilizat/adaptat ca punct de plecare pentru sugestii de mapare după titlu; (b) potrivirea după imagine ar fi mult mai complexă (necesită analiză vizuală prin OpenAI, similar cu `analyzeImage`) și costisitoare per sincronizare — de evaluat dacă e necesară de la început sau ca îmbunătățire ulterioară; (c) e necesară o mapare PERSISTENTĂ many-to-one (listare_id_extern -> produs_local_id), salvată undeva (probabil tabel nou în Supabase), construită o dată (cu ajutorul sugestiilor fuzzy + confirmare manuală) și refolosită la fiecare sincronizare — nu re-potrivire de la zero de fiecare dată.

### Q8: Cum se construiește inițial maparea many-to-one listare-platformă <-> produs local?
- **Recommended:** Sugestii automate după titlu (reutilizând `fuzzyMatch`/`findExistingProduct` existent) + utilizatorul confirmă/grupează manual mai multe listări sub același produs de bază; legătura se salvează permanent.
- **User's answer / preference:** A confirmat recomandarea — sugestii automate după titlu + confirmare/grupare manuală, salvată permanent.
- **Rationale / constraints:** Combină eficiența potrivirii automate cu acuratețea validării umane, esențială când identificatoarele tehnice nu coincid; reutilizează un mecanism deja prezent și testat în flow-ul de import facturi.
- **Knock-on effects:** Necesită un ecran/UI dedicat în noul tab „Sincronizare” pentru: (a) afișarea listărilor nemapate cu sugestii fuzzy ordonate după scor; (b) acțiune de confirmare/respingere/regrupare manuală; (c) un tabel nou în Supabase (ex: `mapari_platforme` sau extensie a `produse`) ce reține `{platforma, id_extern_listare, produs_id_local, confirmat_de_user}`. Construirea inițială a mapării presupune și un prim apel către API-urile eMAG/Trendyol pentru a obține lista completă de listări — ceea ce readuce în discuție proxy-ul/backend-ul (Q1) ca prim pas obligatoriu de implementare.

### Q9: Ai deja acces de API/credențiale la conturile de seller eMAG și Trendyol?
- **Recommended:** (întrebare de verificare a fezabilității, fără recomandare anume — depinde strict de situația reală a utilizatorului).
- **User's answer / preference:** Nu încă — trebuie să verifice/ceară acces.
- **Rationale / constraints:** Fără credențiale API valide, nu se poate construi sau testa nimic din integrare — e o dependență externă, blocantă.
- **Knock-on effects:** Acesta devine PRIMUL pas obligatoriu, înaintea oricărei implementări tehnice: utilizatorul trebuie să obțină acces API la eMAG Marketplace (de obicei prin Seller Center -> secțiunea API/Integrări) și la Trendyol Seller Center (Partner API), să afle ce tip de credențiale oferă (API key/secret, OAuth, user/parolă), ce limite de request-uri (rate limits) există, și ce date oferă efectiv API-urile despre stocuri/comenzi/listări — informații care vor determina concret cum arată proxy-ul (Q1) și ce e posibil de implementat. Planul final ar trebui să marcheze explicit acest pas ca blocant/preliminar față de tot restul.

### Q10: Scopul sincronizării — doar cantități de stoc, sau și prețuri?
- **Recommended:** Doar cantitățile de stoc — scop clar, mai simplu de implementat și testat; prețurile rămân gestionate separat (ca acum, prin calculatorul de profit existent).
- **User's answer / preference:** Doar cantitățile de stoc.
- **Rationale / constraints:** Limitarea scopului inițial reduce semnificativ complexitatea (un singur tip de date de sincronizat, reguli de conflict mai simple) și păstrează separarea curentă față de calculatorul de profit (pcCalcEmag/pcCalcTrendyol), care rămâne neschimbat.
- **Knock-on effects:** Restrânge clar suprafața funcționalității — proxy-ul (Q1) trebuie să citească/scrie DOAR câmpul de cantitate disponibilă pentru fiecare listare, nu prețuri/alte atribute. Sincronizarea prețurilor rămâne un posibil candidat pentru o iterație viitoare, dar e explicit în afara scopului inițial.

### Q11: Ce se întâmplă la stoc local 0 — se trimite simplu 0, se dezactivează anunțul, sau altceva?
- **Recommended:** Doar actualizează cantitatea la 0 — comportament simplu și predictibil; platforma decide ea însăși vizibilitatea anunțului cu stoc 0.
- **User's answer / preference:** Regulă mai nuanțată — "când ajunge la 0, dacă avem stoc pe drum, punem un stoc nou și creștem timpul de livrare". Adică: dacă există marfă comandată/în tranzit de la furnizor, sincronizarea ar trebui să trimită o cantitate (din stocul "pe drum") în loc de 0, însoțită de o creștere a timpului estimat de livrare al anunțului.
- **Rationale / constraints:** Scopul e să nu piardă vânzări/vizibilitate când stocul fizic e temporar 0 dar reaprovizionarea e deja în curs — un anunț cu stoc 0 dispare/scade în clasamente, în timp ce unul cu stoc disponibil + livrare mai lungă rămâne activ.
- **Knock-on effects:** Aplicația urmărește acum cantitatea „pe drum” prin `incomingQty`/`incoming_qty`. Pentru a implementa regula, mai este nevoie de: (a) o regulă de calcul pentru „ce cantitate trimitem”; (b) configurarea creșterii timpului de livrare per platformă; (c) — vezi Q12, unde s-a decis amânarea acestei reguli.

### Q12: "Stoc pe drum + creștere timp livrare" — în prima versiune sau amânat?
- **Recommended:** Amânat pentru o etapă ulterioară — prima versiune trimite simplu cantitatea exactă (inclusiv 0); regula mai sofisticată vine după ce sistemul de bază e stabil și se cunosc exact posibilitățile API-urilor privind timpul de livrare.
- **User's answer / preference:** A confirmat recomandarea — lăsăm pentru mai târziu.
- **Rationale / constraints:** Păstrează scopul primei versiuni restrâns și fezabil (conform deciziei de la Q10 — doar cantități, simplu); evită proiectarea unui concept complet nou ("stoc pe drum") înainte de a avea sistemul de bază funcțional și de a ști ce permit efectiv API-urile pentru timpul de livrare.
- **Knock-on effects:** Confirmă scopul minim al primei versiuni: la stoc local 0, sincronizarea trimite simplu cantitatea 0 către platformă (ca în varianta recomandată inițial la Q11). "Stocul pe drum" rămâne consemnat ca o extensie clară pentru o versiune viitoare — utilă de reținut în plan ca linie de continuare, nu ca cerință a primei livrări.

### Q13: Variantă manuală/locală de rezervă (dacă accesul API întârzie/nu funcționează) — cum arată fluxul, ce format de fișier?
- **Recommended:** Export + Import în ambele sensuri (CSV), reutilizând mecanismul existent de import (`parsePlatformCSV`/`parseJumboCSV`, ~liniile 1887-1933): aplicația exportă stocul curent într-un format încărcabil manual pe eMAG/Trendyol, și importă rapoarte de comenzi/stoc descărcate manual de acolo.
- **User's answer / preference:** Confirmă ideea de export+import în ambele sensuri, dar precizează că eMAG lucrează cu Excel (.xlsx), nu CSV — propune să acoperim ambele formate dacă se poate (CSV și Excel).
- **Rationale / constraints:** Panourile de bulk-update ale eMAG (și posibil Trendyol) acceptă/generează fișiere Excel, nu CSV — un export/import strict CSV ar putea să nu fie direct utilizabil pe acele platforme fără conversie manuală suplimentară.
- **Knock-on effects:** Suportul pentru Excel (.xlsx) e o schimbare tehnică notabilă față de stilul actual al aplicației — `index.html` e "fără dependențe" (per CLAUDE.md), dar fișierele .xlsx sunt binare/zip-based și necesită o librărie de parsare/generare (ex. SheetJS/xlsx.js) inclusă ca `<script>` extern sau vendorizat. Trebuie evaluat: (a) dacă merită introdusă o dependență nouă doar pentru această variantă de rezervă, sau (b) dacă e suficient să exportăm/importăm CSV (pe care Excel îl poate deschide/salva) — eMAG/Trendyol acceptând adesea și CSV la upload, de verificat în documentația lor exactă (parte din pasul preliminar de cercetare API, Q9).

### Q14: Ce îmbunătățiri suplimentare să includem în plan?
- **Recommended:** Toate cele 4 propuse — jurnal/istoric sincronizări, mod „previzualizare” înainte de aplicare, alerte pentru stoc redus/discrepanțe mari, tratare gradulă a erorilor per produs/platformă.
- **User's answer / preference:** A ales toate cele 4 îmbunătățiri.
- **Rationale / constraints:** Crește robustețea și încrederea în funcționalitate, mai ales având în vedere natura bidirecțională (Q2) și faptul că modifică date reale pe platforme externe — utilizatorul vrea control, vizibilitate și reziliență, nu doar automatizare oarbă.
- **Knock-on effects:** Aceste 4 îmbunătățiri se leagă natural de elementele deja decise: (a) jurnalul de sincronizări poate folosi un tabel nou similar cu `jurnal`/`vanzari_zilnice`; (b) previzualizarea se potrivește cu trigger-ul manual (Q5) — „Sincronizează acum” ar putea avea doi pași: 1) arată ce se schimbă, 2) confirmă și aplică; (c) alertele de stoc redus se pot integra vizual cu tabelul de Inventar existent (poate reutilizând stilul `minQty`/prag de alertă deja prezent în produse); (d) tratarea per-produs a erorilor cere ca proxy-ul (Q1) să raporteze rezultate granular (succes/eșec per item), nu doar status global.
## Resolved Plan

### Pas 0 — Preliminar OBLIGATORIU (blocant)
Utilizatorul trebuie mai întâi să obțină acces de API la conturile sale de seller eMAG
(Marketplace API / Seller Center) și Trendyol (Seller Center / Partner API): tipul de
credențiale (API key/secret, OAuth, user/parolă), limitele de request-uri (rate limits),
și exact ce date oferă API-urile pentru stocuri/comenzi/listări/timp de livrare. Aceste
răspunsuri determină concret cum arată proxy-ul din Pasul 1 și ce e fezabil tehnic.

### Arhitectură
- Se construiește un mic backend/proxy nou (ex: Vercel Serverless Functions) care ține
  credențialele eMAG/Trendyol în siguranță pe server (env vars) și face apelurile API în
  numele aplicației — `index.html` nu va conține niciodată aceste credențiale (spre
  deosebire de cheia anon Supabase, care e sigură de expus per design).
- Dacă accesul API întârzie sau nu e fezabil, există o variantă manuală de rezervă:
  export/import de fișiere (CSV și/sau Excel — eMAG lucrează cu Excel; de verificat la
  Pasul 0 dacă acceptă și CSV) reutilizând infrastructura existentă de import
  (`parsePlatformCSV`/`parseJumboCSV`, ~liniile 1887-1933). Suportul Excel (.xlsx) ar
  necesita o librărie nouă (ex. SheetJS/xlsx.js), o abatere de la stilul actual
  "fără dependențe" al aplicației — de evaluat dacă merită sau e suficient CSV.

### Direcție și flux de sincronizare
- **Bidirecțional**, declanșat **manual** printr-un buton „Sincronizează acum”.
- **Local -> platformă**: cantitățile din `P` (Inventar) sunt trimise către listările
  mapate de pe eMAG/Trendyol. La stoc 0, se trimite simplu cantitatea 0 (varianta simplă;
  vezi mai jos extensia "stoc pe drum").
- **Platformă -> local**: comenzile noi apărute pe eMAG/Trendyol scad automat stocul
  local — platforma e sursa de adevăr pentru vânzări, local rămâne sursa pentru
  reaprovizionări/achiziții.
- **Scop strict cantități de stoc** — NU prețuri (acelea rămân gestionate separat, ca
  acum, prin calculatorul de profit `pcCalcEmag`/`pcCalcTrendyol`).

### Integrare cu Jurnalul de vânzări
Comenzile online devin intrări în Jurnal (`JL`/tabela `jurnal`), marcate vizibil cu
sursa (eMAG/Trendyol/manual). Necesită: extinderea schemei `jurnal` cu un câmp
sursă/canal, un mecanism de deduplicare (ID extern de comandă salvat, ca să nu se
introducă de două ori la sincronizări succesive), și un calcul de profit diferit per
canal (comisioanele eMAG/Trendyol diferă de vânzarea directă).

### Mapare produse (cea mai delicată parte)
SKU-urile NU coincid între ERP-ul local și platforme; doar titlurile se aseamănă parțial,
iar relația e many-to-one (mai multe listări -> un produs local). Soluția:
- Sugestii automate de potrivire **după titlu**, reutilizând mecanismul fuzzy existent
  (`fuzzyMatch`/`findExistingProduct`, ~liniile 1679-1698, folosit azi la import facturi).
- Utilizatorul **confirmă/grupează manual** mai multe listări sub același produs de bază.
- Legătura se **salvează permanent** într-un tabel nou Supabase
  (`{platforma, id_extern_listare, produs_id_local, confirmat_de_user}`), construită o
  singură dată și refolosită la fiecare sincronizare ulterioară.
- Potrivirea după imagine (menționată ca alternativă) rămâne o posibilă îmbunătățire
  ulterioară — ar necesita analiză vizuală costisitoare (posibil via OpenAI,
  similar `analyzeImage`).

### UI
Tab nou dedicat **„Sincronizare”** (al patrulea, alături de Inventar/Jurnal/Raport),
cu pagină nouă `#page-sync` adăugată în structura `goPage`/`.h-tab` (~linia 951). Conține:
butonul de sincronizare, status conexiune per platformă, ecranul de mapare/confirmare
listări, jurnalul de sincronizări, alertele și erorile.

### Caz special: stoc local = 0
Prima versiune trimite simplu cantitatea 0 către platformă — comportament simplu și
predictibil. Regula mai sofisticată — "dacă există stoc pe drum de la furnizor, trimite
o cantitate din acela și crește timpul de livrare" — e **amânată explicit pentru o
versiune ulterioară**, deoarece introduce un concept complet nou ("stoc pe drum"),
deja urmărit în aplicație, dar integrarea lui cu timpul de livrare al platformelor ar
lărgi semnificativ scopul primei livrări.

### Îmbunătățiri incluse în plan (toate acceptate)
1. **Jurnal/istoric al sincronizărilor** — fiecare rulare salvată (când, ce produse,
   ce erori), similar conceptual cu `jurnal`/`vanzari_zilnice`.
2. **Mod „previzualizare” înainte de aplicare** — la apăsarea „Sincronizează acum”,
   utilizatorul vede întâi ce se va schimba (ex: „produsul X: 10 -> 7”) și confirmă
   explicit înainte ca modificările să fie trimise efectiv.
3. **Alerte pentru stoc redus / discrepanțe mari** — avertizare vizuală post-sincronizare
   pentru produse cu stoc critic sau diferențe neașteptat de mari (posibilă eroare de
   mapare), posibil reutilizând pragul `minQty` deja existent în produse.
4. **Tratare gradulă a erorilor per produs/platformă** — un eșec izolat (token expirat,
   produs șters) nu blochează restul sincronizării; erorile sunt raportate granular.
   Aceasta cere ca proxy-ul să returneze rezultate per-item, nu doar status global.

### Ordine logică de implementare (rezultă din decizii)
1. Cercetare/obținere acces API (Pas 0 — blocant).
2. Proxy/backend serverless cu credențiale securizate (un endpoint simplu, fără cron,
   conform deciziei de declanșare manuală).
3. Tab nou „Sincronizare” + ecran de mapare produse (sugestii fuzzy + confirmare manuală,
   salvată persistent).
4. Flux de sincronizare bidirecțională cu previzualizare, scriere în Jurnal cu sursă
   marcată, deduplicare, jurnal de sincronizări, alerte și tratare per-item a erorilor.
5. (Opțional, ca rezervă) Export/import manual CSV/Excel, dacă API-ul nu e fezabil
   sau ca alternativă pentru cazuri marginale.
6. (Viitor — în afara scopului inițial) Sincronizare prețuri, potrivire după imagine,
   regula "stoc pe drum + timp livrare extins".
