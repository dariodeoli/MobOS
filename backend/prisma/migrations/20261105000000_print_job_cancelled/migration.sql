-- #128: cancelación de trabajos de impresión pendientes.
-- Estado terminal: el claim solo toma PENDIENTE (state = 'PENDIENTE'), así que
-- un trabajo CANCELADO nunca sale al reconectar el puente; libera cupo de
-- trabajos abiertos y la purga de metadatos lo alcanza como cualquier terminal.
ALTER TYPE "PrintJobState" ADD VALUE IF NOT EXISTS 'CANCELADO';
