# QA #228/#235/#232/#148 §14/#240 §4/#241 — Verificación post-deploy v1.0.143

Dominio PLT verificado en producción (`https://app.moboss.online`, demo anónima),
versión observada **v1.0.143**, con capturas y **0 llamadas al API real**.

- **Verificador reutilizable:** `scripts/qa-228-235-232-produccion.mjs`
  (`QA_BASE_URL` cambia la base; `QA_OUT` dónde deja la evidencia).
- **Corrida:** **10/10 pasos OK · 0 fallos · 0 errores de consola** ·
  `docs/qa/228-235-produccion/` (`resultados.json` + 9 capturas).

| Paso | Resultado | Captura |
| --- | --- | --- |
| #235: la entrada `/demo` no duplica la guía, muestra el PIN y las descripciones cortas | ✅ | `01-demo-entrada` |
| Demo: el PIN 3001 abre el perfil Dueño (flujo intacto) | ✅ | `02-demo-dentro` |
| #228: menú de tres puntos con 5 accesos de uso, sin destructivos ni duplicados | ✅ | `03-menu` |
| #228: Preferencias en Configuración → Sistema (bloqueo y notificaciones; sin tema duplicado) | ✅ | `04-preferencias` |
| #148 §14: el aviso abre el panel de notificaciones | ✅ (demo: estado honesto sin datos reales) | `05-notificaciones` |
| **#240 §4: modo taller/rack** (carriles, estaciones, filtros, stepper y acciones en serie) | ✅ | `06-rack-taller` |
| **#240 §4: impresión en serie** (alcances por estación/filtro + hoja de estación; aviso honesto en la demo) | ✅ | `07-rack-impresion-serie`, `08-rack-impresion-demo` |
| **#241: F3 apagada** (`/ops` y `/ops-preview` sin flag vuelven a la app, sin tablero) | ✅ | `09-ops-apagada` |
| #232: auditoría de higiene de logs (`npm run audit:logs`) | ✅ 1148 archivos, sin volcados | — |
| Demo: 0 llamadas al API real en todo el recorrido | ✅ | — |

## Qué quedó cerrado

- **#228** (menú): en producción el menú rápido tiene solo Configuración, Caja,
  Análisis, Clientes y Bloquear pantalla; Preferencias vive en Configuración →
  Sistema y la eliminación de la empresa en Configuración → Seguridad con
  reautenticación + palabra ELIMINAR (verificado también en el e2e admin).
- **#235** (entrada demo): PIN siempre visible, sin guía duplicada y
  descripciones cortas, con el flujo de entrada intacto.
- **#240 §4** (taller): en producción el rack agrupa por estaciones (con conteos),
  filtra por IMEI/modelo y ubicación, marca el **paso de cada unidad**
  (por verificar → verificado → listo) y permite verificar e **imprimir en serie**
  con alcance (selección, estación o todo lo filtrado) + **hoja de estación**.
  Los chips de grado/batería usan los componentes compartidos
  (`GradoBadge`, `MedidorBateria`) sobre `unit.inspection` cuando hay inspección.
- **#241** (infra F3): las rutas del rediseño están desplegadas pero **apagadas**:
  `/ops` solo responde con `VITE_OPS_V2=1` y `/ops-preview` en desarrollo o con
  `VITE_OPS_PREVIEW=1`; en producción ambas vuelven a la app (sin tablero, sin
  entrada en el menú). El paquete de aprobación vive en
  `docs/rediseno/PILOTO-241-F3-OPS.md`.
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
- **F3 (tablero ops):** apagada por diseño; para verla hace falta
  `VITE_OPS_V2=1` y la **aprobación del piloto** (el preview local se abre con
  `npm run dev` → `/ops-preview`, o con `VITE_OPS_PREVIEW=1`).
- **Impresión real (etiquetas/hoja A4):** la demo la bloquea con un aviso; la
  cobertura local está en el e2e admin y en `src/lib/printing/hojaEstacion.test.js`.

## Cómo repetir

```bash
node scripts/qa-228-235-232-produccion.mjs

# Con datos reales (sesión con notificaciones)
npx playwright test e2e/notificaciones.spec.js --project=admin
```
