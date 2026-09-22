# Tokens v2 en Finanzas — QA visual (montos, fechas y tablas)

- **Contexto:** #241 **F1 — Sistema v2** (tokens + objetos base, dirección DSN).
  El rediseño cambia tipografía, superficies y colores; Finanzas es la zona más
  densa en montos, fechas y tablas, así que necesita una guarda propia.
- **Sonda:** `scripts/qa-finanzas-tokens-v2.mjs` (re-ejecutable, sobre la demo
  pública; también acepta `QA_BASE_URL` local).
- **Qué mide por pantalla** (`/resumen`, `/analisis/ganancias`, `/finanzas/caja`,
  `/finanzas/conciliacion`, `/finanzas/gastos`, `/finanzas/bancos` + móvil 390 px
  en caja y gastos):
  - **Desborde de página** (nada se sale del ancho, en 1440 y en 390).
  - **Montos**: formato intacto (`Gs`/`US$` con dígitos), sin recortes
    (`scrollWidth` vs `clientWidth`) y **contraste AA** (los controles
    deshabilitados quedan exentos, como marca WCAG).
  - **Fechas**: formato compacto (`22-sept.`, con hora cuando corresponde), sin
    recortes.
  - **Tablas**: sin columnas ocultas en 1440 (en 390 se permite scroll interno
    del contenedor, nunca de la página).
  - **Alineación numérica**: lista los montos sin `tabular-nums` como aviso
    (no rompe, pero es la regla de la biblioteca).
  - Capturas por pantalla en `docs/qa/tokens-v2-finanzas/<versión>/`.

## Línea base v1.0.141 (antes de los tokens v2)

**8/8 verificaciones OK** · capturas en `docs/qa/tokens-v2-finanzas/1.0.141/`.

Avisos de alineación para seguir en la v2 (montos sin `tabular-nums`, no es
rotura):

| Pantalla | Montos sin `tabular-nums` |
| --- | --- |
| Resumen | 6 (valores de las tarjetas de métricas) |
| Ganancias | 2 (resultado y su eco) |
| Conciliación | 2 (`Gs 0` de filas) |
| Caja / Gastos / Bancos | — |

Sin desbordes de página, sin recortes de montos ni fechas, sin columnas ocultas
y contraste AA correcto en los montos habilitados.

## Post-v1.0.142 (tokens v2)

Pendiente de deploy al escribir este informe: la corrida se hace apenas se
publique **.142** y el resultado se agrega acá (misma sonda, con
`QA_VERSION=1.0.142`). Si algo se rompe, el detalle indica pantalla, elemento y
medida exacta.

Reproducir:

```bash
QA_VERSION=1.0.142 QA_BASE_URL=https://app.moboss.online \
  node scripts/qa-finanzas-tokens-v2.mjs
```
