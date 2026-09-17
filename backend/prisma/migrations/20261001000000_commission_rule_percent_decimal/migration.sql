-- La comisión del margen pasa de entero a porcentaje decimal (0–100 con
-- hasta 2 decimales, ej. 0,2). El ALTER es reejecutable: si la columna ya
-- está en DECIMAL(5, 2) no hay cambio de datos.
ALTER TABLE "CommissionRule" ALTER COLUMN "percentPyg" TYPE DECIMAL(5, 2);
