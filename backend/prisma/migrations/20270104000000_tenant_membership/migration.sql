-- Multi-empresa (#377): Account, TenantMembership y Session.accountId.
-- Aditiva e idempotente: sin DROP, cada objeto con guard y el backfill usa ids
-- deterministas + ON CONFLICT DO NOTHING (el contenedor corre `prisma migrate
-- deploy` en cada arranque y un segundo paso no debe cambiar nada).

DO $$ BEGIN
  CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "googleSubject" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TenantMembership" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TenantMembership" ADD COLUMN IF NOT EXISTS "revokedReason" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "accountId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Account_email_key" ON "Account"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Account_googleSubject_key" ON "Account"("googleSubject");
CREATE UNIQUE INDEX IF NOT EXISTS "TenantMembership_accountId_tenantId_key" ON "TenantMembership"("accountId", "tenantId");
CREATE INDEX IF NOT EXISTS "TenantMembership_tenantId_idx" ON "TenantMembership"("tenantId");
CREATE INDEX IF NOT EXISTS "TenantMembership_userId_idx" ON "TenantMembership"("userId");
CREATE INDEX IF NOT EXISTS "Session_accountId_idx" ON "Session"("accountId");

DO $$ BEGIN
  ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Session es una tabla caliente. El FK entra NOT VALID para que ADD CONSTRAINT
-- no escanee la tabla, y VALIDATE toma solo SHARE UPDATE EXCLUSIVE (no bloquea
-- lecturas ni escrituras). OJO: Prisma corre todo el archivo en una sola
-- transacción, así que el lock breve de ADD CONSTRAINT se mantiene hasta el
-- commit, también durante el VALIDATE: no es "sin bloquear". Con la tabla
-- Session chica del arranque es aceptable; si crece, mover el VALIDATE a una
-- migración propia. Re-ejecutable: VALIDATE sobre un FK ya válido no hace nada.
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "Session" VALIDATE CONSTRAINT "Session_accountId_fkey";

-- ── Backfill determinista ──
-- 1) Una cuenta por identidad de Google.
INSERT INTO "Account" ("id", "googleSubject", "createdAt", "updatedAt")
SELECT 'acc_g_' || md5(g."subject"), g."subject",
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM "GoogleIdentity" g
ON CONFLICT DO NOTHING;

-- 2) Una cuenta por correo de empresa con contraseña (minúsculas; dos empresas
--    con el mismo correo en distinta capitalización comparten cuenta).
INSERT INTO "Account" ("id", "email", "createdAt", "updatedAt")
SELECT 'acc_e_' || md5(e."email"), e."email",
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM (
  SELECT DISTINCT lower(t."email") AS "email"
  FROM "Tenant" t
  WHERE t."email" IS NOT NULL AND t."passwordHash" IS NOT NULL
) e
ON CONFLICT DO NOTHING;

-- 3) Membresías desde GoogleStoreAccess (owner -> OWNER, el resto -> ADMIN).
--    userId: SOLO el perfil que esa operación creó (el ADMIN activo que quedó
--    marcado con GOOGLE_STORE_OWNER_CREATED, y únicamente para el dueño). Sin
--    esa prueba queda NULL y la persona pasa por la pantalla de PIN: nunca se
--    adivina un perfil por antigüedad.
INSERT INTO "TenantMembership" ("id", "accountId", "tenantId", "userId", "role", "createdAt", "updatedAt")
SELECT 'mem_' || md5('acc_g_' || md5(a."subject") || a."tenantId"),
       'acc_g_' || md5(a."subject"),
       a."tenantId",
       CASE WHEN a."owner" THEN (SELECT u."id" FROM "User" u
         WHERE u."tenantId" = a."tenantId" AND u."role" = 'ADMIN' AND u."status" = 'ACTIVE'
           AND u."id" IN (SELECT l."userId" FROM "AuditLog" l WHERE l."tenantId" = a."tenantId" AND l."action" = 'GOOGLE_STORE_OWNER_CREATED')
         ORDER BY u."createdAt" ASC, u."id" ASC LIMIT 1) END,
       CASE WHEN a."owner" THEN 'OWNER'::"MembershipRole" ELSE 'ADMIN'::"MembershipRole" END,
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM "GoogleStoreAccess" a
ON CONFLICT DO NOTHING;

-- 4) Membresía OWNER para el correo/contraseña de cada empresa. userId: el ADMIN
--    activo más antiguo con el MISMO correo; sin coincidencia queda NULL (pantalla
--    de PIN), nunca "el ADMIN más antiguo".
INSERT INTO "TenantMembership" ("id", "accountId", "tenantId", "userId", "role", "createdAt", "updatedAt")
SELECT 'mem_' || md5('acc_e_' || md5(lower(t."email")) || t."id"),
       'acc_e_' || md5(lower(t."email")),
       t."id",
       (SELECT u."id" FROM "User" u
         WHERE u."tenantId" = t."id" AND u."role" = 'ADMIN' AND u."status" = 'ACTIVE' AND lower(u."email") = lower(t."email")
         ORDER BY u."createdAt" ASC, u."id" ASC LIMIT 1),
       'OWNER'::"MembershipRole",
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM "Tenant" t
WHERE t."email" IS NOT NULL AND t."passwordHash" IS NOT NULL
ON CONFLICT DO NOTHING;
