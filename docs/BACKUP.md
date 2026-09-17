# Respaldos de PostgreSQL (MobOS)

Script: `scripts/db-backup.sh`. Requiere `DATABASE_URL` y `pg_dump`/`pg_restore` en el PATH.

## Crear un backup

```sh
DATABASE_URL=postgresql://... BACKUP_DIR=./backups bash scripts/db-backup.sh
```

- Formato `pg_dump -Fc` (custom). Nombre: `mobos-<fecha>T<hora>.dump`.
- `BACKUP_KEEP_DAYS` (default 14): elimina dumps más viejos que N días.

## Restaurar

```sh
DATABASE_URL=postgresql://... bash scripts/db-backup.sh restore ./backups/mobos-20260915T120000.dump
```

Usa `pg_restore --clean --if-exists`: reemplaza objetos existentes.

## Probar una restauración

1. Levantá un cluster temporal: `initdb -D /tmp/pgtest --auth=trust` + `pg_ctl -D /tmp/pgtest -o "-p 5433" start`.
2. `createdb -p 5433 mobos_test` y restaurá el dump con `DATABASE_URL=postgresql://postgres@127.0.0.1:5433/mobos_test`.
3. Verificá con `psql`: `SELECT COUNT(*) FROM "Tenant";`.
4. El arnés de integración (`backend/tests/integration-http.sh`) incluye `backup-restore.mjs`, que automatiza este ciclo.

## Programación (integrador)

- Creá un cron en OwnCoding Hub que ejecute `DATABASE_URL=<la de producción> BACKUP_DIR=/backups bash scripts/db-backup.sh` una vez al día (ej. 03:00) dentro del contenedor del backend, y montá `/backups` en un volumen persistente.
- Los dumps se rotan solos con `BACKUP_KEEP_DAYS` (default 14). Probá una restauración cada tanto con la sección anterior.
