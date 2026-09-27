# Unificar clientes duplicados (#268)

Desde la ficha de un cliente (o la lista) se busca el duplicado, se ve **qué se
mueve** antes de confirmar, se elige la **ficha principal** y el duplicado queda
**archivado con puntero** (no se borra) para no romper enlaces, tokens ni
historial. Solo **ADMIN/GERENTE**.

## Flujo

1. **Aviso al crear**: al tipear teléfono, CI/RUC o correo en «Crear cliente»,
   se buscan fichas activas con los mismos datos (normalizados) y se avisa
   («Posible duplicado: … Si es la misma persona, conviene editar esa ficha…»).
2. **Ficha → «Unificar»** (dueño/gerencia): se busca el duplicado por nombre,
   teléfono, documento o correo.
   También desde la **lista**: con exactamente dos fichas tildadas aparece
   «Unificar seleccionados» en la barra de lote y el modal abre con el par ya
   elegido (el primero es la principal).
3. **Preview**: cada lado muestra su contacto, sus etiquetas y **lo que se
   mueve** si se archiva (pedidos, pagos, cotizaciones, notas, seguimientos,
   mensajes, direcciones, titulares, enlaces del portal, garantías, órdenes de
   taller, saldos a favor, puntos, reservas, autorizaciones, campañas, ventas
   suspendidas y necesidades de compra), más los **campos que se completan** y
   los **conflictos** (los datos del principal mandan).
4. **Elegir principal** y confirmar. El duplicado queda con `archivedAt` y
   `mergedIntoId`; su ficha muestra «se unificó con …» y su cronología registra
   la fusión. La principal registra «Cliente unificado» con el resumen movido.

## Contrato

- `GET /api/customers/duplicates?phone=&document=&email=&excludeId=` — fichas
  activas con los mismos datos (aviso de alta).
- `GET /api/customers/[id]/merge?with=<otroId>` — preview de ambos lados.
- `POST /api/customers/[id]/merge { duplicateId, principalId }` — ejecuta el
  merge (transacción). Errores: 403 si no es ADMIN/GERENTE, 404 si no existe,
  409 si alguna ficha ya está archivada.
- `GET /api/customers` excluye las archivadas; `?archivados=1` las incluye.
- Los **tokens del portal** y los enlaces siguen vivos: pasan a la principal.
- Auditoría: `CUSTOMER_MERGED` (principal, con `movidos`/`rellenados`/`omitidos`)
  y `CUSTOMER_MERGED_INTO` (duplicado).

## Modelo

Migración aditiva e idempotente `20261206000000_customer_merge`:
`Customer.archivedAt`, `Customer.mergedIntoId` (FK a sí misma, `SET NULL`) e
índices por `(tenantId, archivedAt)` y `mergedIntoId`.

## Verificación

```bash
npm --prefix backend run test:unit                  # customer-merge + reglas
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
# PASS: unificación de clientes con preview, puntero, auditoría y cronología · 26 chequeos
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM … npx playwright test e2e/qa-268-unificar-clientes.spec.js --project=admin
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-268-unificar-clientes/01-aviso-posible-duplicado.png` | Aviso al crear con el mismo teléfono |
| `docs/QA-268-unificar-clientes/02-antes-unificar.png` · `03-preview-unificacion.png` | Antes y preview de lo que se mueve con la elección del principal |
| `docs/QA-268-unificar-clientes/04-despues-ficha-principal.png` · `05-ficha-archivada-con-puntero.png` | Después: la principal con el historial; la archivada con su puntero |
| `docs/QA-268-unificar-clientes/06-cronologia-unificado.png` | «Cliente unificado» en la cronología |
| `docs/QA-268-unificar-clientes/07-unificar-desde-lista.png` · `08-lista-tras-unificar.png` | Flujo por selección de la lista (dos fichas) y la lista después |
| `backend/tests/customer-merge.test.ts` · `customer-merge.mjs` | Reglas puras y flujo HTTP completo (permisos, tokens, listado) |

## Verificación en producción

Sondeo directo contra `https://api.moboss.online` (sin sesión) para separar
«ruta desplegada» de «ruta inexistente»:

| Ruta | Código | Lectura |
|---|---|---|
| `/api/quotes/test/message` (#261, ya integrado) | **401** | existe y pide sesión |
| `/api/customers/test/merge?with=otro` (#268) | **404** | todavía **no desplegado** |
| `/api/customers/no-existe` | 401 | la ruta `[id]` existe y pide sesión |

La verificación funcional con capturas en una cuenta real queda preparada:
`node scripts/qa-268-merge-produccion.mjs` (requiere
`MOBOS_QA_STORAGE_STATE`, sesión exportada con `npx playwright codegen
--save-storage=/tmp/mobos-qa.json https://app.moboss.online/login`). Abre la
lista, entra a una ficha, comprueba la acción **«Unificar»** y captura el modal
(solo lectura: no ejecuta el merge). Post-integracion correr con
`MOBOS_QA_EXIGIR_DEPLOY=1` para que falle en voz alta si todavía no está
desplegado. El script avisa hoy «pendiente de deploy» y deja las capturas
`docs/QA-268-merge-produccion/`.

## Notas y pendientes

- **El alta ya deduplica por teléfono**: `POST /api/customers` actualiza la
  ficha existente si el teléfono coincide (200 en vez de 201). El aviso del alta
  ayuda a que eso sea una decisión consciente; si el producto quiere bloquearlo,
  es una decisión aparte.
- **CMP**: no hizo falta un objeto nuevo; el modal reusa `Modal`, `SearchField`,
  `Avatar`, `Badge`, `Aviso`, `Button` y `Skeleton` de la biblioteca.
- Los envíos de campaña y los titulares de facturación con choque de índice
  único se **omiten** (quedan en la ficha archivada) y salen en `omitidos` del
  audit.
- Exportaciones y listados externos siguen mostrando el nombre histórico de los
  pedidos (los pedidos no reescriben su `customerName`).
- **Hallazgo de UX (previo, no de este cambio)**: si la tabla de Clientes se
  re-monta (p. ej. al asentar el buscador), la selección por lote se pierde. El
  e2e lo tolera reintentando; conviene un ticket para conservar la selección
  entre refrescos de todas las listas con lote.
- El modal quedó blindado para abrirse desde la lista (ficha sin `cliente`
  definido al cerrar): sin referencias directas a `cliente.name`.
