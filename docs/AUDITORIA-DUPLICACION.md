# Auditoría de duplicación del front (MOS-CMP)

Fecha: 21-09-2026 · Rama: `slot/componentes` · Alcance: `src/` (front).

Objetivo: encontrar la **misma cosa implementada varias veces** (componentes,
patrones, estilos y lógica JS), crear o unificar el objeto reutilizable en la
biblioteca compartida, migrar los usos y dejar la regla fijada con un test de
aserción de fuente. Regla madre: buscar antes de crear
(`docs/PLANTILLA-OBJETOS.md`).

## 1. Aplicado en este lote

| Objeto | Dónde vive | Antes (evidencia) | Después |
| --- | --- | --- | --- |
| `Aviso` (banner inline error/ok) | `src/components/ui/index.jsx` | El mismo `<p>` con `rounded-lg border border-bad/30 bg-bad/10 … text-bad` copiado **92 veces en 53 archivos**, en 3 variantes de padding | **92 usos** pasan por `Aviso tono="error\|ok"`; `role` por tono (`alert`/`status`) y `compact` para el tamaño chico |
| `CELDA_ENCABEZADO`, `ROTULO_DATO`, `ROTULO_SECCION` | `src/components/shared/tabla.js` | La clase de encabezado repetida **25 veces en 17 archivos** (como constante local `CELDA_*` en 14 y suelta en 4); el rótulo de sección repetido **49 veces en 20 archivos** | Encabezados y rótulos salen de un solo módulo: `CELDA_ENCABEZADO` en 16 pantallas, `ROTULO_DATO` en 13 y `ROTULO_SECCION` en 21; los alias locales `CELDA_INV/CELDA_CLI/…` desaparecen |
| `fechaHora`, `fechaDia`, `fechaHoraCorta`, `fechaCorta` | `src/utils/fecha.js` | El helper `fechaHora`/`fmt`/`fecha` redefinido con el mismo cuerpo en **12 archivos** (más 3 usos sueltos de `dateStyle: 'short'`); el formato es-PY repetido en 58 lugares | Helperos compartidos con texto de vacío explícito (`'—'` o `''`), adoptados en **19 archivos**; el formato de pantalla queda en un solo lugar |
| Tests | `src/utils/fecha.test.js`, `src/lib/objetosReglas.test.js` | — | Fallan si vuelve a aparecer el `<p>` del aviso, la clase de tabla copiada o el formato de fecha duplicado |

Verificación del lote: `npm run lint` (0 errores), `npm test` (400 en verde),
`npm run build`, e2e smoke. Sin cambios de presentación: donde la pantalla
definía un tamaño propio (por ejemplo `p-3`, `rounded-xl`, `px-3.5 py-2.5`) se
conservó tal cual.

## 2. Backlog priorizado (con evidencia)

### P1 — Decisiones de diseño antes de tocar (DSN)

1. **Formato de dinero partido en dos.** `ui/Money` y `utils/moneda.js`
   (`formatGs`/`formatUsd`) no dicen lo mismo:
   - `Money` (USD): `US$ 1,234.56` (en-US); `formatUsd`: `USD 1.234,56` (es-PY).
   - `formatGs`: `Gs 12.500`; y hay **7 usos a mano** de `Gs. …toLocaleString('es-PY')`
     en `Inventario.jsx:73`, `inventory/UnidadDetalle.jsx:24`,
     `customers/CampanasClientes.jsx:65/149`, `ventas/CheckoutCustomer.jsx:101`,
     `lib/servicioImpresion.js:9`, `ventas/SellerCatalog.jsx:32/72`.
   - `docs/TABLAS.md` documenta `Gs. 12.500.000`. Falta decidir el canónico
     (`Gs` vs `Gs.`; `US$` en-US vs `USD` es-PY) y migrar; el caso duplicado
     exacto `precio(amount, currency)` de `Inventario`/`UnidadDetalle` puede
     unificarse apenas DSN confirme el texto.
2. **Horas en 12 h vs 24 h.** `docs/CAMPOS.md` y `PLANTILLA-OBJETOS.md` piden
   24 h, pero el locale `es-PY` de CLDR rinde 12 h: `toLocaleString('es-PY',
   { dateStyle:'short', timeStyle:'short' })` → `17/9/26, 3:30 p. m.`. Los
   helpers nuevos conservan la salida actual (no cambian la app); forzar
   `hour12: false` es una decisión de diseño que cambia todas las fechas.
3. **Celda de dato e identidad.** `truncate text-xs text-mute` se repite **74
   veces en 32 archivos** y `truncate text-[13px] font-semibold` **21 veces en
   14**; `TABLAS.md` habla de `text-sm` para el nombre. Candidatos:
   `CELDA_DATO` y `CELDA_IDENTIDAD` en `shared/tabla.js`, previa confirmación
   del tamaño.

### P2 — Objetos de plataforma faltantes (PLT)

4. **Vista lista/cuadrícula persistida**: el par `useState(() => localStorage.
   getItem('mobos:<vista>-vista'))` + `ListGridToggle onChange={…setItem…}`
   está copiado en `control/Inventario.jsx` (2 vistas),
   `ventas/SellerCatalog.jsx` y `ventas/SellerCustomers.jsx` (**8 accesos**).
   Objeto propuesto: hook `useVistaListaGrid(clave, inicial)`.
5. **Copiar al portapapeles con feedback**: `navigator.clipboard` aparece
   **23 veces en 18 archivos** con tres estilos de feedback (toast, aviso
   local, silencio) y errores que a veces no se anuncian. Objeto propuesto:
   `copiarAlPortapapeles(texto)` en `utils/` que devuelve ok/error.
6. **Descargar archivo del cliente**: el patrón `Blob` + `<a download>` +
   `revokeObjectURL` está **6 veces en 5 archivos**, aunque existe
   `utils/descargarCsv.js` (que solo sirve para endpoints `/api/exports`).
   Objeto propuesto: `descargarArchivo(nombre, contenido/mime)` reutilizado por
   CSV, JSON y adjuntos.
7. **Enlace de WhatsApp**: `https://wa.me/…` se arma a mano en 4 lugares
   (`ventas/PagosPedido.jsx:40`, `customers/customerMessaging.js:17`,
   `ventas/FormularioVenta.jsx:1917`, `pages/GarantiaPublica.jsx:85`), con y
   sin plantilla. Objeto propuesto: `whatsappUrl(telefono, mensaje, countryCode)`
   (ya existe la mitad en `customerMessaging.js`).
8. **`device-id`**: el mismo `localStorage.getItem('mobos:device-id') ||
   crypto.randomUUID()` + `setItem` está en `pages/Login.jsx` (2),
   `pages/AceptarInvitacion.jsx` y `control/Config.jsx` (**8 accesos**).
   Objeto propuesto: `deviceId()` en `lib/storage.js`.

### P3 — Patrones de UI por pantalla (DSN + slots de dominio)

9. **Aviso con estructura** (ícono o botón "Reintentar"): 6 lugares repiten el
   mismo contenedor con `role="alert"` y contenido hijo
   (`ventas/SellerData.jsx:68`, `customers/CampanasClientes.jsx:118`,
   `productos/KardexProducto.jsx:131`, `pages/Login.jsx:318/324`,
   `control/DatosPrivados.jsx:84`, `control/PaymentAccounts.jsx:252`). Necesita
   que `Aviso` acepte un elemento contenedor (`como="div"`); quedó fuera del
   lote para no inventar API sin DSN.
10. **Mapas de estado → etiqueta/tono duplicados** (dominio de cada slot):
    - `pages/PortalCliente.jsx:10-15` y `pages/CuentaPublica.jsx:10-17` tienen
      los **mismos tres mapas** (`ORDER_STATUS`, `FULFILLMENT`,
      `WARRANTY_STATUS`) y las mismas `tonoPedido`/`tonoGarantia`.
    - `lib/servicioChecklist.js` (ESTADOS), `control/ServicioTecnico.jsx:26-37`
      (ESTADOS + ESTADO_LABEL + ESTADO_TONE), `control/Compras.jsx:52`,
      `control/AuditoriaEfectivo.jsx:16`, `control/Conciliacion.jsx:21`,
      `control/Auditoria.jsx:225`, `ventas/venta/entrega.js:18-21`.
    - Tono de unidad: `control/Inventario.jsx:57` y
      `inventory/UnidadDetalle.jsx:18` definen reglas distintas para el mismo
      dato (una considera `condition === 'NEW'`).
    Propuesta: `utils/estados.js` con `{ etiqueta, tono }` por estado y un
    `tonoUnidad(unit)` en `utils/inventario.js`, coordinado con INV/CRM/POS.
11. **Campos crudos pendientes del barrido de #147** (DSN):
    - `pages/RemitoPublico.jsx:170` y `pages/CotizacionPublica.jsx:148`
      (`<textarea>` con las clases del sistema copiadas), `ventas/PedidoDetalle.jsx:568`
      (comentario del pedido), `shared/WhatsAppMenu.jsx:192` y
      `control/WhatsAppTemplates.jsx:162` (editores de plantilla),
      `control/Vendedores.jsx:372` (rename en línea), `control/Impresoras.jsx:1077`
      (sufijo del papel). Los `<input type="checkbox">` sueltos son la
      selección múltiple permitida; no se tocan.
12. **Tono de badges/chips de estado** repetido como clases
    (`border-bad/30 bg-bad/10`) en `pages/CotizacionPublica.jsx:11`,
    `ventas/SellerOrders.jsx:110/114`, `customers/*`: usar `Badge` con `color`
    del mapa (punto 10).

### P4 — Menores

13. **`escapeHtml` propio** en 3 archivos (`shared/OrderReceipt.jsx`,
    `shared/reporteEjecutivo.js`, `control/Comisiones.jsx`); candidato a
    `utils/printHtml.js`.
14. **Fechas de impresión/reportes**: `lib/printing/reportes.js:9`,
    `lib/printing/tickets.js:13/672`, `lib/imeiComprobante.js:38`,
    `lib/customerReport.js:49` mantienen su propio `fecha` (algunos con vacío
    `''`). Es del dominio de impresión (PRN): adoptar `utils/fecha.js` con el
    fallback vacío.
15. **`Caja.jsx:47`** tiene un `fechaHora` con `toLocaleString('es-PY')` sin
    opciones (formato largo): es otro formato; se deja hasta decidir el
    estándar del punto 2.

## 3. Fuera de alcance en esta pasada

- `backend/` y `print-agent/`: la auditoría es del front. La regla madre de
  objetos aplica igual (validadores, permisos, migraciones), pero requiere una
  pasada específica con `db:check`.
- Imprimir con `SegmentedField`/`Subtabs` duplicados: los tests existentes de
  `disenoReglas.test.js` ya cubren ese barrido (#147).

## 4. Cómo reproducir las cifras

```bash
# Un archivo con el walker de la auditoría (mismo criterio: sin tests)
node scripts/…   # ver el detalle en el handover de la rama
```

Los conteos salen de contar ocurrencias exactas de la clase o del helper con
`readdirSync` recursivo sobre `src/`, excluyendo `*.test.*`. Los tests
`src/lib/objetosReglas.test.js` y `src/lib/disenoReglas.test.js` son la versión
ejecutable de las reglas: si la duplicación vuelve, fallan.
