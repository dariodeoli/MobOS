# QA #187 · plataforma en producción (versión · PWA · CI)

Corrida: `node scripts/qa-187-plataforma-produccion.mjs` contra
`https://app.moboss.online` (demo pública, sin credenciales) · 27/09.

| Paso | Resultado |
| --- | --- |
| **Versión publicada** | ✅ `v1.0.190` — coincide con `version.json` del repo |
| **Manifest de la PWA** | ✅ `name`/`short_name`, `display: standalone`, **3 íconos** (svg/192/512) con HTTP 200 |
| **Service worker** | ✅ `sw.js` servido; caché `mobos-shell-v4` + `mobos-api-v1`; 1 registro **activated** y página **controlada** |
| **Shell offline** | ✅ **8 archivos precacheados** (`/`, `/index.html`, manifest, íconos, logos) y la **recarga sin red se sirvió desde la caché** |
| **CI en `main`** | ⚠️ racha **0/3** — última roja `36285527914` (`9d81687` · v1.0.190) |

## Hallazgos

1. **CI en 0/3** (hallazgo, no bloqueante de producción): las dos últimas
   corridas completas de `main` son rojas. Causas ya analizadas y **corregidas en
   `slot/plataforma`** (página pública sin sesión en `qa-148-16-menciones`; IMEI
   con alta entropía en `informe-dispositivo`), pendientes de integrar/publicar.
   La verificación local de la rama con backend prod quedó **513/531** con los
   rojos clasificados en `docs/qa/245-ci/REPORTE.md`.
2. **Sin problemas de PWA/versión**: manifest completo, íconos servidos, SW con
   versión de caché propia, `clients.claim()` y precache íntegro; la versión
   publicada coincide con la del repo y el shell arranca desde la caché sin red.
3. Nota de herramienta: la recarga offline se emula con `context.setOffline`;
   con service workers puede no enrutar por el SW (en esta corrida **sí** la
   sirvió la caché). Queda como paso informativo — el invariante que se exige es
   *control + precache completo*.

Evidencia: `01-shell-demo.jpg`, `02-shell-precache.jpg`, `03-demo-online.jpg` y
`resultados.json` en esta carpeta.
