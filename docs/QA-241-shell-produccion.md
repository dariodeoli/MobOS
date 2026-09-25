# #241 · AA del shell v2 en producción

Verificación de contraste del chrome del shell v2 contra el host real
(`app.moboss.online`), con el mismo auditor de `e2e/dsn-241-a11y.spec.js`
(`e2e/helpers/contraste.js`). Se entra por la **demo pública** para no depender
de credenciales y se miden los textos del shell (barra lateral, topbar, barra
inferior, cajón de acciones y pie) en claro/oscuro, desktop (1280) y mobile
(390), con el menú abierto incluido. El contenido de cada pantalla queda como
contexto informativo.

```bash
node scripts/qa-241-shell-produccion.mjs
# QA_BASE_URL=https://app.moboss.online   QA_OUT=docs/qa/241-shell-produccion
```

Sale con código 1 si el shell baja de AA (4.5:1; 3:1 en texto grande); el mismo
criterio que la medición local. Evidencia: capturas `.jpg` por estado y
`resultado.json` con la versión publicada.

## Resultado

| Fecha | Versión | Estados | Textos medidos | Bajos de AA |
|---|---|---|---|---|
| 25/09/2026 | **v1.0.172** | 6 (claro/oscuro × desktop/mobile, + menú abierto) | 16–61 por estado | **0** |

Sin hallazgos: el shell v2 cumple AA en producción, igual que en local. La
medición local queda como gate en `e2e/dsn-241-a11y.spec.js`.
