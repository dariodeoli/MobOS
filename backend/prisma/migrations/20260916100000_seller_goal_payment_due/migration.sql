-- Meta diaria de venta por vendedor y vencimiento de cuotas en pagos a
-- crédito. Migración estrictamente aditiva.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "dailyGoalPyg" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "dueAt" TIMESTAMP(3);
