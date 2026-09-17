# Campos y textfields de MobOS

Reglas vigentes para los campos del panel. Antes de crear un input nuevo, usá el componente compartido que ya cubre el caso.

## Componentes compartidos
- `PhoneField` (`src/components/shared/PhoneField.jsx`): código de país editable (default `+595`, presets en datalist) + número que admite dígitos, espacios, guiones y paréntesis (espacio tras el código permitido: `+595  99467453`). Valida con `telefonoValido` y muestra `MENSAJE_TELEFONO`. Exporta `parseTelefono`/`componerTelefono` para el formato único `+<código> <número>`.
- `EmailField`: sugiere dominios frecuentes (gmail, hotmail, outlook, yahoo, icloud, live) mientras se escribe; no interfiere con pegado.
- `InstagramField`: `@` fijo no borrable, sin espacios, solo `[A-Za-z0-9._]`, máx 30; guarda el username pelado.
- `CityAutocomplete`: ciudad con autocompletado y departamento automático; texto libre permitido.
- `MoneyInput` / `Money` (`src/components/ui`): importes PYG con separador de miles; USD/BRL/EUR/USDT con 2 decimales; el símbolo lo dibuja el campo.
- `PinInput`, `PasswordInput`, `NumericKeypad`, `CameraScan`, `SerialUnitPicker`, `SelectorColor`, `PaymentAccountFields`.
- Base: `Input`, `Textarea`, `Select`, `Label`, `FormField`.

## Reglas por tipo de dato
1. **Solo dígitos**: limpiar con `.replace(/\D/g, '')` o `soloDigitos`; `inputMode="numeric"`; `maxLength` cuando aplica (PIN 4, batería 3). Campos: batería, días/plazos, cantidades, umbral, horas de reserva, PINs.
2. **Porcentajes**: `inputMode="decimal"` y limpieza `[^\d.,]` (seguro, comisión, descuento por medio, cotización).
3. **Moneda**: PYG se guarda numérico y se escribe con separador de miles (`MoneyInput`); monedas extranjeras con 2 decimales.
4. **IMEI/serial**: alfanumérico, `autoCapitalize="characters"`; al guardar/buscar se normaliza `trim`, sin `MOBOS:`, sin espacios ni guiones, mayúsculas (`normalizeScan`); varios separados por coma o salto de línea.
5. **Teléfono**: ver `PhoneField`. Validación: Paraguay móvil `9` + 8 dígitos; otros países 6–12 dígitos. Clientes guardan `countryCode` + `phone`; sucursales y proveedores guardan `+<código> <número>`; los links wa.me usan `internationalPhone`.
6. **Correo**: `EmailField` con sugerencias; `type="email"`, `autoComplete="email"`, máx 200.
7. **Instagram**: ver `InstagramField`.
8. **Ciudad**: ver `CityAutocomplete`.
9. **Texto libre**: nombres 120, direcciones 400, notas 2000; correo 200; fechas `type="date"`; códigos con `pattern` (ej. promociones `[A-Za-z0-9_-]{2,40}`).
10. **PIN/contraseña**: PIN siempre `PinInput` (4 dígitos, numérico, one-time-code); contraseña `PasswordInput` (8–72, toggle de visibilidad).

## Dónde viven
- `src/utils/telefono.js`: dígitos, teléfono internacional, validación y mensaje.
- `src/utils/moneda.js`: formato y parseo de importes.
- `src/components/ui/index.jsx`: kit base y campos (MoneyInput, Money, PinInput, PasswordInput).
- `src/components/shared/`: PhoneField, EmailField, InstagramField, CityAutocomplete, NumericKeypad, CameraScan.

## Cobertura
`npm test` (unitarios) y `npx playwright test` (e2e: batería, teléfono, límite de crédito, checkout, paneles).
