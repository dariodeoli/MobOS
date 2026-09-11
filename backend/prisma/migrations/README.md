# Migraciones de MobOS

## Migración versionada

`20260911153000_auth_order_snapshots/migration.sql` fue derivada del diff entre:

- `HEAD:backend/prisma/schema.prisma` como origen.
- `backend/prisma/schema.prisma` actual como destino.

El `subtotalPyg` requerido por el schema actual se trata de forma segura para una base existente: se agrega nullable, se rellena desde la suma de `OrderItem.totalPyg` con fallback a `Order.totalPyg`, y recién después se marca `NOT NULL`.

## Preflight obligatorio en Hub

El flujo actual de Hub usa `npx prisma db push`. Para este cambio no debe ejecutarse automáticamente: `db push` no es un historial de migraciones ni garantiza este backfill sobre una tabla poblada.

Antes de aplicar, hacer backup y ejecutar desde `backend/`:

```sh
npx prisma validate
npx prisma migrate diff \
  --from-schema /ruta/al/schema-head.prisma \
  --to-schema prisma/schema.prisma \
  --script
```

El script generado debe compararse con el archivo versionado. Verificar especialmente que no contenga `DROP`, `TRUNCATE`, `migrate reset` ni una adición `NOT NULL` de `subtotalPyg` sin backfill.

Después del preflight, el responsable de Hub debe aplicar explícitamente esta migración en una ventana controlada, validar conteos, totales y restricciones, y registrar el resultado. Esta entrega **no aplica** SQL a ninguna base.

No ejecutar:

```sh
npx prisma migrate reset
npx prisma db push --force-reset
```
