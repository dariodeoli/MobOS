-- Precio de lista congelado por línea de venta: permite mostrar el
-- descuento en el comprobante cuando el precio manual quedó por debajo.
ALTER TABLE "OrderItem" ADD COLUMN "listPricePyg" INTEGER;
