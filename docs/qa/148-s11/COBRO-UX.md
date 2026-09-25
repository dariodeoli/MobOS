# Épica #148 — §5/§11: cobro (UX): cápsula de cuenta, monto sin cortar, botón y resumen

## El pedido

1. Al elegir una cuenta de cobro, mostrar una **cápsula resumida** (banco/medio con logo,
   titular, número de cuenta, moneda y **saldo si aplica**), no solo el nombre.
2. El **«Gs.»** del monto no debe comerse el espacio ni cortar cifras grandes (prefijo chico o
   sufijo).
3. El **botón de guardar** más ordenado, un poco más grande, con más padding arriba/abajo y
   **naranja cuando el pago es parcial**.
4. **«Total de esta venta · 2 productos · 2 unidades · Descuento»** con fondo **sólido** (no
   transparente) y orden **«Crear pedido…» arriba, productos/importes abajo**.

## Qué cambió

- **Cápsula de la cuenta** (`CapsulaCuentaCobro.jsx`, nuevo): logo del banco (o ícono del medio),
  nombre, chip de moneda, medio, y una línea con lo que hace falta para operar según el medio
  (transferencia: banco · titular · número · CI/RUC; tarjeta: procesadora · titular · acredita en
  N días · comisión; Pix: llave; cripto: red/referencia; efectivo/canje: referencia). Si la venta
  tiene **saldo pendiente** lo muestra (en Gs y, con cuenta extranjera, el equivalente con la
  cotización de la fila). Reemplaza la línea suelta que había en `PaymentAccountFields`.
- **Monto sin cortar**: en `MoneyInput` el prefijo pasa a 10px (`text-mute`, `pl-7`/`pl-10`): gana
  ~20px de número en todos los campos de dinero de la app (**CMP/documentado en
  `docs/CAMPOS.md` §4.3**). En la fila de pago el monto ocupa el ancho de la tarjeta
  (`w-full sm:col-span-2`) y la cotización su propia fila.
- **Botón principal** (`PasoCobro.jsx`): `min-h-14` (56px desktop / 61px mobile, antes 48),
  `py-3` y dos renglones ordenados — etiqueta arriba, «N productos · Gs X» abajo — sin partir el
  importe. Colores: verde completo (`--c-ok`), **naranja parcial (`--c-warn`)**, rojo sin pago
  (`--c-bad`).
- **Resumen «Total de esta venta»** (`ResumenVenta`): fondo **sólido** (`bg-ink-700`, opaco, sin
  degradado translúcido). En mobile queda **debajo** del botón (orden ya definido por
  `order-last`), verificado por e2e.
- **Ancho del cobro**: `PaymentAccountFields` usa `grid-cols-1` (pista `minmax(0,1fr)`): antes la
  pista implícita `auto` la ensanchaba el texto de la cápsula y el campo del monto quedaba
  clipeado en mobile.

## Reglas (para no volver a romperlo)

- **Dinero**: el prefijo se dibuja chico y claro y no resta ancho al valor (10px, `pl-7`/`pl-10`);
  en filas de cobro/pago el campo va `w-full` (`docs/CAMPOS.md`).
- **Cápsula**: se muestra solo con cuenta elegida; el saldo aparece solo si `pendiente > 0`.
- **Botón**: la etiqueta nunca comparte renglón con el importe; el color es el estado
  (verde/naranja/rojo).
- **Resumen**: fondo opaco (sin `from-fono/15` ni degradados con alfa) y, en mobile, después del
  botón.

## Evidencia

- e2e `e2e/pos-148-cobro-ux.spec.js` (5): cápsula con banco/titular/número/moneda y saldo; monto
  grande completo en mobile y desktop (mide el texto contra el ancho útil); botón con alto ≥52,
  dos renglones en orden y los tres colores por estado; resumen sólido (sin degradado, alfa 1) con
  el botón arriba en mobile.
- Guards ejecutados en verde (67 tests): `pos-148-cobro-ux`, `pos-148-s11-sin-stock`,
  `pos-241-v2` (**AA del carrito/cobro con la cápsula y el botón nuevos**),
  `pos-qa-173`, `pos-checkout`, `pos-241-carrito-estados`, `qa-249-pos-touch`,
  `demo-anonimo`, `pos-resumen-fijo`, `dsn-responsive-mobile` · smoke 19/19 (0 flaky).
- Capturas antes/después (sonda `scripts/qa-148-cobro-ux.mjs`, 4 vistas × 4):
  - **Después**: `docs/qa/148-s11/cobro-ux/rama-148-cobro/` — `01` cápsula + saldo + botón
    parcial, `02` monto grande completo, `03` botón completo (verde), `04` resumen sólido.
  - **Antes**: `docs/qa/148-s11/cobro-ux/produccion-antes/` — sin cápsula (solo la línea
    «Itaú · 001-2456789 · Aurora Móviles»), resumen **transparente con degradado** (se lee el
    contenido de atrás), botón de **48px** en un renglón.

| Medición | Antes (producción) | Después (rama) |
|---|---|---|
| Cápsula de cuenta | no (línea suelta) | sí: logo + nombre + moneda + medio + titular/nro + saldo |
| Fondo del resumen | `rgba(0,0,0,0)` + degradado 15% | `rgb(232,236,243)` / `rgb(41,48,63)`, sin degradado |
| Alto del botón | 48px | 56px (desktop) · 61px (mobile) |
| Monto grande (texto vs ancho útil) | se cortaba (campo `w-36`, `pl-12`) | 118px en 196px (desktop) · 135px en 184px (mobile) |
| Orden en mobile | botón arriba (ya) | botón arriba (verificado por e2e) |

## Notas cross-dominio

- **CMP**: `MoneyInput` (biblioteca compartida) cambió el dibujo del prefijo; queda documentado en
  `docs/CAMPOS.md` y el resto de los dominios gana el mismo espacio. No se tocó `Button` (el
  naranja del parcial sigue siendo la clase `bg-warn` sobre `variant="primary"`, que ya usa el
  carril AA existente).
- **FIN**: el «saldo si aplica» quedó del lado de la **venta** (pendiente de cobro, dato que el
  POS ya tiene). Un saldo por cuenta (caja/banco) no existe en la API de cuentas: si FIN lo
  expone, la cápsula puede mostrarlo sin cambios de layout.
