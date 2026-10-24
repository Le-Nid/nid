#!/bin/sh
# Dump the Nid PostgreSQL database (custom format, compressed) from the docker compose stack.
# Usage: scripts/backup-db.sh [backup_dir]   (default ./backups; keeps the last $KEEP dumps, default 14)
# Run from the directory holding docker-compose.yml, e.g. daily from cron:
#   15 3 * * * cd /opt/nid && scripts/backup-db.sh /mnt/nas/nid-backups >> backups.log 2>&1
set -eu

DIR="${1:-./backups}"
KEEP="${KEEP:-14}"
mkdir -p "$DIR"
FILE="$DIR/nid-db-$(date +%Y%m%d-%H%M%S).dump"

# The credentials come from the postgres container's own environment: no .env parsing here
trap 'rm -f "$FILE.tmp"' EXIT
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"   # a failed dump never replaces a good one under the final name
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Rotation: keep the $KEEP most recent dumps
ls -1t "$DIR"/nid-db-*.dump | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old"; done
