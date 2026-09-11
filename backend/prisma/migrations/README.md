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

## Flujo de una base nueva y vacía

La inspección de producción confirmó que la base `mobos` no tiene tablas públicas. Para una base nueva, el orden esperado es:

1. Ejecutar el preflight sobre la URL de la base vacía y confirmar que no contiene tablas públicas ni un historial Prisma previo.
2. Ejecutar `npx prisma migrate deploy` desde `backend/`. Prisma aplicará primero `20260911000000_baseline` y después `20260911153000_auth_order_snapshots`.
3. Ejecutar `npx prisma migrate status` y comprobar las tablas, índices, FKs y columnas de snapshot.
4. Recién después iniciar el backend y correr las pruebas de integración.

La baseline se generó con `prisma migrate diff --from-empty --to-schema` usando exclusivamente `1e9b3bf:backend/prisma/schema.prisma`, no el `HEAD` actual. No debe usarse `migrate reset` ni `db push` como sustituto del deploy versionado. La migración snapshot no fue modificada.
