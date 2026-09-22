# QA #228/#235/#232/#148 §14 — Verificación post-deploy v1.0.141

Dominio PLT verificado en producción (`https://app.moboss.online`, demo anónima),
versión observada **v1.0.141**, con capturas y **0 llamadas al API real**.

- **Verificador reutilizable:** `scripts/qa-228-235-232-produccion.mjs`
  (`QA_BASE_URL` cambia la base; `QA_OUT` dónde deja la evidencia).
- **Corrida:** **7/7 pasos OK · 0 fallos** · `docs/qa/228-235-produccion/`
  (`resultados.json` + 5 capturas).

| Paso | Resultado | Captura |
| --- | --- | --- |
| #235: la entrada `/demo` no duplica la guía, muestra el PIN y las descripciones cortas | ✅ | `01-demo-entrada` |
| Demo: el PIN 3001 abre el perfil Dueño (flujo intacto) | ✅ | `02-demo-dentro` |
| #228: menú de tres puntos con 5 accesos de uso, sin destructivos ni duplicados | ✅ | `03-menu` |
| #228: Preferencias en Configuración → Sistema (bloqueo y notificaciones; sin tema duplicado) | ✅ | `04-preferencias` |
| #148 §14: el aviso abre el panel de notificaciones | ✅ (demo: estado honesto sin datos reales) | `05-notificaciones` |
| #232: auditoría de higiene de logs (`npm run audit:logs`) | ✅ 1027 archivos, sin volcados | — |
| Demo: 0 llamadas al API real en todo el recorrido | ✅ | — |

## Qué quedó cerrado

- **#228** (menú): en producción el menú rápido tiene solo Configuración, Caja,
  Análisis, Clientes y Bloquear pantalla; Preferencias vive en Configuración →
  Sistema y la eliminación de la empresa en Configuración → Seguridad con
  reautenticación + palabra ELIMINAR (verificado también en el e2e admin).
- **#235** (entrada demo): PIN siempre visible, sin guía duplicada y
  descripciones cortas, con el flujo de entrada intacto.
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
- **Modo taller (#240):** se prepara cuando INV entregue el checklist
  (coordinación en curso, no bloquea este cierre).

## Cómo repetir

```bash
node scripts/qa-228-235-232-produccion.mjs

# Con datos reales (sesión con notificaciones)
npx playwright test e2e/notificaciones.spec.js --project=admin
```
