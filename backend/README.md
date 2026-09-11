# MobOS backend

Backend/API independiente para MobOS: Next.js, Prisma y PostgreSQL administrado en
OwnCoding Hub. Esta es la única fuente de datos y autenticación de producción.

## Estado

Incluye endpoints para clientes, productos, stock, usuarios, órdenes y pagos, además
del modelo Prisma base para multiempresa, sucursales, catálogo y auditoría.

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
