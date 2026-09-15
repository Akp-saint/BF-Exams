#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL est requis}"
mkdir -p "${BACKUP_DIR:-backups}"
file="${BACKUP_DIR:-backups}/resultats-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$file" "$DATABASE_URL"
echo "Sauvegarde créée: $file"
