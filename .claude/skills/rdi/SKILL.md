---
name: rdi
description: "Reglas de inputs y textfields de MobOS. Trigger: rdi, regla de inputs, textfields, campos de formulario, qué campo usar, validación de teléfono/correo/ciudad/IMEI, crear un input nuevo."
license: Apache-2.0
metadata:
  author: mobos
  version: "1.0"
---

## Cuándo se usa

Cuando Dario (o cualquier agente) diga **rdi**, «regla de inputs», «textfields», o pida crear/tocar un campo de formulario en MobOS.

## Qué hacer

1. Leer `docs/CAMPOS.md` (fuente única de reglas) y aplicarlo tal cual.
2. Antes de escribir un `Input` a mano, buscar el componente compartido que ya cubre el caso: `PhoneField`, `EmailField`, `InstagramField`, `CityAutocomplete`, `MoneyInput`, `PinInput`, `PasswordInput`, `ProductCombobox`, `SerialUnitPicker`, `NumericKeypad`, `SelectorMedioPago`, `PaymentAccountFields`.
3. Si el caso no existe todavía: crear el componente en `src/components/shared/` siguiendo las reglas y adoptarlo en TODOS los lugares donde ya se escribe ese dato a mano (no dejar copias).
4. Mantener `docs/CAMPOS.md` actualizado en el mismo cambio cuando la regla nueva lo amerite.

## Reglas mínimas para no equivocarse

- Dinero → `MoneyInput`/`Money`; nunca formatear a mano.
- Teléfono → `PhoneField` (código editable default +595, número con espacios tras el código).
- Correo → `EmailField` (con sugerencia de dominio, sin romper pegado ni `fill()` de tests).
- Instagram → `InstagramField` (`@` fijo, sin espacios, se guarda sin `@`).
- Ciudad → `CityAutocomplete` (departamento automático).
- IMEI/serial → mayúsculas, sin espacios ni guiones, sin prefijo `MOBOS:`.
- PIN → `PinInput`; contraseña → `PasswordInput`; dígitos puros → `inputMode="numeric"` + limpieza `\D`.
- Adjuntos → JPG/PNG/WebP/PDF ≤5 MiB.

## Verificación antes de cerrar

`npm run lint` · `npm run build` · `npm test` · `npx playwright test` (los campos de login y checkout están cubiertos por e2e: no romper `fill()`).
