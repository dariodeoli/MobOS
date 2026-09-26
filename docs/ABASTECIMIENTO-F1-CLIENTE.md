# Abastecimiento F1 — Cliente con permiso en la tarjeta de necesidad (#254)

Parte del dominio **clientes** en F1 (#254, épica #250): sobre el **motor de
demanda de INV** (`dee58859`), la tarjeta de necesidad muestra el cliente de la
venta/reserva **solo a quien puede gestionarlo**, y sabe cuándo hay un cliente
detrás aunque su nombre no viaje.

> Nota de coordinación: mi primera pasada de F1 (motor propio) quedó
> **superseded** por el motor de INV (`backend/lib/supply-demand.ts`), que cubre
> venta sin stock, cantidad > stock, promesa (`ORDER_COMMITTED`), reserva por la
> diferencia, mínimos y centro de compra. Esta rama se rebasó sobre
> `slot/inventario` y conserva **solo la pieza de cliente**, más la evidencia de
> #187. No hay archivos duplicados.

## Qué se entregó

| Archivo | Cambio |
|---|---|
| `backend/lib/supply-customer.ts` (nuevo) | `puedeVerCliente(permisos)`: `*` o `customers:manage`; el resto ve el vínculo sin el nombre |
| `backend/app/api/supply/needs/route.ts` | El nombre del cliente del pedido vinculado pasa a regirse por **permiso** (antes, lista fija de roles) |
| `backend/lib/supply.ts` | Los destinos consolidados suman **`clienteOculto`**: hay `clienteId` pero el nombre no viaja, así la tarjeta puede explicarlo |
| `backend/tests/supply-customer.test.ts` (nuevo) | Unit: permiso (`*`, `customers:manage`, recortado), `clienteOculto` con y sin nombre, reposición sin cliente |
| `backend/tests/supply-customer.mjs` (nuevo) | Integración HTTP: la venta sobre pedido deja la necesidad con el cliente (ADMIN ve el nombre); un comprador con permisos recortados ve el mismo panel con `clienteOculto` |

## Contrato para el panel (PLT)

- `GET /api/supply/needs` → cada destino `PEDIDO`:
  - `clienteId` **siempre** viaja (el vínculo con la ficha queda).
  - `cliente` (nombre) solo con `customers:manage`/`*`.
  - `clienteOculto: true` cuando hay cliente y el nombre fue retenido → la
    tarjeta puede mostrar «Cliente sin permiso» sin filtrar datos.
- `pedidoId`/`pedidoNumero` siguen viajando para abrir la venta original.

## Decisiones (documentadas)

- **Permiso, no rol**: antes eran `ADMIN`/`GERENTE` fijos; ahora manda
  `customers:manage`, que es recortable por integrante (los permisos de un rol
  se configuran como subconjunto). Un comprador con `stock:manage` y sin acceso
  a clientes ve la demanda sin el nombre.
- **El vínculo nunca se pierde**: el id del cliente y el pedido viajan siempre;
  solo se retiene el dato personal.
- **Sin migración**: no se toca el schema (el motor de INV ya agregó `origin`).

## Verificación

```bash
npm --prefix backend run test:unit                   # 107 ✓ (incluye supply-customer)
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
# PASS: cliente con permiso en la tarjeta de necesidad · 7 chequeos
```

| Evidencia | Qué cubre |
|---|---|
| `backend/tests/supply-customer.test.ts` | Regla de permiso y `clienteOculto` en la consolidación |
| `backend/tests/supply-customer.mjs` | Necesidad de una venta sobre pedido: nombre para el dueño; oculto+vinculado para un comprador recortado |
| `backend/tests/supply-needs.mjs` (INV) | El panel y el motor siguen verdes con el campo nuevo |
