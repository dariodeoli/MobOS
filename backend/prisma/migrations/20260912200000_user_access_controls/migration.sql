-- Cambio aditivo: el personal existente conserva rol y acceso sin horario
-- hasta que un administrador configure expresamente esas restricciones.
ALTER TABLE "User"
  ADD COLUMN "permissions" JSONB,
  ADD COLUMN "accessSchedule" JSONB,
  ADD COLUMN "lastAccessAt" TIMESTAMP(3);

CREATE INDEX "User_tenantId_status_lockedUntil_idx"
  ON "User"("tenantId", "status", "lockedUntil");
