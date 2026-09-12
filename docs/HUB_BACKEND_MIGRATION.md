# MobOS · backend en OwnCoding Hub

## Decisión

La fuente de verdad productiva es PostgreSQL dentro de OwnCoding Hub.

## Base de implementación

Se reutilizará la arquitectura de `mobile-system`:

- Next.js para la API y panel servidor.
- Prisma + PostgreSQL para migraciones y consultas.
- Better Auth/NextAuth del lado servidor.
- `DATABASE_URL` únicamente como secreto privado del recurso en Hub.
- El frontend actual consumirá endpoints del backend, sin acceso directo a la base.

## Orden de ejecución

1. Crear PostgreSQL de MobOS en el proyecto propio de OwnCoding Hub.
2. Crear el backend MobOS a partir del modelo relacional de `mobile-system`.
3. Adaptar Tenant, User, Product, Customer, Order, Payment, Inventory y AuditLog.
4. Añadir PIN con hash, sesiones, permisos y aislamiento por empresa.
5. Publicar API y configurar `VITE_API_URL` en el frontend.
6. Migrar datos del almacenamiento actual y verificar conciliación.
7. Verificar que el frontend no tenga accesos directos a bases de datos ni secretos.

## Estado

- [x] PostgreSQL MobOS creado en Hub.
- [x] Backend MobOS publicado en Hub.
- [x] Frontend conectado a la API propia.
- [ ] Pruebas de aislamiento y permisos completas en producción.
