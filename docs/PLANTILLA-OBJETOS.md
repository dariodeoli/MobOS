# Objetos predeterminados y reglas — plantilla universal

Inventario de todo lo que debe **reutilizarse en vez de reinventarse** en
cualquier app, con la regla de cada objeto. Reemplazá `<…>` por los datos de
cada app. Cada sección cierra con la **referencia MobOS** (dónde está hoy).

Regla madre: **buscar antes de crear**. Si el objeto existe, se reutiliza; si
falta, se crea en el módulo compartido y se adopta en TODOS los lugares.

---

## 1. Campos de formulario — un componente por tipo de dato

Nunca un `<input>` suelto. Un componente por tipo, en el directorio compartido
(`<components/fields>`), con estilos en un solo archivo.

| Tipo | Objeto | Notas |
| --- | --- | --- |
| Teléfono | `PhoneField` | prefijo/fmt local, teclado numérico |
| Correo | `EmailField` | normaliza a minúsculas, `type=email` |
| Contraseña / PIN | `PasswordField`, `PinField` | mostrar/ocultar obligatorio |
| Moneda / importe | `MoneyField` | separador de miles, 0 decimales si la moneda no los usa |
| Porcentaje | `PercentField` | sufijo, límites |
| Serial / código | `SerialField` | mayúsculas, sin espacios, IMEI con checksum |
| Fechas | `DateField`, `DateRange` | zona horaria única |
| Ubicación | `CityField` / autocompletado | catálogo canónico |
| Cuenta bancaria / billetera | `BankAccountField` | institución + número |
| Identidad fiscal | `TaxIdField` | dígito verificador + patrón extractor (consulta al backend) |
| Redes / enlaces | `SocialField`, `LinkField` | solo https |
| Archivo / imagen | `AttachmentInput` | ver sección 6 |
| Segmentado | `SegmentedField` | opciones excluyentes |
| Tema | `ThemeToggle` | si la app tiene claro/oscuro |

**Patrones de campo (reutilizables, uno por patrón)**
- **Autocompletado**: sugerencias por iniciales sobre lo tipeado, texto libre
  permitido, teclado correcto, sin interferir con pegado/autofill del navegador;
  al elegir se completan los campos derivados (ciudad → departamento, correo →
  dominio).
- **Extractor**: campo + botón corto o lupa (`Icon` + `title`) que consulta un
  endpoint del backend; el resultado se muestra aparte y **se aplica solo al
  confirmar**; nunca pisa lo cargado; si el proveedor falla o no hay cuota, el
  dato se completa a mano y el error se muestra con `role="alert"`.
- Prohibido reimplementar la consulta o las sugerencias dentro de una pantalla:
  el patrón vive una sola vez en el módulo compartido.

**Reglas transversales de campos**
- Label arriba; **error o hint, nunca ambos**.
- `aria-invalid` + `aria-describedby`; el error con `role="alert"`.
- Límites desde `<FIELD_LIMITS>` y mensajes desde `<INPUT_MESSAGES>`: nada de
  strings sueltos.
- Truncar en `onChange`, validar en `blur`, obligatorio con `required` real.
- Teclado móvil correcto (`inputMode`/`pattern`/`autoComplete`).
- El backend revalida SIEMPRE; el front solo ayuda.

> Referencia MobOS: `src/components/shared/*Field.jsx` (Email, Phone, Serial,
> Percent, Instagram), `components/ui` (`Input`, `PasswordInput`, `PinInput`,
> `MoneyInput`), `docs/CAMPOS.md` + `docs/PLANTILLA-CAMPOS.md`.

## 2. Botones y acciones — familias y jerarquía

- **Jerarquía**: primario (color de marca + token *on-color*), secundario
  (transparente o superficie + borde fuerte), peligro (rojo, nunca marca),
  fantasma (sin borde).
- **Contraste garantizado**: si el botón es relleno, su texto usa el token de
  “sobre color”; nunca texto del mismo color que el fondo.
- No restylear botones ya definidos por el sistema sin pedido explícito.
- Deshabilitado: opacidad reducida + `cursor: not-allowed`.
- Foco visible (outline/ring) con offset.
- Altura táctil estándar (≥44px) y radios por contexto (pill para acciones,
  radio medio dentro de paneles).
- Botón solo-icono: siempre `aria-label` + `title`.
- Un componente de acción por contexto; prohibido inventar familias nuevas.
- El pie de acciones vive **asociado al formulario** (ver sección 5).

> Referencia MobOS: `Button`, `IconAction`, `ConfirmDialog` en
> `src/components/ui/index.jsx`.

## 3. Cápsulas, chips y tarjetas — objetos de entidad

- **Cápsula de estado**: color semántico + texto corto + `nowrap`; colores por
  tokens, nunca hardcodeados.
- **Badge/contador**: número en píldora, `tabular-nums`, `nowrap`.
- **Cápsula de dato (KPI)**: eyebrow + valor fuerte + nota; alineación idéntica
  entre todas.
- **Tarjeta de entidad**: encabezado (título + código + estado), hechos/meta en
  columnas alineadas, acciones ancladas al pie.
- **Chip de atributo**: ícono opcional + etiqueta corta (moneda, categoría,
  sin precio).
- **Reglas**: misma altura en cuadrícula; sin cortes de texto; acciones en UNA
  línea como iconos con `title`; sello de verificación (check + foto + nombre +
  fecha/hora) junto al contenido; selección múltiple en lote donde haya listas
  (contador “N seleccionados”, seleccionar visibles, limpiar, resolver en una
  sola operación).

> Referencia MobOS: `Badge`, `Dot`, `Stat`, `Card`, `ListGridToggle`,
> `ComprobantePreview`, `Cronologia`.

## 4. Estados y avisos — únicos por concepto

- Estados de **vacío / carga / error** compartidos; un solo objeto por concepto.
- Avisos de modo (**test/demo/producción**) visibles y en un solo lugar.
- Banners y avisos inline compartidos; prohibido repetir el mismo aviso por
  pantalla ni duplicar estados.
- Los avisos destacados al dueño son solo: bloqueos, plazos con fecha, plata o
  riesgos propios (máximo tres).

> Referencia MobOS: `EmptyState`, `ErrorState`, `Skeleton` en
> `src/components/ui/index.jsx`; modo demo en `src/lib/demoMode.js`.

## 5. Diálogos, acciones y overlays

- Trampa de foco obligatoria al abrir (`useDialogFocusTrap` o equivalente):
  bloquea scroll, enfoca al abrir, cicla Tab, cierra con `Esc`, devuelve el foco
  y cierra con clic en el backdrop.
- Markup: `role="dialog"` + `aria-modal="true"` + ids de título/descripción;
  cierre con `aria-label="Cerrar"`.
- Pie de guardado siempre asociado al formulario; doble clic bloqueado
  (single-flight).
- Eliminación destructiva con confirmación propia (foco/aria), nunca un botón
  suelto; acciones destructivas sobre datos críticos: admin + doble confirmación
  + plazo recuperable + retención.

> Referencia MobOS: `Modal`, `ConfirmDialog`, `Drawer` en
> `src/components/ui/index.jsx` (foco, Esc, scroll lock y retorno de foco).

## 6. Identidad, fotos y archivos

- Identidad **por ID**, nunca por coincidencia de nombre o correo.
- Un **único objeto Avatar** para mostrar personas, con orden fijo:
  foto subida → foto de la identidad (Google) → iniciales. Nunca `<img>` a mano.
- La foto externa se pasa **solo para quien corresponde** (nunca la del dueño a un
  tercero) y se sirve con sesión y `referrerPolicy="no-referrer"`.
- **Formato de subida:** PNG/JPG/WebP hasta **1 MiB**, con validación de MIME y
  **magic bytes** en cliente y servidor; recorte (`PhotoCropper`) + compresión
  (`preparePhoto`) antes de subir; lectura autenticada y borrado explícito
  (tombstone, no se restaura sola).
- Adjuntos: límite de tamaño/tipo, validación de contenido real, acceso
  autenticado, normalización y almacenamiento fuera del HTML público.

> Referencia MobOS: `src/components/shared/Avatar.jsx`, `src/lib/userAvatar.js`,
> `src/lib/tenantLogo.js`, `src/components/shared/PhotoCropper.jsx`,
> `AttachmentInput`/`AttachmentList`, `backend/lib/attachment-storage.ts`.
> Reglas completas: `docs/AVATAR.md`.

## 7. Lógica compartida (frontend)

- **Cliente API único**: timeout por request, caché corta solo-GET, limpieza
  automática en mutaciones, 401/402/403 invalidan la sesión.
- Reglas de campos **puras** en un módulo (reutilizables y testeables).
- Moneda y **zona horaria únicas**; proveedor de moneda en un solo lugar.
- Navegación filtrada por rol desde una matriz central.
- Feedback de mutaciones y **submit single-flight** compartidos.
- Helpers canónicos de formato: dinero, fechas, etiquetas de estado, entradas.
- Montos, fechas y códigos: `nowrap` + `tabular-nums`.

> Referencia MobOS: `src/lib/api/client.js`, `src/lib/roles.js`,
> `src/lib/utils.js`, `src/lib/urls.js`, `src/lib/constants.js`.
> Pendiente: timeout/caché en el cliente API.

## 8. Tokens y estilo — un solo sistema visual

- Un **archivo fuente de tokens** (colores, tipografía, radios, sombras,
  foco) y tokens locales derivados por sección que mapean a los globales.
- Prohibido introducir colores sueltos o estilos inline salvo valores
  dinámicos; nada de colores residuales de etapas anteriores.
- Tipografía: sans para UI; mono para importes, referencias y códigos.
- Respetar `prefers-reduced-motion`; evitar animaciones que rompan el patrón.
- **Un solo activo de marca** (logo, favicon, PWA, Apple touch, social): todo
  consumo apunta a esa fuente.
- Componentes transversales (footer/versión, botones, acceso, metadatos) se
  construyen compartidos antes de replicarse; prohibido copiar marca o HTML por
  pantalla.

> Referencia MobOS: `src/index.css` (tokens), `src/lib/brand.js`,
> `src/lib/tenantLogo.js`, `ProductFooter`, `Icon`.

## 9. Backend — predeterminados

- **Validadores centrales por tipo** (teléfono, correo, serial, moneda, enlace
  https-only, foto con re-encode).
- **Matriz de permisos en un módulo** (`roleCan`): todo control mutante nace con
  gate y **revalida en el servidor**; los campos sensibles se sirven en `null` a
  roles sin acceso y su edición se rechaza (403). Ocultar un botón no es
  autorización.
- **Migraciones**: aditivas, idempotentes y re-ejecutables. **Seeds** con guards
  por conteo + `on conflict do nothing`; nunca «si el dato no existe, salir».
- **Rutas**: un handler por archivo, sin exportar símbolos que no sean handlers,
  sin slugs dinámicos duplicados.
- Rate limits en login, registro, PIN, recuperación, uploads y URLs públicas.
- **Auditoría** de accesos, altas, permisos, ajustes, eliminaciones y acciones
  financieras.
- **Multi-tenant**: cada consulta, archivo y acción limitada por tenant en el
  servidor; el id que manda el navegador es selector, no autorización.
- **Anti-enumeración**: no revelar si un correo/cuenta/empresa existe.
- Secretos solo en el gestor de variables; nunca en Git, frontend, logs ni
  documentación. Headers de seguridad y CORS restringido a orígenes definidos.
- Cierre/eliminación de cuenta desde configuración con confirmación y
  reautenticación; por defecto desactivar/archivar y conservar historial.

> Referencia MobOS: `backend/lib/auth.ts`, `validation.ts`, `rate-limit.ts`,
> `log.ts`, `attachments.ts`, `internal.ts`; `prisma/schema.prisma`.
> Pendiente: headers de seguridad y verificación del aislamiento por tenant en
> cada ruta.

## 10. Dinero y datos críticos

- Operaciones financieras **idempotentes**, con conciliación y recuperación de
  estados ambiguos.
- El navegador nunca habilita acceso ni confirma un pago por sí solo: todo se
  valida en el servidor.
- Comprobantes y registros servidos desde **snapshots inmutables**: si el
  original cambia o se archiva, la historia no cambia.
- Transiciones de estado **monotónicas**: webhooks repetidos o fuera de orden no
  retroceden un estado.
- Si un dato no está disponible (cotización vencida, proveedor sin
  credenciales), se informa **“no disponible”**; nunca se inventa ni se muestra
  como activo.
- No simular capacidades del proveedor/dispositivo: si no la soporta, se muestra
  como no disponible.

> Referencia MobOS: `backend/lib/finance.ts`, `pricing.ts`, `stock.ts`,
> `cash-movements.ts`, webhook de AEX (`app/api/aex/webhook`), recibos
> (`OrderReceipt`, `ComprobantePreview`). Pendiente: snapshots de comprobantes y
> monotonicidad explícita en el webhook.

## 11. Publicación y modo

- Flujo de release reproducible: **fuente única de versión**, parche automático,
  *prepare* (valida, no publica) separado de *publish* (publica), secreto del
  webhook fuera del código.
- Antes de declarar publicado: build, flujos críticos probados, permisos
  verificados con cuenta sin privilegios, salud/HTTPS/dominio/versión
  comprobados.
- Al informar: **versión desplegada explícita**, estado de cada agente
  (terminado / en curso / bloqueado / no iniciado) y pendientes con total.
  Nunca presentar local como publicado.
- Si la app tiene modos, el modo (test/producción) siempre visible.

> Referencia MobOS: `npm run release:check|prepare|publish`, `release:smoke`,
> `version.json`, `src/lib/brand.js`.

## 12. Reglas de creación (proceso)

1. **Buscar antes de crear**: si existe campo, estado, botón o aviso, se
   reutiliza.
2. **Un dato, un dueño**: resúmenes que enlazan a su editor; prohibido duplicar
   editores, datos o banners.
3. **Un solo lugar** para formato de dinero, fechas y etiquetas de estado.
4. Cada regla nueva se fija con **test de aserción de fuente**; las hojas de
   estilo mantienen llaves balanceadas.
5. El **build obligatorio** es la red de seguridad: un borrado manual puede
   romper la sintaxis aunque los tests pasen.
6. Componentes nuevos: tipados, sin comentarios innecesarios, accesibles
   (label, rol, foco, teclado) y con tokens; nunca estilos inline mágicos ni
   colores fuera de la fuente de tokens.
7. Toda sección nueva toca el inventario: o reutiliza el objeto, o lo crea en el
   módulo compartido y lo adopta en todos los lugares.

---

## Checklist de adopción por app

`<APP>` · `<components/fields>` · `<FIELD_LIMITS>` · `<INPUT_MESSAGES>` ·
`<cliente API>` · `<tokens.css>` · `<brand>` · `<roleCan>` · `<validadores>` ·
`<auditoría>` · `<rate limits>` · `<release>` · `<smoke>` · `<backups>` ·
`<gestor de secretos>` · `<matriz de roles>`.
