#!/usr/bin/env bash
# Logical backup of the store's data (the `shop` schema) — independent of Supabase's own backups.
#
#   DATABASE_URL=postgres://… BACKUP_DIR=/secure/backups [BACKUP_GPG_RECIPIENT=you@example.com] [BACKUP_KEEP_DAYS=30] scripts/backup.sh
#
# Use a direct (non-pooler) connection string. The dump holds customer personal data:
# store it encrypted (set BACKUP_GPG_RECIPIENT) and somewhere only the owner can read.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
mkdir -p "$DIR"
chmod 700 "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/zentro-shop-$STAMP.dump"

pg_dump "$DATABASE_URL" --schema=shop --format=custom --compress=9 --no-owner --no-privileges --file="$FILE"
pg_restore --list "$FILE" > /dev/null   # fails if the archive is unreadable
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE.gpg" "$FILE"
  shred -u "$FILE" 2>/dev/null || rm -f "$FILE"
  FILE="$FILE.gpg"
fi
chmod 600 "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
find "$DIR" -name 'zentro-shop-*' -mtime "+$KEEP" -delete
echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
