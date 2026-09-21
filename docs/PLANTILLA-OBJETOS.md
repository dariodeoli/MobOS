# Objetos predeterminados y reglas — plantilla universal

Inventario de todo lo que debe **reutilizarse en vez de reinventarse** en
cualquier app, con la regla de cada objeto. Reemplazá `<…>` por los datos de
cada app. Cada sección cierra con la **referencia MobOS** (dónde está hoy).

Regla madre: **buscar antes de crear**. Si el objeto existe, se reutiliza; si
falta, se crea en el módulo compartido y se adopta en TODOS los lugares.

---

## 1. Campos de formulario — la biblioteca real (un objeto por dato)

Nunca un `<input>` suelto, una variante local ni una máscara casera: se busca el
objeto canónico acá y se usa tal cual. Inventario **real** de MobOS, con el
patrón de uso de cada familia y un ejemplo corto.

### 1.1 Tabla por tipo de dato

| Tipo | Objeto canónico | Patrón de uso | Ejemplo corto |
| --- | --- | --- | --- |
| Texto libre | `ui/Input` + `Label`/`FormField` | label arriba (`htmlFor`), `required` real, `maxLength` por tipo (120/200) | `<FormField label="Nombre" htmlFor="x"><Input id="x" value={v} onChange={…} /></FormField>` |
| Texto largo | `ui/Textarea` | notas 2000, descripciones 400; `rows` fijo | `<Textarea rows={2} value={nota} onChange={…} />` |
| **Moneda Gs/USD** | `ui/MoneyInput` + `shared/CurrencySelect` | PYG **sin decimales** (separador de miles), USD/BRL/EUR/USDT **con 2**; el símbolo lo dibuja el campo; entrega el número limpio por `onValueChange`; `currency` manda; `max` = tamaño del monto (ver 1.3) | `<MoneyInput currency={form.currency} value={form.monto} onValueChange={…} /><CurrencySelect value={form.currency} onChange={…} />` |
| Moneda de solo lectura | `ui/Money` | nunca convertir a mano; no finito → `—` | `<Money value={fila.totalPyg} />` |
| Porcentaje | `shared/PercentField` (+`parsePercent`/`formatPercent`) | coma decimal, 0–100, hasta 2 decimales; guardar con `parsePercent`, mostrar con `formatPercent` | `<PercentField value={desc} onChange={setDesc} />` |
| Teléfono | `shared/PhoneField` | código de país editable (default `+595`) + número con espacios; valida `telefonoValido` | `<PhoneField value={form.phone} onChange={…} />` |
| Correo | `shared/EmailField` | `type=email`, sugiere dominios, no rompe pegado/autofill | `<EmailField value={mail} onChange={…} />` |
| Serial / IMEI | `shared/SerialField` (+`SerialTexto` lectura) | mayúsculas, sin espacios ni prefijo interno; varios seriales con `normalizeScan` | `<SerialField value={serial} onChange={…} />` |
| Fechas / horas (24 h) | `ui/Input type="date"` / `type="datetime-local"` + `shared/RangoFechas` | fechas en 24 h según locale; rango con atajos (24 h, 7 d, 30 d) | `<RangoFechas valor={rango} onChange={setRango} />` |
| PIN | `ui/PinInput` | 4 dígitos, teclado numérico, autoenvía al 4.º; puntos propios (nunca visibles) | `<PinInput value={pin} onChange={setPin} onComplete={…} />` |
| Contraseña | `ui/PasswordInput` | mostrar/ocultar obligatorio, 8–72 en auth | `<PasswordInput value={pass} onChange={…} />` |
| Archivo / imagen | `shared/AttachmentInput` (+`AttachmentList`, `PhotoCropper`) | JPG/PNG/WebP/PDF ≤5 MiB validado en cliente y servidor; foto de persona con `Avatar` | `<AttachmentInput onSelect={setAdjunto} />` |
| Búsqueda instantánea | `shared/SearchField` | lupa + botón limpiar; el debounce vive en la pantalla; conserva `placeholder`/`aria-label`/ref | `<SearchField value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" />` |
| Banco | `shared/BancoCombobox` (+`BancoLogo`) | catálogo BCP completo al abrir, filtra al instante, texto libre, logo por banco | `<BancoCombobox value={bank} onChange={setBank} />` |
| Producto | `shared/ProductCombobox` | buscar/elegir y crear producto desde el campo | `<ProductCombobox products={prods} onSelect={…} onCreate={…} />` |
| Ciudad | `shared/CityAutocomplete` | sugiere y completa el departamento | `<CityAutocomplete value={ciudad} onChange={…} />` |
| RUC / CI | `shared/RucField` (+`utils/ruc.js`) | input + **Extraer RUC**; el resultado se aplica solo al confirmar | `<RucField value={ruc} onChange={…} />` |
| Instagram / usuario | `shared/InstagramField` | `@` fijo, sin espacios, guarda el usuario pelado | `<InstagramField value={ig} onChange={…} />` |
| Catálogo cerrado | `ui/Select` | opciones cerradas (estado, rol, moneda, medio); nunca texto libre para catálogos | `<Select value={rol} onChange={…}>{…}</Select>` |
| **Booleano** | `shared/Switch` | estado de formulario ("activo", "aplica descuento"): interruptor estilo iPhone; guarda `onChange(event.target.checked)` | `<Switch checked={form.activo} onChange={e => set(e.target.checked)} />Activo` |
| Selección múltiple | `ui/Input type="checkbox"` (`accent-fono`) | listas con varias filas (seleccionar visibles, IMEIs, checklist, destinatarios) | `<input type="checkbox" checked={sel} onChange={…} aria-label={…} />` |
| Opciones excluyentes (2–5) | `shared/SegmentedField` | barra segmentada con `aria-pressed`; `options` = `[id, etiqueta, icono?, contador?]` | `<SegmentedField value={periodo} onChange={setPeriodo} options={[['dia','Día'],['mes','Mes']]} />` |
| Subnavegación de sección | `ui/Subtabs` | pestañas anchas de una subpágina (misma fuente para todas) | `<Subtabs value={tab} onChange={irASubtab} items={tabs} />` |
| Lista/cuadrícula | `shared/ListGridToggle` | solo íconos, `aria-pressed` | `<ListGridToggle value={vista} onChange={…} />` |
| Tema | `app/ThemeToggle` | claro/oscuro con tokens | `<ThemeToggle />` |

### 1.2 Patrón de uso por familia

- **Moneda (Gs/USD).** El campo nunca escribe el símbolo dentro del valor: lo
  dibuja el prefijo del `MoneyInput` y la divisa la define `currency` (+
  `CurrencySelect` cuando el usuario elige). PYG se guarda **numérico entero**
  y se escribe con separador de miles; las monedas con centavos se guardan como
  string decimal limpio (`parseUsdInput`) y se muestran con coma. El pegado de
  un monto con símbolo o separadores funciona: el campo limpia lo que no sea
  dígito/coma/punto. Prohibido formatear a mano, convertir monedas en el campo
  o usar `type="number"`.
- **Porcentaje.** `PercentField` con coma decimal (0,5 / 12,5), hasta 2
  decimales; al guardar `parsePercent`, al mostrar `formatPercent`; el `%` va en
  la etiqueta, nunca dentro del valor.
- **Búsqueda.** `SearchField` (lupa + limpiar) con filtrado instantáneo: la
  pantalla decide si filtra en memoria o consulta a la API y con qué debounce;
  jamás se bloquea el tecleo ni se desarma el pegado/autofill.
- **Archivo e imagen.** `AttachmentInput` valida tipo y tamaño (y *magic bytes*
  en el servidor); las fotos de personas van siempre por `Avatar` (foto subida →
  Google → iniciales, ver `AVATAR.md`); las imágenes se recortan/comprimen antes
  de subir.
- **Identidad.** Personas con `Avatar` por `id`; bancos con `BancoCombobox`
  (logo del registro compartido); la sucursal con `SelectorSucursal`.
- **Autocompletado.** Sugerencias por iniciales, texto libre permitido, teclado
  correcto y sin interferir con pegado/autofill; al elegir se completan los
  campos derivados (ciudad → departamento, banco → logo).
- **Extractor.** Campo + botón corto o lupa (`Icon` + `title`) que consulta al
  backend; el resultado se muestra aparte y **se aplica solo al confirmar**;
  nunca pisa lo cargado; si el proveedor falla, el dato se completa a mano y el
  error va con `role="alert"`.
- **Booleanos y opciones.** Un booleano de formulario va con `Switch` (estado
  activo/inactivo); una selección múltiple con checkbox; 2–5 opciones
  excluyentes con `SegmentedField`; la subnavegación con `Subtabs`; los
  catálogos cerrados con `Select`. No se inventan pestañas, toggles ni
  segmentados locales.

### 1.3 Reglas transversales de campos

- Label arriba; **error o hint, nunca ambos**; `aria-invalid` +
  `aria-describedby`, error con `role="alert"`.
- **Tamaños de monto (épica #148, sección 9):** el campo general soporta hasta
  **10.000.000.000** y las ventas hasta **99.000.000.000**, sin truncar lo que
  se escribe. `MoneyInput` usa el límite general por defecto; las pantallas de
  venta pasan `max={LIMITE_MONTO_VENTAS}` (POS #151 y FIN). Al superarlo el
  campo se marca (`aria-invalid`) y el formulario valida con `excedeMonto`;
  nunca se recortan dígitos.
- Teclado móvil correcto (`inputMode`/`pattern`/`autoComplete`); nada de
  máscaras que rompan pegado, autofill o `fill()` de las pruebas.
- Solo dígitos: `inputMode="numeric"` + limpieza `\D`; porcentajes con
  `PercentField`; montos con `MoneyInput`.
- El backend revalida SIEMPRE; el front solo ayuda. Obligatorio con `required`
  real y validación al enviar (no solo al perder foco cuando bloquea el guardado).
- Cada regla nueva se fija con test de aserción de fuente (`src/lib/camposReglas.test.js`,
  `src/lib/bancosLogos.test.js`): si un campo se reimplementa suelto, el test falla.

> Referencia MobOS: `src/components/ui/index.jsx` (`Input`, `Textarea`, `Select`,
> `MoneyInput`, `Money`, `PasswordInput`, `PinInput`, `Subtabs`),
> `src/components/shared/` (`SearchField`, `SegmentedField`, `Switch`,
> `PercentField`, `PhoneField`, `EmailField`, `SerialField`, `RucField`,
> `CityAutocomplete`, `ProductCombobox`, `BancoCombobox`, `BancoLogo`,
> `AttachmentInput`, `RangoFechas`, `ListGridToggle`), `src/utils/moneda.js`
> (`LIMITE_MONTO_GENERAL`, `LIMITE_MONTO_VENTAS`, `excedeMonto`),
> `docs/CAMPOS.md` + `docs/PLANTILLA-CAMPOS.md`.

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
- **Logos de bancos y marcas externas:** un registro reutilizable
  (`src/lib/bancosLogos.js`) resuelve nombre → asset del repo
  (`public/bancos/`, sin hotlinks) → marca vectorial compartida →
  monograma con iniciales y color. Se muestra con el objeto `BancoLogo`;
  las pantallas no arman rutas de logo por su cuenta.

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
> Implementado: timeout por pedido, caché corta solo-GET e invalidación
> (`src/lib/api/client.js`, `requestCache.test.js`).

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
> Implementado: headers de seguridad en `backend/middleware.ts` (CSP, nosniff,
> frame-ancestors, HSTS) y aislamiento por tenant verificado por el arnés
> (`security-regression`, `authorization-limits`).

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
> (`OrderReceipt`, `ComprobantePreview`). Implementado: snapshots inmutables de
> comprobantes (`receiptSnapshot`, migración `order_receipt_snapshot`).
> Pendiente: monotonicidad explícita en el webhook de AEX.

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
