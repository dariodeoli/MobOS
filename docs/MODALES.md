# Modales y drawers — estándar compartido (#323)

Fecha: 02-10-2026 · Rama: `slot/componentes` · Biblioteca: `owncoding-ui` **v0.62.0**

Origen: auditoría del demo v1.0.209 (modales demasiado altos y feedback
desparejo). El objeto estándar vive en la biblioteca; este documento registra
qué se adoptó, qué falta por dominio y con qué criterio.

## 1. El estándar

| Regla | Quién la garantiza |
| --- | --- |
| Altura máxima y ancho por tipo | `Modal`/`Drawer` + `TAMANOS_MODAL` (`corto`/`formulario`/`amplio`/`completo`) |
| Header fijo, cuerpo desplazable y pie fijo | `Modal`/`Drawer` de la biblioteca; el pie se monta fuera del scroll |
| Pie asociado al `<form>` real | `FormActions`/`SaveActions` (portal + `form={id}`; validación nativa y Enter intactos) |
| Bloqueo mientras guarda | `busy` + `useDialogPending` (un formulario ocioso no destraba a otro) |
| Etiquetas visibles | `FormField` con `label`; el placeholder no es etiqueta |
| Error junto al campo | `FormField error` + reglas de `owncoding-ui/utils` (`obligatorio`, `patron`, `emailValido`, `largoMinimo`, `minimo`, `maximo`…) y `useValidacionCampos` |
| Confirmación al cerrar con cambios | `dirty` o `useDialogDirty(hayCambios)` + `CIERRE_CON_CAMBIOS` («Seguir editando» / «Descartar y cerrar») |
| Acción primaria única | `PIE_ACCIONES`/`SaveActions`: un solo `Button` primario; destructivo en `danger` |
| Toasts de resultado | `useResultado()` (`guardado`, `copiado`, `impreso`, `enviado`) y `fallo(accion, detalle)` |

Guardas ejecutables: `src/lib/modalReglas.test.js` (tamaño/ancho, adopción y
pendientes documentados) y `scripts/auditoria-modales.mjs` (inventario de usos).

## 2. Adoptado en este lote (CMP)

- **`src/components/ui/index.jsx`**: `Modal` y `Drawer` son los de la
  biblioteca y desaparece la copia local. Todo `<Modal>` del sistema hereda
  header/cuerpo/pie y el cierre con confirmación sin tocar cada pantalla.
- **`src/components/shared/modal.js`** y **`formulario.js`**: re-exportan los
  objetos de la biblioteca (misma ruta histórica, cero copia).
- **Resultados canónicos**: `shared/EtiquetasProductoModal.jsx`,
  `shared/ReportePreview.jsx` y `shared/ComprobantePreview.jsx` avisan con
  `useResultado` al imprimir/encolar; `shared/CompartirImagen.jsx`, al copiar.
- **Pie fijo**: `EtiquetasProductoModal` y `PhotoCropper` montan sus acciones en
  el pie del diálogo con `FormActions` (fuera del scroll). `ComprobantePreview`
  y `ReportePreview` conservan su barra de acciones arriba, junto a la vista
  previa; pasarlas al pie queda anotado para su dominio.
- **Cierre con cambios**: `shared/PhotoCropper.jsx` confirma si el encuadre se
  movió o se usó zoom.
- **Evidencia**: capturas claro/oscuro/móvil en `docs/QA-323-modales/` y las
  suites de la biblioteca y del repo.

## 3. Pendientes por dominio

La adopción base (estructura del objeto) ya es global por el swap del kit. Lo
que falta en cada modal es la parte de comportamiento: cierre con cambios,
error junto al campo, etiquetas visibles y feedback canónico.

### CRM

| Modal | Ruta | Qué falta |
| --- | --- | --- |
| Crear cliente | `src/components/ventas/SellerCustomers.jsx:396` | `dirty` al cerrar con datos; errores por campo (hoy un error general dentro del modal); el pie ya es uno solo |
| Crear ficha del cliente | `src/components/customers/FichaClienteModal.jsx:38` | `dirty`; errores por campo (Aviso general) |
| Crear ficha desde el pedido | `src/components/ventas/ClienteDelPedidoModal.jsx:42` | `dirty`; errores por campo |
| Rechazar/aprobar solicitud (ficha) | `src/components/customers/CustomerProfile.jsx:2193` | `dirty`; motivo con error junto al campo (hoy `toast` + gating) |
| Unificar cliente | `src/components/customers/UnificarClienteModal.jsx:134` | `dirty` si se elige destino; resultado canónico |
| Campañas / plantillas del cliente | `src/components/customers/MarketingCampaigns.jsx`, `CampanasClientes.jsx` | toasts de enviar con `useResultado.enviado` |

### INV (inventario y abastecimiento)

| Modal | Ruta | Qué falta |
| --- | --- | --- |
| Carga rápida de unidad («recibir unidad») | `src/components/control/Inventario.jsx:1509` | `size` explícito; `dirty` al cerrar con campos; label visible en Sucursal/Ubicación/Condición/Batería/Importe; el `Aviso` de error hoy queda **detrás del overlay** (moverlo adentro con `FormField error`) |
| Recibir mercadería | `src/components/control/Compras.jsx:592` | `dirty`; errores por campo; un solo primario |
| Incidencia de recepción | `src/components/supply/Recepcion.jsx:534` | `dirty`; error junto al campo y resultado canónico |
| Lista de compra | `src/components/supply/ListaCompraModal.jsx:87` | toasts de imprimir con `useResultado` |
| Etiquetas de preparación | `src/components/supply/EtiquetasPreparacion.jsx:75` | toasts de imprimir con `useResultado` |

### PRN (impresión)

| Modal | Ruta | Qué falta |
| --- | --- | --- |
| Agregar/editar impresora | `src/components/control/Impresoras.jsx:1634` | `dirty`; errores por campo (hoy `toast`); unificar «Guardar» y «Guardar y probar» en un primario + secundario |
| Probar / plantilla de impresora («preview») | `src/components/control/Impresoras.jsx:1887` | ya detecta `sinCambios`: pasarlo a `dirty` para confirmar al descartar; toasts con `useResultado` |
| Documento de unidad | `src/components/inventory/DocumentoUnidadModal.jsx:102` | `dirty` si hay ajustes; resultado canónico |
| Rack de taller (imprimir en serie) | `src/components/inventory/TallerRack.jsx:322` | resultado canónico |

### Otros módulos (POS, taller, configuración)

| Modal | Ruta | Qué falta |
| --- | --- | --- |
| Nueva orden de servicio (taller) | `src/components/control/ServicioTecnico.jsx:611` | `dirty`; errores por campo (hoy `toast` único); label visible en el selector del catálogo |
| Catálogo de servicios | `src/components/control/ServicioTecnico.jsx:721` | labels visibles (hoy `aria-label`); `dirty`; pie estándar |
| Editor de plantilla de WhatsApp | `src/components/control/WhatsAppTemplates.jsx:201` | `dirty`; validación con reglas compartidas |
| Listas de precios | `src/components/control/Precios.jsx:257` | labels visibles en ítems; `dirty`; el `Aviso` de error hoy queda **detrás del overlay** |
| Horario de acceso | `src/components/control/Vendedores.jsx:554` | labels visibles en horas; `dirty`; error adentro |
| Rechazo de autorización | `src/components/control/Autorizaciones.jsx:616` | `dirty`; motivo con `FormField error` (hoy toast + botón deshabilitado) |
| Rechazar rendición | `src/components/delivery/StoreDelivery.jsx:212` | `dirty`; `FormField` |
| Sucursales (config) | `src/components/config/TiendasSucursales.jsx` | `dirty`; errores por campo |
| Destructivo (palabra + clave) | `src/components/config/DialogoDestructivo.jsx:16` | `dirty`; errores por campo |

## 4. Criterio de adopción

1. **`dirty` solo donde hay algo que perder**: formularios que persisten campos.
   Un selector efímero (elegir productos para imprimir, cambiar un formato de
   vista previa) no frena el cierre.
2. **El error va junto al campo**: si el dato tiene campo, usa `FormField
   error` + reglas compartidas; el `Aviso` general queda para errores que no
   pertenecen a un campo (fallo de red, permiso).
3. **El resultado se anuncia una sola vez** con `useResultado`; el error no se
   disfraza de éxito y el detalle dice qué revisar.
4. Un solo botón primario por pie: los demás son `outline`/`ghost`; el
   destructivo es `danger` y confirma.

## 5. Verificación

- Biblioteca: `npm test` (572), `npm run build`, `npm run gallery:check`,
  `npm run readme:check`, `npm run test:types` y `npm run test:package`.
- Repo: `npm run lint`, `npm run build` (front y back), `npm test`,
  `npm --prefix backend run test:unit`, `npm run db:check`, smoke e2e y la
  captura reproducible `MOBOS_CAPTURAS=docs/QA-323-modales npx playwright test
  e2e/qa-323-modales.spec.js -g capturas`.
