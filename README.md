# 📦 Gestiune Stoc - Aplicație Inventar

Aplicație web pentru gestiunea stocului cu integrare Supabase și funcții AI (Claude).

## 🚀 Deploy rapid pe Vercel

### Pasul 1: Deploy aplicația

1. Mergi la [vercel.com](https://vercel.com)
2. **Sign up / Log in** (cu GitHub, GitLab sau email)
3. Click **"Add New" → "Project"**
4. Importă repository-ul GitHub care conține proiectul complet
5. Click **"Deploy"**
6. Gata! Primești un link de genul: `https://your-project.vercel.app`

Nu încărca doar `index.html`: funcțiile AI au nevoie și de folderul `api/` plus `vercel.json`.

### Pasul 2: Configurează Supabase (OBLIGATORIU)

Aplicația se conectează la Supabase deja configurat:
- **Project URL**: `https://nuvgwytanlgvcffxeahs.supabase.co`
- **Anon Key**: (deja în cod)

**⚠️ IMPORTANT:** Trebuie să rulezi SQL-ul pentru a crea tabelele!

1. Mergi la [Supabase Dashboard](https://supabase.com/dashboard/project/nuvgwytanlgvcffxeahs)
2. Click pe **SQL Editor** (meniu stânga jos, iconița `</>`)
3. Click **"+ New query"**
4. Deschide fișierul `supabase_setup.sql`
5. **Copiază TOT** conținutul și lipește în SQL Editor
6. Click **"Run"** (sau Ctrl+Enter)
7. Dacă vezi "Success. No rows returned" → gata! ✅

### Pasul 3: Configurează Claude AI

1. Creează o cheie API în [Anthropic Console](https://console.anthropic.com/settings/keys)
2. În Vercel deschide proiectul → **Settings → Environment Variables**
3. Adaugă variabila `ANTHROPIC_API_KEY` cu cheia ta și selectează **Production**, **Preview** și **Development**
4. Fă un nou deploy după salvarea variabilei

Cheia este folosită numai de funcția serverless `/api/claude` și nu ajunge în browser.
Modelul implicit este `claude-sonnet-4-6`. Opțional, îl poți schimba adăugând variabila Vercel `ANTHROPIC_MODEL`.

### Pasul 4: Testează aplicația

Deschide link-ul Vercel în browser:
- Ar trebui să vezi ecranul "Se conectează la Supabase..."
- Apoi se încarcă produsele demo
- Poți adăuga produse noi, edita, șterge

## ✨ Funcționalități

### Funcționează PESTE TOT (inclusiv local):
✅ Inventar produse cu poză, stoc, prețuri  
✅ Vânzări zilnice cu quick-sell  
✅ Jurnal vânzări cu export CSV  
✅ Calculator profit (Vânzare directă / eMAG / Trendyol)  
✅ 140+ categorii în română  
✅ Statistici și alerte stoc minim  

### Funcționează pe Vercel după configurarea `ANTHROPIC_API_KEY`:
🤖 Analiză poză cu AI → detectare produs + categorie  
🤖 Import automat din URL produs → titlu (tradus) + poză + SKU  
🤖 Import factură PDF → extragere produse  
🤖 Sugestii AI categorii  

## 🔧 Configurare avansată

### Schimbă datele Supabase (opțional)

Dacă vrei să folosești propriul proiect Supabase:

1. Deschide `index.html` în editor text
2. Caută rândurile:
```javascript
const SUPA_URL='https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY='eyJhbGc...';
```
3. Înlocuiește cu URL-ul și cheia ta (de la Supabase Dashboard → Settings → API)
4. Salvează și re-deploy pe Vercel (drag & drop iar `index.html`)

### Actualizează aplicația

1. Modifici fișierele local
2. Faci commit și push în repository-ul conectat la Vercel
3. Vercel publică automat noua versiune

## 🐛 Probleme frecvente

**"Pagina e goală / nu se încarcă"**
→ Ai rulat SQL-ul în Supabase? Vezi Pasul 2 de mai sus.

**"Analiza AI nu funcționează"**
→ Verifică variabila `ANTHROPIC_API_KEY` în Vercel și fă un nou deploy.

**"Eroare la salvare produs"**
→ Verifică că tabelele există în Supabase (rulează SQL-ul din nou).

**"Import URL nu funcționează"**
→ Verifică variabila `ANTHROPIC_API_KEY` în Vercel și fă un nou deploy.

## 📝 Notițe tehnice

- **Framework**: HTML + JavaScript vanilla (no dependencies)
- **Database**: Supabase (PostgreSQL)
- **AI**: Claude Sonnet 4 API
- **Hosting**: Vercel (static site)
- **Fonts**: DM Sans, Roboto Mono (Google Fonts)

## 🔒 Securitate

⚠️ **IMPORTANT**: Cheia Supabase din cod este cheia **anon** (publică), NU cheia **service_role**!
- Cheia anon e sigură pentru aplicații client-side
- Row Level Security e dezactivat pentru simplitate (single-user app)
- Dacă vrei securitate: activează RLS și adaugă autentificare

## 📞 Suport

Pentru întrebări sau bug-uri, verifică:
1. Console-ul browser-ului (F12 → Console) pentru erori
2. Supabase Dashboard → Table Editor → vezi dacă tabelele există
3. SQL-ul a fost rulat complet?

---

**Developed with ❤️ using Claude AI**
