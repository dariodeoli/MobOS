-- Guía de envío AEX en los traslados entre sucursales. Migración aditiva.

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN "aexGuide" TEXT;
