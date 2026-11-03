# Grill: Adăugare stoc la produse existente prin Asistent AI
Started: 2026-11-03

## Summary of the Idea
Asistentul AI (chatbot-ul din gestiune-stoc) poate azi doar interoga date (stoc/vânzări/preconizări) și pregăti un draft de produs NOU — nu poate adăuga stoc la un produs deja existent. Userul vrea să poată trimite în chat o listă/factură cu mai multe produse (nume, cod furnizor, cantitate, preț — ex. captură reală cu un tabel de la furnizorul Jumbo) și ca asistentul să potrivească fiecare linie cu un produs existent și să le adauge stocul, nu doar unul singur per mesaj (ales explicit, în locul variantei mai simple de 1-produs-per-mesaj).

## Open Threads
(toate rezolvate — vezi Resolved Plan; Q2 a prăbușit restul deciziilor, prin reutilizare directă a ecranului „Importă factură", deja matur)

## Resolved Plan

**Intenție nouă, `adauga_stoc`**, adăugată în `AI_CHAT_INTENT_SCHEMA`/clasificator (`aiChatClassifyIntent`), paralelă cu `creeaza_produs`, nu prin pipeline-ul normal (`aiChatExecuteIntent`/`aiChatFormatAnswer`, gândit pentru interogări read-only) — tratată separat în `aiChatSend`, la fel cum `creeaza_produs` e deja tratată separat.

**Declanșare:** userul atașează o poză ȘI textul exprimă clar intenția de a adăuga/recepționa stoc pentru produse EXISTENTE (ex. „adaugă stoc”, „am primit marfa/comanda asta”, „actualizează stocul cu lista asta”, „recepție marfă”) — distinct de `creeaza_produs` (acolo userul descrie UN produs nou, de regulă o poză de produs unic). Un mesaj fără text, doar cu poză atașată, rămâne pe comportamentul deja existent (implicit `creeaza_produs`, neschimbat) — clasificatorul vede DOAR text (niciodată imaginea propriu-zisă, arhitectură deja existentă, păstrată neschimbată din motive de cost), deci are nevoie de un semnal clar în cuvinte ca să aleagă acest drum nou.

**Execuție** (în `aiChatSend`, ramură nouă `else if(intent.tip==='adauga_stoc')`):
1. Fără poză atașată → mesaj de eroare clar: „Trimite o poză cu lista/factura de produse ca să le adaug la stoc.”
2. Cu poză: convertește `imageDataUrl` (dataURL) în Blob (`base64ToBlob`, deja existent), apoi `openInvoice()` + `parseOrderScreenshots([blob])` — EXACT perechea deja folosită programatic de `handlePresetCSV`, niciun parser/extractor nou.
3. După ce `parseOrderScreenshots` termină (await): mesaj în chat cu numărul REAL de linii găsite (`invParsed.length`, citit direct, niciodată inventat de AI) — succes: „Am găsit N produse în poză — am deschis „Importă factură”, verifică liniile (produse găsite/necunoscute, cantități, preț) și apasă „Aplică” acolo ca să le adaugi la stoc.”; eșec (0 linii): „Nu am găsit niciun produs recognoscibil în poză — încearcă o poză mai clară, sau folosește „Importă factură” direct din Inventar.”
4. Niciun card nou în chat, niciun buton nou de confirmare — ecranul „Importă factură”, deja deschis, e singurul loc unde se confirmă/aplică (propriul lui buton „Aplică”, deja existent, neschimbat).

**Explicit în afara scopului v1** (pot reveni ca fire separate, dacă e cerut explicit mai târziu):
- Text liber tastat/lipit (fără poză) ca intrare pentru listă.
- PDF atașat direct în chat (rămâne doar la „Importă factură” din Inventar).
- Flux „1 singur produs, text simplu” separat de mecanismul de listă.

**De verificat la implementare:** sintaxă (2x) + CSS balans (neschimbat, nicio clasă nouă) + teste izolate pe funcția nouă (detectare corectă a intenției din text cu/fără cuvinte-cheie, regresie pe `creeaza_produs`/restul intențiilor neatinse, wiring real `openInvoice`+`parseOrderScreenshots`+`base64ToBlob`, mesaj de eroare pe poză lipsă, numărul real de linii citit din `invParsed.length` după completare, degradare pe 0 linii găsite).

## Decisions Log

### Q1: Cum trimiți lista/factura în chat, ca s-o recunoască asistentul?
- **Recommended:** Poză/screenshot — reutilizează mecanismul deja validat la „creează produs” (aiChatExtractProductVisual), doar cu un prompt nou, pentru mai multe linii deodată.
- **User's answer / preference:** Strict poză/screenshot — fără text liber tastat, fără PDF atașat în chat (acela rămâne la „Importă factură”, neduplicat).
- **Rationale / constraints:** Scop clar, un singur canal de intrare pentru v1.
- **Knock-on effects:** Schema de extragere AI va fi dedicată unei LISTE de linii dintr-o imagine (nu reutilizăm direct AI_CHAT_PRODUCT_VISUAL_SCHEMA, gândită pentru UN produs nou) — nume văzut, cod furnizor, cantitate, preț per linie.

### Q2: Cum arată confirmarea, după ce AI-ul citește poza cu lista și potrivește liniile cu stocul existent?
- **Recommended:** Card direct în conversație (ca la „creează produs”) — listă compactă, un buton „Adaugă tot la stoc”.
- **User's answer / preference:** Deschide direct ecranul existent „Importă factură” — chat-ul doar extrage/pasează poza mai departe, nu construiește o UI nouă de confirmare.
- **Rationale / constraints:** Ecranul „Importă factură" e deja matur, matur testat, acoperă deja EXACT tot ce mai rămânea de decis (linie nepotrivită, preț, furnizor+număr factură, ambiguitate) — niciun motiv să se construiască un al doilea mecanism paralel.
- **Knock-on effects:** PRĂBUȘEȘTE toate celelalte fire deschise — toate moștenite direct din comportamentul deja existent al „Importă factură", nimic nou de proiectat:
  - Linie nepotrivită → tratată exact ca azi în acel ecran (apare drept candidat „produs nou”, userul decide).
  - Preț menționat → tratat exact ca azi (cost mediu ponderat, la fel ca orice altă sursă de recepție).
  - Furnizor + număr factură → câmpurile deja existente în acel ecran; `parseOrderScreenshots` încearcă deja să detecteze automat numărul comenzii din poză.
  - Ambiguitate produs → picker-ul manual deja existent în acel ecran, neschimbat.
  - Flux rapid 1-produs → nu mai e un fir separat de proiectat — Q1 a exclus oricum textul liber din v1; o poză cu UN singur produs trece prin ACELAȘI drum (Importă factură gestionează deja o listă de 1 element la fel de bine ca una de 8).
  - Mecanism tehnic confirmat direct în cod: `openInvoice()` (resetează starea, deschide modalul `#ov-inv`, overlay global, funcționează indiferent de tab-ul activ) + `parseOrderScreenshots([blob])` (extrage liniile prin AI vision direct în `invParsed`, randează `renderInvPreview()`) — exact perechea deja folosită programatic de `handlePresetCSV` (nu doar din input de fișier). Poza din chat (`aiChatPendingImage`, dataURL) se convertește în Blob (`base64ToBlob`, deja existent) și se pasează direct.
  - Precedent direct găsit în cod: draftul de produs nou (`aiChatOpenDraft`) deja cheamă `openModal()` direct din interiorul popup-ului de chat, fără să-l închidă întâi — niciun cod nou de gestionare z-index/închidere popup necesar, se urmează exact același tipar pentru `openInvoice()`.
