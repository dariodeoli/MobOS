-- #193 · requestId idempotente por empresa. Aditiva y re-ejecutable: se conserva
-- el único global (el código ya filtra por empresa y devuelve 409 si otra lo usó).
CREATE UNIQUE INDEX IF NOT EXISTS "ImeiCheckQuery_tenantId_requestId_key" ON "ImeiCheckQuery"("tenantId", "requestId");
