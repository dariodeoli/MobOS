-- #240 ítem 3: seguimiento del informe de dispositivo compartido (visto/no visto).
-- Una fila por equipo (empresa + serial) con el último envío desde la ficha y
-- las aperturas del link público; `firstViewedAt` es el «visto».
CREATE TABLE IF NOT EXISTS "DeviceReportShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "channel" TEXT,
    "sharedAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceReportShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceReportShare_tenantId_serial_key" ON "DeviceReportShare"("tenantId", "serial");
CREATE INDEX IF NOT EXISTS "DeviceReportShare_customerId_updatedAt_idx" ON "DeviceReportShare"("customerId", "updatedAt");

-- El serial se guarda normalizado en mayúsculas; la comparación del informe
-- público es case-insensitive y esta clave evita filas duplicadas.
ALTER TABLE "DeviceReportShare" DROP CONSTRAINT IF EXISTS "DeviceReportShare_tenantId_fkey";
ALTER TABLE "DeviceReportShare" ADD CONSTRAINT "DeviceReportShare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceReportShare" DROP CONSTRAINT IF EXISTS "DeviceReportShare_customerId_fkey";
ALTER TABLE "DeviceReportShare" ADD CONSTRAINT "DeviceReportShare_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
