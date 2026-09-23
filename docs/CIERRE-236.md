# Cierre de #236 — Clientes estilo Pedidos: ojito + popup + detalle completo

Material listo para el cierre del issue (lo publica el integrador). **Estado:
#236 cerrado en GitHub** (22/9/2026 23:56 UTC) con el comentario de cierre del
integrador; la evidencia final (post-deploy v1.0.143) viajó en el merge
`0553d1da` de la ola **v1.0.144**. Este dossier queda como registro del cierre.

Incremento posterior de la rama `slot/clientes`: **seguimiento del informe
compartido visto/no visto** (#240 ítem 3) sobre la misma ficha de dispositivos
de #236 — chip Visto/Sin ver por equipo + evento de apertura en la cronología
(`docs/QA-240-informe-visto.md`).

## Qué pedía #236 (contra `origin/main`)

| Pedido | Dónde vive | Estado |
|---|---|---|
| Filas con aire y datos clave: contacto, tipo, pedidos, total gastado, **última compra** y **deuda si hay** | `src/components/customers/ClientesTabla.jsx` (dos líneas: nombre + contacto; columnas Cliente · Tipo · Pedidos · Total gastado · Última compra · Deuda · Acciones) | ✅ |
| Datos: la deuda entra a las stats del listado | `src/lib/customerAggregates.js` (`pendingPyg`) + `backend/app/api/customers/route.ts` (pendiente = total − cobrado confirmado, sin cancelados) | ✅ |
| **Ojito → popup rediseñado y reordenado** con resumen rápido + acciones (WhatsApp, editar) y “Ver detalle completo” | `src/components/customers/ClienteResumenPopup.jsx` (avatar, tipo, contacto, tags; KPIs: total, pedidos, última compra, deuda, seguro; últimas compras con estado; notas interna/pública; pie con WhatsApp · Editar · Ver detalle completo) | ✅ |
| **Otro acceso → detalle completo** (CustomerProfile) | Ícono `external` por fila (`ClientesTabla`) + `CustomerProfile` con `tabInicial` (el “Editar” del popup entra por **Datos**) | ✅ |
| Mobile: ambos accesos táctiles con tooltip/aria | `IconAction size="touch"` (36×36) con `title`/`aria-label` (verificado en la demo) | ✅ |
| Se mantiene: orden por columnas, selección por lote y WhatsApp con plantilla | Columnas nuevas ordenables (última compra, deuda) + `BarraLote` + `WhatsAppMenu` | ✅ |
| Reusar objetos de la biblioteca | `Modal`, `Avatar`, `FilaDato`, `Badge`, `CeldaMoneda`, `IconAction`, `WhatsAppMenu`, `Skeleton`, `BarraLote`, `ROTULO_DATO`/`CELDA_DATO`, `lib/estadoEquipo` — único cambio aditivo compartido: `IconAction size="touch"` (anotado para CMP/DSN) | ✅ |

**Commits en `origin/main`:** `990224d2` (feature) · `e5f17952` (verificación demo
con capturas) · `965fd9dc` (post-deploy v1.0.141) · merges `5da39a8c` y
`7ddcb02d`.

## Evidencia

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-236-clientes/` | Antes/después de la vista: `01` el diseño previo, `02` la fila nueva (contacto, tipo, 5 compras, Gs 7.750.000, última compra, Deuda Gs 1.500.000, acciones), `03` el resumen rápido, `04` el detalle completo, `05` “Editar” por Datos |
| `docs/QA-236-clientes-demo/` | **Post-deploy en la demo pública**: `resultados.json` + 5 capturas de la corrida sobre **v1.0.143** (6/6 pasos, 0 llamadas al API de clientes) |
| `e2e/qa-236-clientes.spec.js` | Cuenta real del harness: fila, tres accesos (con aria), lote, popup, detalle, detalle directo y editar-por-Datos |
| `e2e/demo-crm.spec.js` | Demo: el ojito abre el resumen con los datos locales y “Ver detalle completo” entra al perfil |
| `scripts/qa-236-clientes-demo.mjs` | Verificador reusable (harness/producción): `node scripts/qa-236-clientes-demo.mjs` |

## Comentario listo para pegar (al cerrar)

```md
**#236 integrado y verificado en producción v1.0.143** — commits `990224d2`
(feature) y `e5f17952`/`965fd9dc` (verificación), merges `5da39a8c`/`7ddcb02d`.

La lista de Clientes quedó estilo Pedidos: filas con aire y datos clave
(contacto, tipo, pedidos, total gastado, última compra y deuda) y dos accesos
por cliente — el **ojito** abre el **resumen rápido** (KPIs, últimas compras,
notas y acciones WhatsApp/Editar/Ver detalle completo) y el ícono de detalle
abre el **perfil completo**; “Editar” entra por la pestaña Datos. Se mantienen
el orden por columnas (ahora también última compra y deuda), la selección por
lote y el WhatsApp con plantilla. Los accesos son táctiles (36×36) con
`aria-label`.

Verificación: e2e de cuenta real + demo (`e2e/qa-236-clientes.spec.js`), tests
unitarios de la deuda, y corrida post-deploy contra la demo pública en
**v1.0.143** (`scripts/qa-236-clientes-demo.mjs`: 6/6, 0 llamadas al API real)
con capturas en `docs/QA-236-clientes-demo/` y antes/después en
`docs/QA-236-clientes/`.

**Novedades para el dueño**
- La lista de Clientes ahora se ve como la de Pedidos: cada fila muestra
  contacto, tipo, cuántas compras hizo, cuánto gastó, cuándo compró por última
  vez y si debe algo.
- El ojito abre un resumen rápido del cliente con sus números y acciones
  (WhatsApp, editar, ver todo); el otro ícono va directo a la ficha completa.
- Se mantiene todo lo de antes: ordenar por columnas, seleccionar varios para
  copiar teléfonos o exportar, y el WhatsApp con la plantilla recordada.
- En el celular los accesos quedaron más grandes y con su descripción para
  lectores de pantalla.
```

## Observaciones (no bloquean)

- El único cambio additivo en un objeto compartido es `IconAction size="touch"`
  (default `sm` intacto), anotado para CMP/DSN junto con los íconos `wrench` y
  `mail`.
- La fila dejó de ser `role="button"`: el clic sigue como atajo y los accesos
  accesibles por teclado/lector son los dos íconos con `aria-label`.
