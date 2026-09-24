# #83 · Control de créditos: la lista se corta, los totales no

- **Issues:** #83 (comisiones/créditos de Finanzas) · #148 (§17/§19 de control) ·
  **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-24 · **Resultado:** hallazgo real corregido; los totales de
  la pantalla de créditos se calculan sobre **todos** los deudores.

## Hallazgo (antes)

`/api/credits` devolvía la lista de deudores (los 200 más morosos) y armaba los
**totales sumando esas mismas filas**:

```
totals.outstandingPyg = Σ outstandingPyg de las 200 filas
totals.customersWithDebt = filas con deuda
```

Con más de 200 clientes con deuda, «Total por cobrar», «En mora» y los
contadores de clientes quedaban **cortos en silencio** (sin aviso), y el
**Resumen** consume esos mismos totales.

## Fix

- `backend/app/api/credits/route.ts`: la consulta por cliente se compone una vez
  (`Prisma.sql`, parametrizada) y se usa para:
  1. la **lista** (ordenada por mora, `LIMIT 200`, como antes), y
  2. una **agregación aparte** sobre todos los deudores que alimenta los
     `totals` (por cobrar, en mora, clientes, por vencer).
  La respuesta agrega `truncado` cuando la lista llegó al tope.
- `src/components/control/Creditos.jsx`: aviso «Mostrando los primeros 200
  clientes con deuda — los totales de arriba incluyen a todos» cuando aplica.

## Verificación (`backend/tests/credits-totales.mjs`, en el arnés y CI)

Siembra **205 deudores** propios (orden pendiente vencida hace 2 días, sin
pagos), verifica que la lista se corta en 200 con `truncado: true` y compara los
totales de la API contra una **agregación SQL independiente** (sin repetir la
consulta de la API):

```
Créditos: la lista se corta y los totales incluyen a todos los deudores (#83)...
PASS: créditos sin totales truncados — lista 200 con aviso, totales sobre 222 deudores
      (por cobrar 25655900 · en mora 20600000) · 9 chequeos
```

Antes del fix los totales habrían sido la suma de las 200 filas (20.000.000 en
mora en vez de 20.600.000 con los 205 sembrados). El test limpia lo que sembró.

## Coordinación

- **Resumen** consume `totals` de este endpoint: ahora son exactos.
- La **lista** sigue acotada a 200 (ventana de pantalla) y lo informa; el orden
  por mora no cambia.

## Checks

`lint` 0 errores (1 warning preexistente) · `npm test` **670/670** ·
`tsc --noEmit` ✓ · build FE ✓ · build BE con `BUILD_ID` ✓ · `prisma:validate` ✓ ·
**arnés de integración PASS** (9 chequeos nuevos) · `test:e2e:smoke` **7/7** ·
sin marcadores de conflicto.
