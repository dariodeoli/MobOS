# §19 (Customers) en cuenta real — perfil completo y seguro

Verificación de §19 de la épica **#148** en una **cuenta real (no demo)**: el
listado ordenado por actividad reciente y el perfil completo (antigüedad, total
gastado, órdenes, últimas órdenes, direcciones, notas, RUC, tags,
minorista/mayorista, paga impuestos) + el seguro del cliente. Capturas en
`docs/QA-160-perfil-produccion/`.

## Cómo se verificó

- **Spec**: `e2e/qa-160-perfil.spec.js` (proyecto admin del harness: sesión real,
  API real y base real, sin modo demo). Crea su cliente de prueba vía API
  (documento único por corrida) con direcciones + adicional, tags, tipo
  mayorista, impuestos, crédito y seguro, y **dos pedidos** (uno con saldo), y
  recorre listado → ficha → Pedidos → Estadísticas → Datos. **Read-only** sobre
  las fichas existentes.
- **Corrida**: `npx playwright test e2e/qa-160-perfil.spec.js` ✓ (con las
  variables `MOBOS_E2E_*` del worktree).
- **Producción real**: el mismo ítem queda listo para correr con sesión real
  exportada —
  `npx playwright codegen --save-storage=/tmp/mobos-qa.json https://app.moboss.online/login`
  y luego `node scripts/qa-160-customers-produccion.mjs` (script nuevo,
  read-only, con `--config` para ver qué falta; escribe capturas +
  `resultados.json` en `docs/QA-160-perfil-produccion/`). Al momento de esta
  entrega no había sesión de producción disponible en el entorno: la corrida
  real se hace con ese comando.

## Evidencia (cuenta real del harness)

| Ítem §19 | Resultado | Captura |
|---|---|---|
| Listado **ordenado por actividad reciente** (selector «Recientes» → `orden=actividad` al servidor) y con pedidos/total por cliente | ✅ | `01-listado-actividad.png` |
| **Resumen** con TOTAL GASTADO Gs 4.500.000 · SALDO PENDIENTE Gs 2.000.000 (Deuda) · ÓRDENES ACTIVAS 1 · PEDIDOS 2 · ÚLTIMA COMPRA · **Antigüedad «Hoy»** · Paga impuestos **Sí** · Dirección · Etiquetas · **Mayorista** · últimas órdenes | ✅ | `02-perfil-resumen.png` |
| **Pedidos** del cliente (uno pendiente con saldo y uno completado) | ✅ | `03-perfil-pedidos.png` |
| **Estadísticas** (ticket promedio Gs 2.250.000, frecuencia, favoritos) | ✅ | `04-perfil-estadisticas.png` |
| **Direcciones** con adicional («Casa» **Predeterminada** + «Depósito») y **notas** interna/pública | ✅ | `05-perfil-datos-direcciones.png` |
| **Seguro del cliente**: interruptor activo + 10% y la referencia al % de la empresa | ✅ | `06-perfil-datos-seguro.png` |
| **RUC**, tags y tipo (minorista/mayorista) | ✅ | `02` |

## Hallazgo corregido

- **La antigüedad de un cliente creado hoy mostraba «—»** en el Resumen y en
  Estadísticas. Ahora muestra **«Hoy»** (`CustomerProfile.jsx`,
  `antiguedadTexto`), y el spec lo verifica.

## Observación (sin cambio)

- El dato «RUC» del Resumen usa el **RUC de facturación**; si el cliente solo
  tiene CI cargado, muestra «—» aunque el CI esté en la cabecera de la ficha
  (comportamiento actual, documentado).
