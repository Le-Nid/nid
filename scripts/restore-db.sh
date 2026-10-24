#!/bin/sh
# Restore a dump made by backup-db.sh, REPLACING the current database content.
# Usage: scripts/restore-db.sh <file.dump>   (run from the directory holding docker-compose.yml)
set -eu

FILE="${1:?usage: scripts/restore-db.sh <file.dump>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

printf 'This replaces the whole Nid database with %s. Type "restore" to go on: ' "$FILE"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }

# The app is stopped so no job writes during the restore; it runs the migrations again on start
docker compose stop app
trap 'docker compose start app' EXIT   # restarted even if pg_restore fails (single transaction: nothing applied)
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$FILE"
echo "Restored $FILE"
