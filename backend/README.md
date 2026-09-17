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

## AEX (envíos)

Con `MOBOS_AEX_PUBLIC_KEY`, `MOBOS_AEX_PRIVATE_KEY` y `MOBOS_AEX_API_URL`
(sandbox: `https://sandbox.aex.com.py/api/v1`) el backend cotiza, confirma guías
y consulta seguimiento:

- `POST /api/aex/ship` — cotiza un traslado y, con `confirm: true`, genera la guía.
- `GET /api/aex/tracking?guia=…` — eventos del webhook si ya llegaron; si no, los
  pide a la API.
- `POST /api/aex/webhook` — receptor público para AEX. Guarda cada evento en
  `AexWebhookEvent` y responde `{"isSuccess": true}` (AEX reintenta hasta 4 veces;
  el reintento no duplica). Se protege con `MOBOS_AEX_WEBHOOK_TOKEN` en el header
  `MOBOS_AEX_WEBHOOK_HEADER` (por defecto `authorization: Bearer <token>`); sin
  token configurado queda abierto para el sandbox.

URL a informar a AEX: `https://api.moboss.online/api/aex/webhook`.
