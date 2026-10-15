-- Tráfico propio del sitio público y de la demo (panel de plataforma →
-- «Tráfico y demo»). Sin datos personales: id de visitante anónimo, ruta sin
-- query, host del referente y campos acotados. Sin IP ni agente de usuario.
-- Aditiva e idempotente (cada objeto con guard).

CREATE TABLE IF NOT EXISTS "SiteEvent" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "path" TEXT,
  "referrer" TEXT,
  "utmSource" TEXT,
  "device" TEXT NOT NULL,
  "role" TEXT,
  "module" TEXT,
  "durationSec" INTEGER,
  "scrollPct" INTEGER,
  CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteEvent_createdAt_idx" ON "SiteEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "SiteEvent_kind_name_createdAt_idx" ON "SiteEvent"("kind", "name", "createdAt");
CREATE INDEX IF NOT EXISTS "SiteEvent_visitorId_idx" ON "SiteEvent"("visitorId");
