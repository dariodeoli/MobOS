# MobOS backend

Backend/API independiente para MobOS, basado en la arquitectura de `mobile-system`:
Next.js, Prisma y PostgreSQL. Vive en esta carpeta para no acoplarse al frontend actual
ni a `supabase/`.

## Estado

Este es un scaffold inicial seguro. Incluye un endpoint de salud y el modelo Prisma
base para multiempresa, sucursales, usuarios con PIN hasheado, catálogo, clientes,
órdenes, pagos y auditoría. No contiene secretos, seed ni migraciones aplicadas.

## Desarrollo local

```bash
cp .env.example .env
npm install
npx prisma validate
npm run dev
```

Por defecto, la API corre en `http://localhost:3001` y el chequeo de salud está en
`GET /api/health`.

Cuando exista una base PostgreSQL local y se quiera crear la primera migración:

```bash
npx prisma migrate dev --name init
```

Los PIN deben llegar al backend por un flujo de autenticación y guardarse usando un
algoritmo de hash resistente (por ejemplo, Argon2id o bcrypt). El schema reserva el
campo `pinHash`; nunca debe contener un PIN en texto plano.
