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

## Brechas cerradas

1. **Eliminar un bloque de pago** (§11: «cada bloque … eliminar»): ✅ cada bloque tiene su
   papelera (`PasoCobro.jsx`, `Eliminar pago N`), con target de 44 en mobile (#249).
2. **Estado por bloque y «marcar como no pagado»** (§11): ✅ cada bloque muestra su estado
   (`Pagado` / `No pagado`, `aria-pressed`) y se puede alternar al cargar. Un bloque marcado
   como no pagado **no suma al cobrado**, deja ese saldo en «Pendiente», la venta se guarda
   como **parcial** (`Crear pedido`) y el pago viaja con `status: 'PENDING'` (el backend ya lo
   validaba). Implementado con el mismo carril de validación de cada bloque; sin decisión de
   producto pendiente porque la épica ya define la acción.

**Evidencia**: `e2e/pos-qa-173` «split: un bloque marcado como no pagado deja el saldo
pendiente y el pedido parcial» (pago CONFIRMED 40.000 + PENDING 60.000 y pedido PENDING),
capturas en `docs/qa/148-s11/no-pagado/` (sonda `scripts/qa-148-s11-no-pagado.mjs`).
