-- Aviso de cuota ya vencida: se marca aparte del recordatorio previo al
-- vencimiento para que una cuota que se pasó de fecha no quede sin reclamar.
ALTER TABLE "Payment" ADD COLUMN "overdueRemindedAt" TIMESTAMP(3);
