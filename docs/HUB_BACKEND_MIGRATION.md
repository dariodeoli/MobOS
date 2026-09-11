# MobOS · backend en OwnCoding Hub

## Decisión

La fuente de verdad productiva será PostgreSQL dentro de OwnCoding Hub. MobOS no
usará Supabase para nuevas funcionalidades.

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
7. Desactivar escrituras nuevas hacia Supabase.

## Estado

- [x] Decisión de infraestructura documentada.
- [x] Modelo base existente localizado en `mobile-system/prisma/schema.prisma`.
- [ ] PostgreSQL MobOS creado en Hub.
- [ ] Backend MobOS publicado en Hub.
- [ ] Frontend conectado a la API.
- [ ] Migración y pruebas de aislamiento completadas.
