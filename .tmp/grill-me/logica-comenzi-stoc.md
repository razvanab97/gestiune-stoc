# Grill: Logică mai simplă pentru importarea și finalizarea comenzilor de stoc
Started: 2026-09-23

## Summary of the Idea
Utilizatorul vrea o logică mai ușoară pentru modul de importare și finalizare a comenzilor din "comenzi stoc" (fluxul de aducere a mărfii de la furnizor în stoc). Explorarea codului a arătat că, de fapt, există **trei sisteme separate, slab conectate** care ating această zonă:
1. **Comandă furnizor** (`comenzi_furnizor`) — comenzi plasate la furnizor, încă pe drum; are câmpuri `finalizat`/`nu_a_sosit`, dar marcarea sosirii se face doar din `staff.html`.
2. **Importă factură** (`comenzi_stoc`) — jurnal de recepții deja sosite; e un log append-only, FĂRĂ niciun status/finalizare — o dată aplicată, o linie e permanentă.
3. **Produse de comandat** (`REORDER`, în `setari_app`) — o listă simplă de cumpărături (produse fără stoc, cu comenzi client pe ele), fără legătură cu celelalte două.

Cele trei nu se leagă automat — utilizatorul re-selectează manual același produs de fiecare dată când trece de la "trebuie comandat" → "comandat, pe drum" → "a sosit, intră în stoc". În plus, există și un al patrulea mecanism, mai vechi și paralel: câmpul `incoming_qty` per produs ("Pe drum"), care nu comunică deloc cu `comenzi_furnizor`.

## Open Threads
- Cum arată exact butonul „→ Comandă la furnizor" de pe lista de reordonare — unul câte unul, sau selecție multiplă → o comandă cu mai multe produse?
- Cum decide aplicația automat cu CE comandă furnizor să asocieze o factură importată (matching după furnizor? după produse? alegere manuală dintr-o listă scurtă)?
- Ce se întâmplă când factura NU se potrivește exact cu comanda furnizor (cantități diferite, produse în plus/lipsă) — asociere parțială?
- Cine folosește fiecare parte a fluxului (tu, staff, amândoi)?
- Cum se elimină `incoming_qty` — dispare butonul/câmpul din formularul de produs, sau se migrează automat spre `comenzi_furnizor`?
- Cât de mult din fluxul actual (parsare AI facturi, matching produse, checklist printabil) rămâne neschimbat vs. cât se restructurează?
- Ce se întâmplă cu greșelile — vrea utilizatorul o cale de a corecta/anula o recepție deja aplicată (azi `comenzi_stoc` e imutabil)?
- Unde se vede „finalizarea" — doar în Staff (cum e azi `comenzi_furnizor`), sau și în admin (`index.html`)?

## Decisions Log

### Q1: Care e durerea principală — legătura (lipsă) dintre cele trei sisteme, sau greutatea unuia anume dintre ele?
- **Recommended:** Legătura dintre ele — fiecare bucată individuală e deja matură (~20+ intrări changelog pe „Importă factură" singur), dar utilizatorul re-selectează manual același produs de 2-3 ori pe drumul „de comandat → comandat → sosit".
- **User's answer / preference:** De acord cu propunerea concretă: (1) buton „→ Comandă la furnizor" pe lista de reordonare, pre-completat; (2) la „Importă factură", asociere automată/sugerată cu o comandă furnizor deschisă, care completează cantitățile și marchează automat comanda ca finalizată; (3) eliminarea contorului vechi „Pe drum" (`incoming_qty`) de pe produs, ca sursă paralelă de adevăr.
- **Rationale / constraints:** Utilizatorul confirmă direct, fără rezerve — „da, de acord".
- **Knock-on effects:** Deschide întrebări despre mecanismul exact de asociere factură↔comandă furnizor (matching automat vs. alegere manuală), despre ce se întâmplă la nepotriviri, și despre migrarea/eliminarea lui `incoming_qty`.

### Q2: Cum ar trebui să decidă aplicația CU CE comandă furnizor să asocieze o factură importată — dropdown manual sau potrivire automată?
- **Recommended:** Dropdown manual, fără potrivire automată ghicită — mai sigur, volum mic de comenzi deschise simultan.
- **User's answer / preference:** Confirmat — „rămâne doar prima" (varianta dropdown/alegere manuală).
- **Rationale / constraints:** —
- **Knock-on effects:** Nicio potrivire automată de implementat pentru asocierea factură↔comandă furnizor.

---

**SESIUNE ÎNTRERUPTĂ AICI, LA CEREREA UTILIZATORULUI** — utilizatorul a redirecționat interviul către un subiect diferit („comenzi platforme" — eMAG/Trendyol/Vinted, fluxul zilnic de import comenzi client). Firul ăsta (comenzi_stoc / furnizor) rămâne neterminat, de reluat separat dacă e nevoie — vezi `.tmp/grill-me/logica-comenzi-platforme-zilnic.md` pentru continuare.

## Open Threads (rămase nerezolvate la întrerupere)
- Cum arată exact butonul „→ Comandă la furnizor" de pe lista de reordonare — unul câte unul, sau selecție multiplă → o comandă cu mai multe produse?
- Ce se întâmplă când factura NU se potrivește exact cu comanda furnizor (cantități diferite, produse în plus/lipsă) — asociere parțială?
- Cine folosește fiecare parte a fluxului (tu, staff, amândoi)?
- Cum se elimină `incoming_qty` — dispare butonul/câmpul din formularul de produs, sau se migrează automat spre `comenzi_furnizor`?
- Cât de mult din fluxul actual (parsare AI facturi, matching produse, checklist printabil) rămâne neschimbat vs. cât se restructurează?
- Ce se întâmplă cu greșelile — vrea utilizatorul o cale de a corecta/anula o recepție deja aplicată (azi `comenzi_stoc` e imutabil)?
- Unde se vede „finalizarea" — doar în Staff (cum e azi `comenzi_furnizor`), sau și în admin (`index.html`)?
