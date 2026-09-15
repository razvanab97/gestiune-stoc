#!/bin/zsh
set -euo pipefail

# Backup rotativ A/B: două copii complete, ultima și penultima zi.
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

mkdir -p "$BACKUP_ROOT" "$LOG_DIR"
for bin in psql pg_dump pg_restore; do
  [[ -x "$PG_BIN/$bin" ]] || { print -u2 "Lipsește $PG_BIN/$bin"; exit 1; }
done

export PGPASSWORD
PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)"
CONN="host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require"
TODAY="$(date +%F)"
STAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
DAY_NUM=$((10#$(date +%d)))
SLOT=$([[ $((DAY_NUM % 2)) -eq 0 ]] && print backup-B || print backup-A)
TARGET="$BACKUP_ROOT/$SLOT"
STAGE="/private/tmp/ab-homes-gestiune-${SLOT}-${STAMP}-$$"
DRIVE_STAGE="$BACKUP_ROOT/.${SLOT}.staging-${STAMP}-$$"

# La pornirea Mac-ului jobul poate rula din nou. Dacă slotul curent conține deja
# backupul complet al zilei, îl păstrăm și nu consumăm trafic degeaba.
if [[ -f "$TARGET/backup-report.json" ]] && grep -q "\\\"backup_date\\\":\\\"$TODAY\\\"" "$TARGET/backup-report.json"; then
  print "Backupul zilei există deja: $TARGET"
  exit 0
fi

cleanup() { rm -rf "$STAGE" "$DRIVE_STAGE"; }
trap cleanup EXIT INT TERM

mkdir -p "$STAGE/csv" "$STAGE/storage"

"$PG_BIN/pg_dump" "$CONN" --schema=public --format=custom --no-owner --no-privileges --file="$STAGE/database.dump"
"$PG_BIN/pg_dump" "$CONN" --schema=public --schema-only --no-owner --no-privileges --file="$STAGE/schema.sql"

for table in produse jurnal comenzi_stoc platforma_comenzi platforma_mapari vanzari_zilnice setari_app; do
  "$PG_BIN/psql" "$CONN" -v ON_ERROR_STOP=1 -c "\\copy public.$table TO '$STAGE/csv/$table.csv' WITH (FORMAT csv, HEADER true)"
done

# Storage nu intră în pg_dump. Backupăm fiecare bucket public, inclusiv calea originală a fișierului.
while IFS=$'\t' read -r bucket is_public; do
  [[ -n "$bucket" ]] || continue
  [[ "$is_public" == "t" ]] || { print -u2 "Bucket privat neacoperit de backup: $bucket"; exit 1; }
  mkdir -p "$STAGE/storage/$bucket"
  "$PG_BIN/psql" "$CONN" -At -F $'\t' -c "SELECT name FROM storage.objects WHERE bucket_id='$bucket' ORDER BY name" > "$STAGE/storage/$bucket/paths.txt"
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    encoded="$(node -p 'encodeURIComponent(process.argv[1]).replace(/%2F/g,"/")' "$name")"
    mkdir -p "$STAGE/storage/$bucket/$(dirname "$name")"
    curl -fLsS --retry 3 "$SUPA_URL/storage/v1/object/public/$bucket/$encoded" -o "$STAGE/storage/$bucket/$name"
  done < "$STAGE/storage/$bucket/paths.txt"
done < <("$PG_BIN/psql" "$CONN" -At -F $'\t' -c "SELECT id, public FROM storage.buckets ORDER BY id")

"$PG_BIN/pg_restore" -l "$STAGE/database.dump" >/dev/null
(cd "$STAGE" && find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS.txt)
cat > "$STAGE/backup-report.json" <<EOF
{"backup_date":"$TODAY","created_at":"$(date -u +%FT%TZ)","slot":"$SLOT","project_ref":"$PROJECT_REF","status":"ok"}
EOF

# Exportul se construiește local. Google Drive primește doar o copie deja validată,
# într-un director temporar care nu devine slot activ până nu este complet.
rm -rf "$DRIVE_STAGE"
ditto "$STAGE" "$DRIVE_STAGE"
(cd "$DRIVE_STAGE" && shasum -a 256 -c SHA256SUMS.txt >/dev/null)

# Înlocuim slotul numai după ce copia din Drive este verificată complet.
rm -rf "$TARGET"
mv "$DRIVE_STAGE" "$TARGET"
trap - EXIT INT TERM
rm -rf "$STAGE"

"$PG_BIN/psql" "$CONN" -v ON_ERROR_STOP=1 -c "INSERT INTO public.setari_app(key,value,updated_at) VALUES ('backup_google_drive_last_success', '$TODAY $STAMP ($SLOT)', now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()"
print "Backup finalizat: $TARGET"
