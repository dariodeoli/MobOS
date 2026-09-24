# #83 · Comisiones al día (liquidación sin pisar el corte anterior)

- **Issues:** #83 (comisiones) · #148 §19 (margen) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-24 · **Resultado:** hallazgo real corregido; la pantalla
  liquida **desde donde terminó el último corte** y avisa cuando no hay nada
  pendiente.

## Hallazgo (antes)

El formulario de liquidaciones arrancaba siempre en el **inicio del mes**,
sin mirar los cortes del vendedor. Con un corte vigente (borrador o pagada),
el servidor rechazaba el período por superposición:

```
POST /api/commission-settlements { from: "2026-09-01", to: "2026-09-24" } →
409 Ya existe una liquidación de ese vendedor que se superpone (2026-09-23 al 2026-09-23).
```

El dueño tenía que calcular a mano desde cuándo liquidar y la pantalla no
mostraba cuánto había pendiente: para liquidar las comisiones nuevas había que
adivinar la fecha o anular el corte anterior (perdiendo su comprobante).

## Fix

- `src/utils/comisionesPeriodo.js` (nuevo, puro): `periodoPendiente(cortes,
  { sellerId, hoy, inicioMes })` → `desde` = día siguiente al **último
  `periodTo` vigente** (borrador o pagada) del vendedor, o el inicio del mes si
  no tiene cortes; `hasta` = hoy; `alDia` cuando el corte ya cubre hoy. Ignora
  anuladas, otros vendedores y toma el corte más lejano (no el último creado).
- `src/components/control/Comisiones.jsx`: al elegir el vendedor consulta sus
  cortes (`GET /api/commission-settlements?sellerId=…`), ajusta el período al
  pendiente y muestra el aviso — «Se liquida desde el DD/MM — el último corte
  fue del DD/MM al DD/MM» o «Sin comisiones pendientes: el último corte llega al
  DD/MM» con el botón deshabilitado.
- El servidor **sigue rechazando superposiciones** (no se tocó la regla que
  evita pagar dos veces el mismo tramo): el cambio es de la pantalla.

## Verificación

- **Unit** (`src/utils/comisionesPeriodo.test.js`, **5/5**): día siguiente
  (cruza fin de mes/año), sin cortes → inicio de mes, con corte → día siguiente,
  ignora anuladas/otros vendedores y toma el más lejano, `alDia` cuando el corte
  cubre hoy.
- **e2e** (`e2e/finanzas-comisiones.spec.js`, «la liquidación arranca donde
  terminó el último corte del vendedor»): la expectativa se calcula con los
  cortes **reales** del vendedor (misma función pura) y se verifica el valor de
  «Desde», el aviso y el estado del botón. Corrido con un corte real en la base
  local (2026-09-23 → la pantalla arranca el 2026-09-24) y sin cortes (arranca el
  1° del mes): **2/2**.
- Evidencia del 409 original (arriba) y del corte creado por la API (201) en la
  corrida local.

## Coordinación

- **#83 (comisiones):** la liquidación sigue cobrando exactamente el margen del
  reporte (rondas anteriores: descuento del carrito, margen único por venta,
  ventas sin costo fuera de la ganancia).
- **Servidor:** el guard de superposición queda como está; el bug era el
  período por defecto de la pantalla y la falta de visibilidad.

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **667/667** · build FE ✓ ·
e2e `finanzas-comisiones` **2/2** · `test:unit` ✓ · arnés de integración ✓ ·
sin marcadores de conflicto.
