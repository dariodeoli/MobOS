-- Lista de precios en dólares por producto (para clientes que pagan en USD).
ALTER TABLE "Product" ADD COLUMN "priceUsd" DECIMAL(14, 2);
