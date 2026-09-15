#!/usr/bin/env bash

# Respaldos y restauración de la base MobOS.
#
# Uso:
#   scripts/db-backup.sh                       # crea un backup
#   scripts/db-backup.sh restore <archivo>     # restaura un backup
#
# Variables:
#   DATABASE_URL       (obligatoria) cadena de conexión PostgreSQL.
#   BACKUP_DIR         destino de backups (default: ./backups).
#   BACKUP_KEEP_DAYS   retención en días (default: 14).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL no está definida.}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

usage() {
  echo "Uso: scripts/db-backup.sh [backup | restore <archivo>]" >&2
  exit 1
}

backup() {
  mkdir -p "$BACKUP_DIR"
  local stamp file
  stamp="$(date +%Y%m%dT%H%M%S)"
  file="$BACKUP_DIR/mobos-$stamp.dump"
  echo "Respaldando en $file (formato pg_dump -Fc)..." >&2
  pg_dump --format=custom --no-owner --file="$file" "$DATABASE_URL"
  echo "Respaldo completado: $file" >&2
  # Retención: se eliminan dumps anteriores a BACKUP_KEEP_DAYS días.
  if ! [[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]]; then
    echo "BACKUP_KEEP_DAYS inválido; se omite la limpieza por retención." >&2
    return 0
  fi
  find "$BACKUP_DIR" -type f -name 'mobos-*.dump' -mtime "+$BACKUP_KEEP_DAYS" -print -delete
}

restore() {
  local file="${1:-}"
  if [[ -z "$file" || ! -f "$file" ]]; then
    echo "Archivo de backup no encontrado: ${file:-<sin archivo>}" >&2
    usage
  fi
  echo "Restaurando $file en la base de DATABASE_URL..." >&2
  pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$file"
  echo "Restauración completada." >&2
}

case "${1:-backup}" in
  backup) backup ;;
  restore) restore "${2:-}" ;;
  *) usage ;;
esac
