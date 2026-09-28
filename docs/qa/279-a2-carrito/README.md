# #279 A2 · Carrito POS privado

**Activo = privado, guardado = compartido.**

- El **carrito activo** del POS dejó de ser global: vive bajo la clave
  `mobos:pos-cart:v1:<empresa>:<sucursal>:<usuario>`, así **dos vendedores en la
  misma computadora no se pisan la venta en curso**. Las pestañas del mismo
  vendedor comparten su carrito (es su misma sesión). La clave compartida vieja
  (sin usuario) ya no se lee ni se escribe.
- El **borrador guardado** (ventas suspendidas) sigue siendo compartido en el
  servidor y ahora registra **quién lo creó** y **quién lo retomó** (columnas
  aditivas `resumedById`/`resumedAt` + auditoría `SALE_RESUMED`). Retomar **no
  borra** el borrador: queda en la pestaña **Retomadas** con el registro; el
  creador o gerencia lo descartan.

## Capturas

- `real-01-pendientes-creada-por.jpg` — gerencia ve el borrador de un vendedor
  («Creada por Vendedor E2E Uno») en **Pendientes**.
- `real-02-retomadas-quien-la-retomo.jpg` — tras retomarlo, el registro queda en
  **Retomadas** («Retomada por Administrador»), flujo real con dos usuarios
  (capturas del e2e `qa-279-a2-carrito`).
- `claro-01-pendientes.jpg`, `claro-02-retomadas.jpg` y las variantes `oscuro-`
  y `movil-` — la UI completa en los tres temas (demo).

## Cómo se probó

- Unit `src/lib/posCart.test.js`: la clave separa empresa/sucursal/usuario y dos
  vendedores no comparten el carrito activo (leer/borrar aislados).
- e2e `e2e/qa-279-a2-carrito.spec.js`:
  1. un vendedor suspende el carrito → gerencia lo ve con su nombre y lo
     retoma → el borrador **no se borra**: queda en Retomadas con quién lo tomó
     (y la API lo confirma) → se descarta;
  2. el carrito activo usa la clave del vendedor: la clave compartida vieja y la
     de otro vendedor no se leen al recargar.
- `e2e/demo-anonimo` («el borrador del POS se suspende, se lista, se retoma y se
  descarta») valida la paridad en la demo, incluida la pestaña Retomadas.

## Pendiente reportado (no bloquea)

Los borradores retomados ya no se auto-eliminan: **acumulan** hasta que el
creador o gerencia los descarten (la lista muestra hasta 50 por sucursal). Un
job de limpieza/expiración de borradores viejos queda como mejora cross-domain
para Inventario/Plataforma.

Reproducir las capturas de la demo:

```bash
npx vite --port 5216 --strictPort &
QA_BASE_URL=http://localhost:5216 QA_OUT=docs/qa/279-a2-carrito \
  node scripts/qa-279-a2-carrito.mjs
# Las reales (dos usuarios) salen del e2e:
MOBOS_CAPTURAS=docs/qa/279-a2-carrito npx playwright test e2e/qa-279-a2-carrito.spec.js
```
