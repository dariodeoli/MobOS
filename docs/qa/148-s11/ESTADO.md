# Épica #148 — §11: pagos divididos: estado y brechas

## Implementado y verificado ✅

- **Bloques de pago**: medio/cuenta con buscador (`CuentaCobroCombobox`), **moneda de la
  cuenta**, **cotización** (automática editable + ficticia en demo), **monto** (original y
  equivalente) y **total/pendiente** que se recalcula al instante.
- **Acciones**: **+ Agregar pago** y **Dividir saldo (Gs X)** con el **saldo precargado** en
  el bloque nuevo (fix #187); el botón principal cambia de estado: `Crear pedido` (parcial) →
  **`Confirmar venta`** (completo) / `Crear pedido sin pago` / `Guardar pedido`.
- **Multi-pago**: N bloques (efectivo + transferencia + tarjeta + USD) con **saldo restante**
  y validación de tope (no permite pagar de más).
- **Evidencia**: `docs/qa/204/01-02` (split con cuenta USD: cotización 7.300, equivalente
  exacto, «Dividir saldo» con saldo precargado y venta cerrada) y `e2e/pos-checkout` +
  `e2e/pos-qa-173` en verde.

## Brechas detectadas (no implementadas)

1. **Eliminar un bloque de pago** (§11: «cada bloque … eliminar»): el bloque no tiene botón
   para quitarlo; hoy se corrige vaciando el monto. **Punto:** `PasoCobro.jsx`, el `pagos.map`
   de bloques (agregar un botón trash por índice → `setPagos(a => a.filter((_, j) => j !== i))`).
2. **Estado por bloque y «marcar como no pagado»**: el POS registra cada bloque como
   `CONFIRMED` al vender (`PaymentAccountFields` L53). El estado `PENDING` existe en el modelo
   y se usa en postventa (detalle del pedido), pero el POS no ofrece marcarlo. Requiere
   decisión de producto: marcar un bloque como no pagado al cargar (p. ej. tarjeta rechazada)
   y que el backend lo acepte en `payments[].status`.

**Capturas:** el split y sus estados quedaron capturados en `docs/qa/204/`; las capturas de
las dos brechas se toman cuando se implementen (requieren decisión en el punto 2).
