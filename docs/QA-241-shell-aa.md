# #241 · Cierre de AA/contraste del shell v2

Medición **medida, no estimada** del chrome del shell v2 (barra lateral, topbar,
barra inferior, cajón de acciones, avisos y pie) con el auditor de
`e2e/helpers/contraste.js` (compone alfas sobre el fondo real y exige 4.5:1;
3:1 en texto grande). El contenido de cada pantalla se informa aparte.

| Ámbito | Cómo | Estados | Resultado |
|---|---|---|---|
| **Local** (gate) | `npx playwright test e2e/dsn-241-a11y.spec.js --project=admin` | 4 shell (claro/oscuro × desktop/mobile) + cajón abierto + banner sin conexión + pantalla oscura del pilotaje + switch default/opt-out + paleta de la biblioteca | **8/8 · 0 bajos** |
| **Producción** | `node scripts/qa-241-shell-produccion.mjs` | 6 (claro/oscuro × desktop/mobile + cajón) contra `app.moboss.online` | **v1.0.175 · 0 bajos** |

- Capturas locales: `docs/qa/241-shell-aa/` (`c241f4-shell-aa-*`, incluido el
  par antes/después del opt-out).
- Capturas de producción y datos: `docs/qa/241-shell-produccion/`
  (`shell-{claro,oscuro}-{desktop,mobile}[-menu].jpg` + `resultado.json`).
- El hallazgo de contraste del tema claro (rótulos del hero verde, encabezados
  de tabla, verde vivo como texto, chip neutro en oscuro y tintes de chips)
  quedó corregido en los tokens v2 y se detalla en
  [`rediseno/F4-DOMINIOS.md`](rediseno/F4-DOMINIOS.md).

**Estado:** cerrado. El spec local corre en CI (proyecto `admin`) y el script de
producción sale con código 1 si el shell vuelve a bajar de AA.
