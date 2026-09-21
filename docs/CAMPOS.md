# Reglas de inputs y textfields (MobOS)

Regla viva del proyecto: se invoca con **rdi** (skill `.claude/skills/rdi`). Antes de crear o tocar un campo, usá el componente compartido que ya cubre el caso. Este archivo es la fuente única; el skill solo la señala.

## 1. Kit base — `src/components/ui/index.jsx`

| Componente | Para qué | Reglas / defaults |
|---|---|---|
| `Input` | Texto/número/base de todo | El tipo lo define el uso (`tel`, `email`, `date`) |
| `Textarea` | Notas, coberturas, mensajes | — |
| `Select` | Opciones cerradas (estado, rol, medio, categoría) | Nunca texto libre para catálogos |
| `Label` / `FormField` | Etiqueta y campo con hint/error accesible | `htmlFor` obligatorio |
| `MoneyInput` | Importes | PYG con separador de miles; USD/BRL/EUR/USDT 2 decimales; el símbolo lo dibuja el campo; entrega número limpio por `onValueChange` |
| `Money` | Importe de solo lectura | PYG `formatGs`, USD `US$ 1,234.5`; valor no numérico → `—` |
| `PasswordInput` | Contraseña | Toggle ver/ocultar; 8–72 en auth |
| `PinInput` | PIN | 4 dígitos, teclado numérico, `one-time-code`, autoenvía al 4.º; los dígitos no se dibujan (texto transparente) y el componente pinta un punto por dígito — sin depender de `-webkit-text-security` ni de glifos de la fuente |
| `IconAction` | Acción como ícono con tooltip | Tonos por acción (`ok`/`warn`/`fono`/`bad`/`mute`), `h-7 w-7`, `active:scale-95`, `disabled:opacity-40` — reemplaza botones de texto en filas |
| `Button`, `Modal`, `Drawer`, `ConfirmDialog`, `Card`, `Badge`, `Stat`, `DataTable`, `EmptyState`, `ErrorState`, `PageHeader`, `Skeleton`, `Toast/useToast`, `Eyebrow`, `Dot` | Soporte de pantallas | — |

## 2. Campos compuestos

| Componente | Regla | Dónde se usa |
|---|---|---|
| `shared/PhoneField` (+ `parseTelefono`/`componerTelefono`) | Código de país editable (default `+595`, presets +55/+54/+56/+591/+598/+1/+34/+44/+351) + número que admite dígitos, espacios, guiones y paréntesis (espacio tras el código: `+595  99467453`). Valida con `telefonoValido` y muestra `MENSAJE_TELEFONO` | Sucursal, cliente, checkout, proveedor |
| `shared/EmailField` | Sugiere dominios frecuentes mientras se teclea (gmail, hotmail, outlook, yahoo, icloud, live, hotmail.es, outlook.es); no interfiere con pegado, autocompletado ni `fill()`; `type="email"`; máx 200 | Login, registro, recuperación, empresa, vendedores ×2, cliente ×2, proveedor |
| `shared/InstagramField` | `@` fijo no borrable, sin espacios, solo `[A-Za-z0-9._]`, máx 30; guarda el username pelado (el link se arma después) | Sucursal |
| `shared/CityAutocomplete` | Ciudad con sugerencias y departamento automático; texto libre permitido | Sucursal, proveedor, direcciones de cliente y checkout |
| `shared/PercentField` (+ `parsePercent`/`formatPercent`) | Porcentaje 0–100 con coma decimal y hasta 2 decimales (`0,2`, `12,5`): limpia a dígitos y una sola coma, máx 6 caracteres. `onChange` entrega el string con coma; al guardar usar `parsePercent` (número o `null`) y al mostrar `formatPercent` | Comisión de vendedores (acepta decimales 0–100 con coma), seguro del producto, descuento por medio de cobro, descuento de línea, cupón porcentual y descuento de producto |
| `shared/CurrencySelect` | Moneda del sistema en un `Select` cerrado: `PYG · Gs`, `USD · Dólares`, `BRL · Reales`, `EUR · Euros`, `USDT · Tether` | Gastos, compras y cuentas de cobro |
| `shared/SerialField` (+ `normalizarSerial`) | IMEI/serial de UNA unidad: mayúsculas, sin prefijo `MOBOS:`, sin espacios ni guiones (varios seriales se normalizan con `normalizeScan` al enviar) | Garantías, canje, herramienta del vendedor y pagos de pedido |
| `shared/RucField` (+ `utils/ruc.js`) | RUC/CI con extractor: input + **Extraer RUC** (lupa) contra `GET /api/ruc`; el resultado se aplica solo al confirmar; sin proveedor → carga manual | Alta de cliente, compras, identidad de ficha (CustomerProfile), vendedor y checkout |
| `shared/AttachmentInput` (+ validación de *magic bytes* en backend) | Adjunto JPG/PNG/WebP/PDF de hasta 5 MiB | Comprobantes y fotos de pedidos, unidades y garantías |
| `shared/AttachmentList` | Lista, descarga y baja (con confirmación) de los adjuntos de un documento, más el alta con `AttachmentInput` | Gastos, compras, pagos a proveedor, caja y transferencias |
| `shared/ProductCombobox` | Buscar/elegir producto (y crear desde ahí) | POS, compras, combos, cotizaciones y promociones |
| `shared/BancoCombobox` (+ `shared/BancoLogo`, `lib/bancosLogos.js`) | Banco del catálogo paraguayo con sugerencias ilustradas (logo por banco) y texto libre permitido; el logo sale del registro reutilizable: asset del repo → marca vectorial compartida → monograma con iniciales y color. Nunca deja un cuadro roto | Cuentas de cobro (alta, filas y búsqueda) |
| `shared/RangoFechas` | Desde/hasta con atajos | Reportes, caja |
| `shared/SelectorMedioPago` + `shared/MedioPago` | Elegir medio de pago / mostrarlo | POS, pedidos |
| `shared/NumericKeypad` | Teclado numérico grande | POS/cobros |
| `inventory/SerialUnitPicker` | Elegir IMEIs/unidades; exige serial cuando corresponde | POS |
| `ventas/PaymentAccountFields` | Cuenta de cobro + monto + cotización | POS |
| `CameraScan` | Escaneo por cámara de IMEI/código (hoy local en `Inventario.jsx`) | Inventario |
| `shared/PegarEnlaceToken` | Entrada de enlace completo cuando el token de acción no llega por la URL (relays de correo); extrae el código de 64 hex con `extractTokenFromUrl` | Invitación, recuperación, verificación de correo |

## 3. Patrones reutilizables

- **Autocompletado** (`CityAutocomplete`, `EmailField`, `BancoCombobox`): sugerencias por iniciales sobre lo tipeado (ciudades con su departamento, dominios de correo frecuentes, bancos con su logo), texto libre permitido, teclado correcto y sin interferir con pegado, autocompletado del navegador ni `fill()`. Al elegir una sugerencia se completan los campos derivados.
- **Extractor** (`RucField`): campo + botón corto o lupa (`Icon` con `title`) que consulta un endpoint del backend. El resultado se muestra aparte y **se aplica solo al confirmar** (“Usar estos datos”); nunca pisa lo cargado. Si el proveedor falla o no hay cuota, el dato se completa a mano (el backend responde `manualEntryAllowed`) y el error se muestra con `role="alert"`.
- Regla común: un solo objeto por patrón en `components/shared`; prohibido reimplementar la consulta o las sugerencias dentro de una pantalla.

## 4. Reglas por tipo de dato

1. **Solo dígitos**: limpieza `.replace(/\D/g, '')` o `soloDigitos`; `inputMode="numeric"`; `maxLength` cuando aplica (PIN 4, batería 3). Campos: batería, días/plazos, cantidades, umbral de reposición, horas de reserva, PINs.
2. **Porcentajes**: `PercentField` con coma decimal y hasta 2 decimales; la comisión del margen admite decimales 0–100 (ej. `0,2`) y se guarda con `parsePercent`; al mostrar, `formatPercent`. Si el dato es entero por diseño (cupones), validar el entero antes de enviar.
3. **Moneda**: PYG se guarda numérico y se escribe con separador de miles (`MoneyInput`); monedas extranjeras con 2 decimales. El símbolo nunca se escribe dentro del valor.
4. **IMEI/serial**: alfanumérico (no se restringe a dígitos), `autoCapitalize="characters"`; al guardar/buscar se normaliza `trim`, sin prefijo `MOBOS:`, sin espacios ni guiones, mayúsculas (`normalizeScan`); se aceptan varios separados por coma o salto de línea.
5. **Teléfono**: ver `PhoneField`. Validación: Paraguay móvil `9` + 8 dígitos; otros países 6–12 dígitos. Clientes guardan `countryCode` + `phone`; sucursales y proveedores guardan `+<código> <número>`; los links wa.me usan `internationalPhone`.
6. **Correo**: `EmailField` con sugerencias; `type="email"`, `autoComplete="email"`, máx 200.
7. **Instagram**: ver `InstagramField` (dato guardado sin `@`).
8. **Ciudad**: ver `CityAutocomplete`.
9. **Texto libre**: nombres 120, direcciones 400, notas 2000; fechas `type="date"`; códigos con `pattern` (promociones `[A-Za-z0-9_-]{2,40}`).
10. **PIN/contraseña**: PIN siempre `PinInput`; contraseña `PasswordInput`.
11. **Adjuntos**: JPG/PNG/WebP/PDF, ≤5 MiB, verificados por *magic bytes* en backend; subida multipart. Las fotos se comprimen en el navegador antes de subir (`comprimirImagen`, máx. 1600 px de lado mayor, fallback al original si algo falla). El modelo genérico `Attachment` identifica al documento dueño con `entity` (`EXPENSE`, `PURCHASE`, `SUPPLIER_PAYMENT`, `CASH_SESSION`, `STOCK_TRANSFER`) + `entityId`; los metadatos viven en la base y los bytes en `data` (ByteA) con respaldo en el volumen `MOBOS_STORAGE_DIR` vía `storageKey`. Endpoints: `GET/POST/DELETE /api/attachments` y `GET /api/attachments/[id]/download` (auditan `ATTACHMENT_CREATED` y `ATTACHMENT_DELETED`).
12. **RUC/CI**: `shared/RucField` (input + botón **Extraer RUC** contra `GET /api/ruc`): el patrón único vive en `src/utils/ruc.js` (`RUC_RE`, `extraerRuc`, `esRuc`) y la razón social se aplica solo si se confirma; si el proveedor no responde, se completa a mano.
13. **Búsquedas**: texto libre por `q`; en escaneos, normalizar a mayúsculas sin separadores (`normalizeScan`).
14. **Interfaz**: nunca emojis; indicadores con `Icon`.

## 5. Utilidades y validaciones

- `src/utils/telefono.js`: `normalizarTelefono`, `internationalPhone`, `telefonoValido`, `MENSAJE_TELEFONO`.
- `src/utils/moneda.js`: `formatGs`, `formatGsInput`, `parseGsInput`, `formatUsdInput`, `parseUsdInput`, `formatUsd`, `formatMoney`.
- `src/lib/actionToken.js`: `consumeActionToken` (hash/query/path y limpieza de URL), `extractTokenFromUrl` (código de 64 hex desde enlaces pegados, incluidos los de tracking).
- `src/utils/csv.js`: `parseDelimited` / `filasConEncabezado` para el import CSV de productos.
- `backend/lib/validation.ts`: `serialKey` (IMEI), `digitsOnly`, `internationalPhone`.
- `backend/app/api/payments/_lib.ts`: `MAX_PROOF_SIZE_BYTES` (5 MiB), `PROOF_MIME_TYPES` + magic bytes.
- `backend/lib/attachment-storage.ts`: `saveAttachment`/`readAttachment`/`deleteAttachment` (volumen `MOBOS_STORAGE_DIR` con respaldo en `data`).
- `backend/lib/attachments.ts`: `ATTACHMENT_ENTITIES`, `checkAttachmentTarget` (visibilidad del documento dueño) y `attachmentMetadata`.

## 6. Cobertura

`npm test` (unitarios de frontend) · `npm run test:unit` (backend) · `npx playwright test` (e2e: batería, teléfono, límite de crédito, checkout, paneles). El test de aserción de fuente (`src/lib/camposReglas.test.js`) falla si un RUC se consulta fuera de `RucField` o si vuelve un input de correo/teléfono crudo.
