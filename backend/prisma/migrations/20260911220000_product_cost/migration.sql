-- Costo real del producto y foto del costo al momento de la venta.
-- Aditiva y opcional: no modifica datos existentes ni obliga a recargar nada.
-- Product.costPyg: costo de reposición cargado por el dueño.
-- OrderItem.unitCostPyg: costo congelado en la línea de la venta, para que la
-- ganancia histórica no cambie si después se actualiza el costo del producto.

ALTER TABLE "Product" ADD COLUMN "costPyg" INTEGER;

ALTER TABLE "OrderItem" ADD COLUMN "unitCostPyg" INTEGER;
