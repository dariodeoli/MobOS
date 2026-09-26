# Cierre del dominio Clientes/Pedidos — demo completa (#213) y recorrido de producción (#187)

Verificación del dominio **clientes/pedidos** en la demo pública y en el
recorrido funcional de producción, sobre la versión publicada **v1.0.181**
(26/09/2026), con Playwright headless y **0 llamadas al API real**.

- **#213** (demo: experiencia completa): parte del dominio cliente/pedidos.
- **#187** (recorrido funcional en producción): dominio clientes.

## Resultados de la corrida

| Verificador | Resultado | Evidencia |
|---|---|---|
| `node scripts/qa-221-clientes-produccion.mjs` (agregados demo) | **8/8 OK** · 0 llamadas al API | `docs/QA-213-demo-clientes-pedidos/221/` (9 capturas + `resultados.json`) |
| `node scripts/qa-236-clientes-demo.mjs` (lista, ojito, perfil, mobile) | **6/6 OK** · 0 llamadas al API | `docs/QA-213-demo-clientes-pedidos/236/` (5 capturas + `resultados.json`) |
| `node e2e/prod/187-clientes.mjs` (recorrido completo de clientes) | **22/22 OK** · 28 capturas | `docs/QA-213-demo-clientes-pedidos/187/` (+ `resultados.json`) |

## #213 — qué cubre el dominio cliente/pedidos

| Contenido pedido | Evidencia |
|---|---|
| **Clientes** ficticios con teléfonos `+595 9xx`, CI/RUC ficticios, direcciones, notas, etiquetas e historias (compras, deuda, seguro, facturación a otro titular) | Cartera demo de **12 clientes**; Lucía con 5 compras · **Gs 7.750.000** · saldo **Gs 1.500.000** · serial `356789012345678`, seguro 12,5% y nota pública (`221/`, `236/`, `187/05–12`) |
| **Pedidos** asociados con estados variados (pagado, parcial, entregado, cancelado) | Ficha → Pedidos: MOB-#0008/#0005/#0002 + la venta cancelada MOB-#0031; agregados calculados como la cuenta real (`221/`, `187/07`, `187/11`) |
| **Pagos** visibles con su medio y vínculo al pedido | Portal: «Tus pagos» + **el pedido en detalle** (líneas y pagos confirmados) (`187/22`, `187/23`) |
| Portal del cliente por token (cuenta, vitrina, cotizaciones, seguimiento) | `187/13–16`, `187/22–24` + capturas del ojito y del perfil |
| Recorrido navegable punta a punta con capturas y checks | Los tres verificadores de arriba + `e2e/demo-crm.spec.js` (harness) |

Los datos financieros más finos de la demo (cuentas, conciliación, split de
pagos, autorizaciones) se cierran desde el dominio FIN; acá se evidencia lo que
el cliente/pedido muestra (historial, estados, deuda y portal).

## #187 — dominio clientes en producción

El recorrido completo (ficha, deuda, cronología, seguro, estadísticas,
WhatsApp, ojito, portal/seguimiento, perfil) dio **22/22** con 28 capturas y
**0 llamadas al API** de clientes/portal. Detalle paso a paso:
`docs/QA-187-clientes-produccion.md`.

**Estado de los hallazgos del dominio:** (1) el perfil personal quedó en
`/mi-cuenta` (la coordinación pedía `/mi-perfil`) — funciona igual, pendiente de
unificar el nombre canónico; (2) la nota pública de la demo se edita pero su
guardado/render en el portal requiere cuenta real (limitación conocida).

## Hallazgo de verificador corregido

`scripts/qa-236-clientes-demo.mjs` clickeaba el ítem «Clientes» del menú: con el
rediseño pasó a tener dos coincidencias accesibles (sidebar y menú mobile) y el
paso fallaba por *strict mode*. Ahora navega directo a `/clientes`. El producto
no cambió: la lista, el ojito, el perfil y los accesos táctiles siguen igual.

## Reproducir

```bash
MOBOS_QA_OUT=docs/QA-213-demo-clientes-pedidos/221 node scripts/qa-221-clientes-produccion.mjs
MOBOS_QA_OUT=docs/QA-213-demo-clientes-pedidos/236 node scripts/qa-236-clientes-demo.mjs
QA187_SHOTS=docs/QA-213-demo-clientes-pedidos/187 node e2e/prod/187-clientes.mjs
```

**Novedades para el dueño**
- La demo de clientes y pedidos quedó verificada de punta a punta: 12 clientes
  con historias, compras, deuda y seguro, y pedidos con estados y pagos.
- El recorrido de clientes en producción quedó en verde con capturas (22/22),
  incluido el portal del cliente con seguimiento y detalle de pedido.
- Sin hallazgos nuevos de producto; solo se ajustó un verificador al menú nuevo.
