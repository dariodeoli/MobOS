# Reglas de inputs y textfields — plantilla genérica (cualquier app)

Regla viva del proyecto: se invoca con **rdi** (skill `.claude/skills/rdi` o el nombre que uses). Antes de crear o tocar un campo, usá el componente compartido que ya cubre el caso. Un solo archivo es la fuente única; el skill solo lo señala. Al clonar esta plantilla en una app nueva, renombrá este archivo al doc de reglas del proyecto (ej. `docs/CAMPOS.md`) y ajustá país/moneda base.

## 1. Principios

1. **Un componente por tipo de dato**, no un `input` por pantalla. Si el caso no existe, se crea en `shared/` y se adopta en TODOS los lugares donde hoy se escribe a mano.
2. **Defaults sensatos**: código de país, moneda base, formato decimal y límites siempre predefinidos.
3. **Normalización en el borde**: el valor se limpia al tipear/pegar y se valida al enviar; el backend revalida (nunca confiar en el cliente).
4. **Lo que se guarda ≠ lo que se muestra**: se guarda número/username/teléfono normalizado; el símbolo (`$`, `Gs`, `%`, `@`) lo dibuja el campo.
5. **Nada de máscaras que rompan**: el input debe tolerar pegado, autofill del navegador y automatización (`fill()`).

## 2. Kit base (design system)

| Componente | Para qué | Reglas / defaults |
|---|---|---|
| `Input` | Texto/número/base | El tipo lo define el uso (`tel`, `email`, `date`, `password`) |
| `Textarea` | Notas, mensajes, listas simples | — |
| `Select` | Opciones cerradas (estados, roles, medios) | Nunca texto libre para catálogos |
| `Label` / `FormField` | Etiqueta + hint + error accesible | `htmlFor` obligatorio; error con `role="alert"` |
| `MoneyInput` | Importes | Moneda base con separador de miles; extranjeras con 2 decimales; entrega número limpio |
| `Money` | Importe de solo lectura | Formato canónico; valor no numérico → `—` |
| `PasswordInput` | Contraseña | Toggle ver/ocultar; mínimo 8, máximo 72 |
| `PinInput` | PIN/código | 4–6 dígitos, teclado numérico, `one-time-code`, autoenvío al completar |
| Apoyo | `Modal`, `Card`, `Badge`, `DataTable`, `PageHeader`, `EmptyState`, `Skeleton`, toasts | — |

## 3. Campos compuestos recomendados (con su regla)

| Componente | Regla | Defaults |
|---|---|---|
| `PhoneField` | Código de país **editable** con `+` fijo + número que admite dígitos, espacios, guiones y paréntesis (espacio tras el código); valida longitud local | Código del país de operación (ej. `+595`), presets de códigos frecuentes |
| `EmailField` | Sugiere dominios frecuentes mientras se teclea, **solo si hubo teclado real** (no en pegado/autofill); `type="email"` | `gmail`, `hotmail`, `outlook`, `yahoo`, `icloud`, `live` (+ variantes del país); máx 200 |
| `SocialUserField` (Instagram/usuario) | Prefijo `@` fijo no borrable, sin espacios, `[A-Za-z0-9._]`; guarda el username pelado | máx 30; pegar URL/@ lo normaliza |
| `CityAutocomplete` | Autocompletado y campo derivado automático (departamento/provincia/región); texto libre permitido | — |
| `ProductCombobox` | Buscar/elegir entidad de catálogo (y crear desde ahí) | máx N resultados; placeholder claro |
| `RangoFechas` | Desde/hasta con atajos (hoy, ayer, semana, mes) | — |
| `SelectorMedioPago` + `DisplayMedioPago` | Elegir medio (catálogo) / mostrarlo | Etiquetas canónicas en un solo mapa |
| `NumericKeypad` | Teclado numérico grande (POS/cobros) | — |
| `SerialUnitPicker` / `SerialField` | Elegir unidades serializadas / capturar un serial | 1 unidad = 1 fila; normaliza serial |
| `ColorVariantSelector` | Variante/color de un producto | — |
| `AccountFields` | Cuenta + monto + cotización | — |
| `ScannerInput` (cámara) | Escaneo de código/IMEI | Normaliza lo escaneado |

## 4. Reglas por tipo de dato

1. **Solo dígitos** (cantidades, días, umbrales, batería): limpieza `\D`, `inputMode="numeric"`, `maxLength` según dominio (PIN 4–6, batería 3).
2. **Porcentajes** (0–100 con decimales): `inputMode="decimal"`, un solo separador decimal (coma o punto según locale), hasta 2 decimales; guardar número; mostrar formateado (`0,2`).
3. **Moneda**: moneda base se escribe con separador de miles y se guarda numérica; monedas extranjeras con 2 decimales + cotización; el símbolo nunca va dentro del valor.
4. **Seriales/IMEI/códigos**: alfanumérico (no forzar dígitos), `autoCapitalize="characters"`; normalizar `trim`, sin prefijo interno, sin espacios ni guiones, mayúsculas; admitir varios separados por coma o salto de línea.
5. **Teléfono**: ver `PhoneField`. Validación local por país (ej. móvil de 9 dígitos) y 6–12 dígitos para el resto; guardar `countryCode` + `phone` (o `+<código> <número>` cuando el modelo es un solo string); links de mensajería con el teléfono normalizado sin signos.
6. **Correo**: `EmailField`; `autoComplete="email"`; máx 200.
7. **Usuario social**: ver `SocialUserField` (sin `@` en el dato guardado).
8. **Ciudad/región**: `CityAutocomplete` con campo derivado automático.
9. **Texto libre**: límites explícitos (nombres 120, direcciones 400, notas 2000), fechas `type="date"`, códigos con `pattern` (`[A-Za-z0-9_-]{2,40}`).
10. **PIN/contraseña**: PIN siempre `PinInput`; contraseña `PasswordInput` (8–72).
11. **Adjuntos**: tipos permitidos (JPG/PNG/WebP/PDF), tamaño máximo (ej. 5 MiB) validado **en cliente y servidor**, y verificación de *magic bytes* en el servidor; subida multipart.
12. **Documento fiscal** (RUC/CI/NIT): patrón configurable por país; si hay consulta externa, aplicar la razón social solo con confirmación.
13. **Búsquedas**: campo libre con `q`; en escaneos, normalizar a mayúsculas sin separadores.

## 5. Utilidades esperadas (puras y testeables)

- `digitsOnly(value)`, `phoneValid(value, countryCode)`, `internationalPhone(phone, countryCode)`, `phoneMessage`.
- `formatMoney(value, currency)`, `formatMoneyInput`, `parseMoneyInput`, `formatPercent`, `parsePercent`.
- `normalizeSerial(value)` (trim, sin prefijo, sin separadores, mayúsculas).
- `normalizeSocialUser(value)` y `normalizeEmailDomainSuggestion(value)`.
- Strings de error centralizados (un solo mensaje por regla).

## 6. Convenciones de interacción y accesibilidad

- El `inputMode` correcto por tipo (`numeric`, `decimal`, `tel`, `email`); en móvil `autoCapitalize`/`autoCorrect` según dato.
- Autofill real: `autoComplete="email|tel|new-password|one-time-code"`.
- Sugerencias/autocompletado: **no** abrir con pegado ni autofill; cerrar con `Escape`/blur; `Enter` acepta la sugerencia y no envía el formulario si el desplegable está abierto.
- Etiquetas asociadas (`htmlFor`), errores con `role="alert"` y `aria-describedby`, y estados `aria-invalid`.
- Un solo mensaje de error por regla, en el idioma del producto.

## 7. Testing mínimo

- **Unitarios**: cada validador/normalizador (`parsePercent('0,2') → 0.2`, `internationalPhone`, `normalizeSerial`).
- **E2E**: login/checkout con `fill()` + submit (los campos con sugerencias no deben interceptar clics ni bloquear el envío); adjuntos con archivo grande → error claro; PIN con 4 dígitos.
- Checklist de PR: ¿usa el componente compartido? ¿respeta defaults (país/moneda/decimales)? ¿el backend revalida? ¿tests verdes?
