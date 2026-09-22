# QA #228/#235/#232/#148 §14/#240 §4 — Verificación post-deploy v1.0.142

Dominio PLT verificado en producción (`https://app.moboss.online`, demo anónima),
versión observada **v1.0.142**, con capturas y **0 llamadas al API real**.

- **Verificador reutilizable:** `scripts/qa-228-235-232-produccion.mjs`
  (`QA_BASE_URL` cambia la base; `QA_OUT` dónde deja la evidencia).
- **Corrida:** **8/8 pasos OK · 0 fallos · 0 errores de consola** ·
  `docs/qa/228-235-produccion/` (`resultados.json` + 6 capturas).

| Paso | Resultado | Captura |
| --- | --- | --- |
| #235: la entrada `/demo` no duplica la guía, muestra el PIN y las descripciones cortas | ✅ | `01-demo-entrada` |
| Demo: el PIN 3001 abre el perfil Dueño (flujo intacto) | ✅ | `02-demo-dentro` |
| #228: menú de tres puntos con 5 accesos de uso, sin destructivos ni duplicados | ✅ | `03-menu` |
| #228: Preferencias en Configuración → Sistema (bloqueo y notificaciones; sin tema duplicado) | ✅ | `04-preferencias` |
| #148 §14: el aviso abre el panel de notificaciones | ✅ (demo: estado honesto sin datos reales) | `05-notificaciones` |
| **#240 §4: modo taller/rack** (carriles, estaciones, filtros y acciones en serie) | ✅ | `06-rack-taller` |
| #232: auditoría de higiene de logs (`npm run audit:logs`) | ✅ 1109 archivos, sin volcados | — |
| Demo: 0 llamadas al API real en todo el recorrido | ✅ | — |

## Qué quedó cerrado

- **#228** (menú): en producción el menú rápido tiene solo Configuración, Caja,
  Análisis, Clientes y Bloquear pantalla; Preferencias vive en Configuración →
  Sistema y la eliminación de la empresa en Configuración → Seguridad con
  reautenticación + palabra ELIMINAR (verificado también en el e2e admin).
- **#235** (entrada demo): PIN siempre visible, sin guía duplicada y
  descripciones cortas, con el flujo de entrada intacto.
- **#240 §4** (taller): en producción el rack agrupa por estaciones (con conteos),
  filtra por IMEI/modelo y ubicación, y permite verificar/imprimir en serie
  (por selección y por carril). Los chips de grado/batería ya leen
  `unit.inspection` (INV en main) cuando hay inspección.
- **#232** (logs): auditoría del repo en verde y guarda en `npm test`
  (`src/lib/logsReglas.test.js`). Pasos de Coolify y rotación listos para Dario
  en `docs/SEGURIDAD-LOGS.md` y `docs/ROTACION-TOKENS.md`.
- **#148 §14** (notificaciones): el panel cubre pedidos nuevos/asignados,
  menciones, comentarios, aprobaciones y **tareas de taller** (asignadas y sin
  asignar para jefaturas); con datos reales se verifica en
  `e2e/notificaciones.spec.js` (2/2) porque la demo no comparte notificaciones.

## Pendientes (fuera del código)

- **Coolify (Dario):** restringir quién ve los logs de deploy y rotar lo
  expuesto — runbook en `docs/ROTACION-TOKENS.md` (día 1: IMEICHECK_TOKEN,
  sandbox AEX y tokens de deploy).
- **Taller v2 (impresión en serie con alcance + hoja de estación)**: en la rama
  `slot/plataforma`, pendiente de la próxima integración.
- **Ops preview F3 y flags** (`/ops-preview`, `VITE_OPS_V2`): rama
  `slot/plataforma`, sin activar hasta la aprobación del piloto.
- **Soporte de rotación** (`scripts/verificar-rotacion-tokens.mjs` y registro):
  rama `slot/plataforma`, pendiente de integración.

## Cómo repetir

```bash
node scripts/qa-228-235-232-produccion.mjs

# Con datos reales (sesión con notificaciones)
npx playwright test e2e/notificaciones.spec.js --project=admin
```
