# §11 — brecha cerrada: eliminar bloque de pago

- Cada bloque de pago tiene ahora un botón de papelera (`Eliminar pago N`) que lo quita de la lista (`setPagos(a => a.filter((_, j) => j !== i))`) y recalcula saldo/estado del botón principal.
- Evidencia: `e2e/pos-checkout` en verde (split con dos bloques) + smoke.
- Pendiente con decisión de producto: «marcar como no pagado» por bloque (el POS registra cada bloque como CONFIRMED al vender; el estado PENDING existe en el modelo y se usa en postventa).
