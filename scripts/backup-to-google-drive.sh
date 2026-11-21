#!/bin/zsh
set -euo pipefail

# Backup Stoc Manager (Supabase cbpavtvrfpkbaeueexlw) -> Google Drive, ECONOM LA TRAFIC.
#
# De ce asa: varianta veche descarca in fiecare noapte TOATA baza (~270 MB) + TOATE fisierele (~366 MB) + CSV-uri
# duplicate = ~0,6 GB/noapte, ~18 GB/luna, fata de 5 GB/luna inclusi in planul gratuit Supabase. Pe 21.11.2026
# proiectul a fost blocat („exceed_egress_quota”). In plus, un backup cazut la jumatate se relua integral la
# fiecare pornire a Mac-ului (RunAtLoad), inmultind traficul.
#
# Acum:
#   1. Baza „usoara” zilnic (rotatie baza-A / baza-B): toate tabelele, FARA datele tabelelor mari (MARI).
#   2. Tabelele mari (ai_images, research_links): se calculeaza pe server o amprenta (md5) — cativa octeti de trafic —
#      si se descarca doar daca s-au schimbat de la ultimul backup. Se pastreaza ultimele 2 versiuni.
#   3. Fisierele (Storage): oglinda permanenta in „fisiere/”; se descarca DOAR fisierele noi sau cu alta marime.
#      Fara etichetele AWB (FARA_BUCKETS) — nu le pastram; in Supabase se sterg la 5 zile dupa impachetare.
#   4. O copie completa a bazei o data pe luna (in „baza-completa/”, ultimele 2), daca incape in plafon.
#   5. Plafon de trafic: tot ce descarca backupul se noteaza in .stare/trafic-AAAA-LL.tsv; peste
#      BACKUP_PLAFON_MB (implicit 1500 MB/luna calendaristica) pasii mari se sar, cu mesaj in log.
#   6. Maxim 2 incercari pe zi: un backup care cade nu mai reia totul la fiecare pornire a Mac-ului.
# Restaurarea: vezi CUM-RESTAUREZ.md, scris in folderul de backup.

# launchd porneste scriptul cu un PATH minimal (/usr/bin:/bin...), fara Homebrew — `node` (folosit mai jos
# la encodarea numelor din Storage) nu era gasit si backupul nocturn cadea din 16.09.2026 cu exit 127.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_REF="cbpavtvrfpkbaeueexlw"
DB_HOST="aws-1-eu-west-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.cbpavtvrfpkbaeueexlw"
SUPA_URL="https://${PROJECT_REF}.supabase.co"
KEYCHAIN_SERVICE="ab-homes-gestiune-supabase-db"
BACKUP_ROOT="${AB_HOMES_BACKUP_ROOT:-$HOME/Contul meu Drive/Backup Stoc-Manager}"
PG_BIN="/opt/homebrew/opt/libpq/bin"
LOG_DIR="$HOME/Library/Logs/AB-HOMES"
PLAFON_MB="${BACKUP_PLAFON_MB:-1500}"
MARI=(ai_images research_links)
FARA_BUCKETS="awb-labels"

mkdir -p "$BACKUP_ROOT" "$LOG_DIR"
for bin in psql pg_dump pg_restore; do
  [[ -x "$PG_BIN/$bin" ]] || { print -u2 "Lipsește $PG_BIN/$bin"; exit 1; }
done

STARE="$BACKUP_ROOT/.stare"
mkdir -p "$STARE"
TODAY="$(date +%F)"
LUNA="$(date +%Y-%m)"
STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LEDGER="$STARE/trafic-$LUNA.tsv"
touch "$LEDGER"
log() { print "[$(date '+%F %T')] $*"; }

# Gata azi? (fie complet, fie partial — un backup partial nu se reia la fiecare pornire)
if [[ -f "$STARE/ultima-zi" && "$(cat "$STARE/ultima-zi")" == "$TODAY" ]]; then
  log "Backupul zilei există deja ($TODAY)."; exit 0
fi
# Maxim 2 incercari pe zi
INCERCARI_F="$STARE/incercari-$TODAY"
INCERCARI=$(( $(cat "$INCERCARI_F" 2>/dev/null || print 0) + 1 ))
if (( INCERCARI > 2 )); then log "Deja 2 încercări eșuate azi — nu mai reîncerc până mâine."; exit 0; fi
print $INCERCARI > "$INCERCARI_F"
find "$STARE" -name 'incercari-*' ! -name "incercari-$TODAY" -delete 2>/dev/null || true

export PGPASSWORD
PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)"
CONN="host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require connect_timeout=30"
q() { "$PG_BIN/psql" "$CONN" -v ON_ERROR_STOP=1 -At -F $'\t' -c "$1"; }

# --- plafon de trafic ---
trafic_luna() { awk -F'\t' '{s+=$3} END{print s+0}' "$LEDGER"; }
noteaza() { print -r -- "$TODAY"$'\t'"$1"$'\t'"$2" >> "$LEDGER"; }   # pas, octeti
incape() { (( $(trafic_luna) + $1 <= PLAFON_MB * 1024 * 1024 )); }
mb() { print $(( $1 / 1024 / 1024 )); }
# pastreaza doar ultimele 2 fisiere .dump dintr-un folder (numele incep cu data, deci ordinea alfabetica = cronologica)
pastrez_ultimele_2() { local f=("$1"/*.dump(N)); (( ${#f} > 2 )) && rm -f -- ${f[1,-3]}; return 0; }

STATUS="ok"; NOTE=()
STAGE="/private/tmp/ab-homes-gestiune-$STAMP-$$"
cleanup() { rm -rf "$STAGE" "$BACKUP_ROOT"/.baza-*.staging-*(N) 2>/dev/null || true; }
trap cleanup EXIT INT TERM
mkdir -p "$STAGE"

# Marimea pe server a unor tabele (date + TOAST, fara indecsi) — estimarea traficului, calculata fara trafic.
marime_tabele() { q "SELECT coalesce(sum(pg_table_size(c.oid)),0) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND $1"; }
MARI_SQL="('$(print -r -- ${(j:',':)MARI})')"

# ---------- 1. Baza usoara (zilnic, rotatie A/B) ----------
DAY_NUM=$((10#$(date +%d)))
SLOT=$([[ $((DAY_NUM % 2)) -eq 0 ]] && print baza-B || print baza-A)
EST=$(marime_tabele "c.relname NOT IN $MARI_SQL")
if incape "$EST"; then
  EXCL=(); for t in $MARI; do EXCL+=(--exclude-table-data="public.$t"); done
  "$PG_BIN/pg_dump" "$CONN" --schema=public --format=custom --no-owner --no-privileges $EXCL --file="$STAGE/baza.dump"
  "$PG_BIN/pg_dump" "$CONN" --schema=public --schema-only --no-owner --no-privileges --file="$STAGE/schema.sql"
  "$PG_BIN/pg_restore" -l "$STAGE/baza.dump" >/dev/null
  noteaza "baza-usoara" "$EST"
  (cd "$STAGE" && shasum -a 256 baza.dump schema.sql > SHA256SUMS.txt)
  print -r -- "{\"data\":\"$TODAY\",\"creat\":\"$(date -u +%FT%TZ)\",\"slot\":\"$SLOT\",\"fara_datele\":\"${(j:,:)MARI}\"}" > "$STAGE/raport.json"
  DST="$BACKUP_ROOT/.$SLOT.staging-$STAMP"
  rm -rf "$DST"; mkdir -p "$DST"
  ditto "$STAGE/baza.dump" "$DST/baza.dump"; ditto "$STAGE/schema.sql" "$DST/schema.sql"
  ditto "$STAGE/SHA256SUMS.txt" "$DST/SHA256SUMS.txt"; ditto "$STAGE/raport.json" "$DST/raport.json"
  (cd "$DST" && shasum -a 256 -c SHA256SUMS.txt >/dev/null)
  rm -rf "$BACKUP_ROOT/$SLOT"; mv "$DST" "$BACKUP_ROOT/$SLOT"
  log "Baza ușoară -> $SLOT (~$(mb $EST) MB trafic)"
else
  STATUS="partial"; NOTE+=("baza ușoară sărită: plafon"); log "SĂRIT baza ușoară: plafonul de $PLAFON_MB MB/lună ar fi depășit"
fi

# ---------- 2. Tabelele mari: doar daca s-au schimbat ----------
for t in $MARI; do
  DIR="$BACKUP_ROOT/tabele-mari/$t"; mkdir -p "$DIR"
  AMPRENTA=$(q "SELECT coalesce(md5(string_agg(md5(x::text), ',' ORDER BY x.id)),'gol') FROM public.$t x")
  existente=("$DIR"/*.dump(N))
  if [[ -f "$DIR/amprenta.txt" && "$(cat "$DIR/amprenta.txt")" == "$AMPRENTA" ]] && (( ${#existente} > 0 )); then
    log "$t: neschimbat, nu descarc"; continue
  fi
  EST=$(marime_tabele "c.relname='$t'")
  if ! incape "$EST"; then STATUS="partial"; NOTE+=("$t sărit: plafon"); log "SĂRIT $t: plafon"; continue; fi
  "$PG_BIN/pg_dump" "$CONN" --data-only --format=custom --no-owner --no-privileges --table="public.$t" --file="$STAGE/$t.dump"
  "$PG_BIN/pg_restore" -l "$STAGE/$t.dump" >/dev/null
  noteaza "tabel-$t" "$EST"
  ditto "$STAGE/$t.dump" "$DIR/.$TODAY.dump.tmp" && mv "$DIR/.$TODAY.dump.tmp" "$DIR/$TODAY.dump"
  print -r -- "$AMPRENTA" > "$DIR/amprenta.txt"
  pastrez_ultimele_2 "$DIR"
  log "$t: schimbat -> tabele-mari/$t/$TODAY.dump (~$(mb $EST) MB trafic)"
done

# ---------- 3. Fisierele: oglinda incrementala ----------
FIS="$BACKUP_ROOT/fisiere"; mkdir -p "$FIS"
NOI=0; OCT=0; ESUATE=0; LA_RAND=0
while IFS=$'\t' read -r bucket is_public; do
  [[ -n "$bucket" ]] || continue
  # etichetele AWB nu se pastreaza (cerut direct: „nu avem nevoie de o baza de date a AWB-urilor”); se sterg si din
  # Supabase la 5 zile dupa impachetare (api/awb-cleanup.js)
  [[ " $FARA_BUCKETS " == *" $bucket "* ]] && continue
  [[ "$is_public" == "t" ]] || { STATUS="partial"; NOTE+=("bucket privat neacoperit: $bucket"); continue; }
  mkdir -p "$FIS/$bucket"
  q "SELECT name, coalesce((metadata->>'size')::bigint,-1) FROM storage.objects WHERE bucket_id='$bucket' ORDER BY name" > "$STAGE/lista-$bucket.tsv"
  cp "$STAGE/lista-$bucket.tsv" "$FIS/$bucket/.lista-server.tsv"
  while IFS=$'\t' read -r name size; do
    [[ -n "$name" ]] || continue
    local_f="$FIS/$bucket/$name"
    if [[ -f "$local_f" ]] && { [[ "$size" == "-1" ]] || [[ "$(stat -f%z "$local_f")" == "$size" ]]; }; then continue; fi
    (( size > 0 )) && ! incape "$size" && { STATUS="partial"; NOTE+=("fișiere sărite: plafon"); log "SĂRIT restul fișierelor: plafon"; break 2; }
    encoded="$(node -p 'encodeURIComponent(process.argv[1]).replace(/%2F/g,"/")' "$name")"
    mkdir -p "$(dirname "$local_f")"
    if curl -fLsS --retry 2 "$SUPA_URL/storage/v1/object/public/$bucket/$encoded" -o "$STAGE/f.tmp" 2>>"$STAGE/curl.err"; then
      b=$(stat -f%z "$STAGE/f.tmp"); ditto "$STAGE/f.tmp" "$local_f"; rm -f "$STAGE/f.tmp"
      NOI=$((NOI+1)); OCT=$((OCT+b)); noteaza "fisier" "$b"; LA_RAND=0
    else
      ESUATE=$((ESUATE+1)); LA_RAND=$((LA_RAND+1))
      # Storage indisponibil (ex. proiect blocat, 402): nu mai incercam mii de fisiere unul cate unul
      if (( LA_RAND >= 3 )); then
        STATUS="partial"; NOTE+=("Storage indisponibil: $(tail -1 "$STAGE/curl.err" | tr -d '"')"); log "Storage indisponibil — opresc pasul fișierelor: $(tail -1 "$STAGE/curl.err")"; break 2
      fi
    fi
  done < "$STAGE/lista-$bucket.tsv"
done < <(q "SELECT id, public FROM storage.buckets ORDER BY id")
(( ESUATE > 0 )) && { STATUS="partial"; NOTE+=("$ESUATE fișiere nu s-au putut descărca"); }
log "Fișiere: $NOI noi ($(mb $OCT) MB), $ESUATE eșuate"

# ---------- 4. Copie completa lunara ----------
FULL="$BACKUP_ROOT/baza-completa"; mkdir -p "$FULL"
if [[ ! -f "$FULL/$LUNA.dump" ]]; then
  EST=$(marime_tabele "true")
  if incape "$EST"; then
    "$PG_BIN/pg_dump" "$CONN" --schema=public --format=custom --no-owner --no-privileges --file="$STAGE/full.dump"
    "$PG_BIN/pg_restore" -l "$STAGE/full.dump" >/dev/null
    noteaza "baza-completa" "$EST"
    ditto "$STAGE/full.dump" "$FULL/.$LUNA.tmp" && mv "$FULL/.$LUNA.tmp" "$FULL/$LUNA.dump"
    pastrez_ultimele_2 "$FULL"
    log "Copie completă lunară -> baza-completa/$LUNA.dump (~$(mb $EST) MB trafic)"
  else
    log "Copia completă lunară amânată: plafon (se reîncearcă în zilele următoare)"
  fi
fi

# ---------- Raport ----------
TOT=$(trafic_luna)
NOTE_JSON=""; for n in $NOTE; do NOTE_JSON+="${NOTE_JSON:+,}\"$n\""; done
print -r -- "{\"data\":\"$TODAY\",\"creat\":\"$(date -u +%FT%TZ)\",\"status\":\"$STATUS\",\"trafic_luna_mb\":$(mb $TOT),\"plafon_mb\":$PLAFON_MB,\"fisiere_noi\":$NOI,\"note\":[$NOTE_JSON]}" > "$BACKUP_ROOT/ultimul-backup.json"
print "$TODAY" > "$STARE/ultima-zi"
q "INSERT INTO public.setari_app(key,value,updated_at) VALUES ('backup_google_drive_last_success', '$TODAY $STAMP ($STATUS)', now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()" >/dev/null || true
log "Backup $STATUS. Trafic backup luna $LUNA: $(mb $TOT) / $PLAFON_MB MB"
