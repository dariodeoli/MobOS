---
name: rdi
description: "Reglas de inputs y textfields. Trigger: rdi, regla de inputs, textfields, campos de formulario, qué campo usar, validación de teléfono/correo/ciudad/IMEI, crear un input nuevo."
license: Apache-2.0
metadata:
  author: mobos
  version: "1.1"
---

## Cuándo se usa

Cuando Dario (o cualquier agente) diga **rdi**, «regla de inputs», «textfields», o pida crear/tocar un campo de formulario.

## Qué hacer

1. Leer el doc de reglas del proyecto — en MobOS es `docs/CAMPOS.md` (fuente única) — y aplicarlo tal cual.
2. Si el proyecto todavía no tiene ese doc, partir de la plantilla portable `docs/PLANTILLA-CAMPOS.md` y ajustar país/moneda base.
3. Antes de escribir un `Input` a mano, buscar el componente compartido que ya cubre el caso: `PhoneField`, `EmailField`, `InstagramField`/`SocialUserField`, `CityAutocomplete`, `MoneyInput`, `PercentField`, `PinInput`, `PasswordInput`, `ProductCombobox`, `SerialField`/`SerialUnitPicker`, `NumericKeypad`, `SelectorMedioPago`, `PaymentAccountFields`, `CurrencySelect`, `AttachmentInput`.
4. Si el caso no existe todavía: crear el componente en `src/components/shared/` siguiendo las reglas y adoptarlo en TODOS los lugares donde ya se escribe ese dato a mano (no dejar copias).
5. Mantener el doc de reglas actualizado en el mismo cambio cuando la regla nueva lo amerite.

## Reglas mínimas para no equivocarse

- Dinero → `MoneyInput`/`Money`; nunca formatear a mano.
- Teléfono → `PhoneField` (código editable, número con espacios tras el código).
- Correo → `EmailField` (sugerencia de dominio sin romper pegado ni `fill()` de tests).
- Instagram/usuario → prefijo `@` fijo, sin espacios, se guarda sin `@`.
- Ciudad → autocompletado con campo derivado (departamento/provincia).
- IMEI/serial → mayúsculas, sin espacios ni guiones, sin prefijo interno.
- Porcentajes → `PercentField` (coma decimal, 0–100 con hasta 2 decimales).
- PIN → `PinInput`; contraseña → `PasswordInput`; dígitos puros → `inputMode="numeric"` + limpieza `\D`.
- Adjuntos → JPG/PNG/WebP/PDF ≤5 MiB, validado en cliente y servidor.
- Nunca crear un input nuevo si la app ya tiene el componente.

## Verificación antes de cerrar

`npm run lint` · `npm run build` · `npm test` · `npx playwright test` (los campos de login y checkout están cubiertos por e2e: no romper `fill()`).
