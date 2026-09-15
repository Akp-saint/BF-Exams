#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL est requis}"
: "${BACKUP_FILE:?BACKUP_FILE est requis}"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$BACKUP_FILE"
echo "Restauration terminée: $BACKUP_FILE"
