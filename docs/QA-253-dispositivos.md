# QA · Grupo Dispositivos (#253)

Reorganización de la pantalla **Dispositivos** (`/configuracion/dispositivos`) en
secciones y separación clara entre **configurar/probar** (Dispositivos) y
**monitorear** (Sistema · Estado del sistema), sin duplicar controles.
Capturas antes/después en `docs/qa/253-dispositivos/`.

## Qué cambió

- Navegación interna con URL (`?panel=`), sin pestañas nuevas en Configuración:
  **Impresoras** · **Puentes** · **Formatos** · **Diagnóstico** ·
  **Cola e historial** (`data-testid="paneles-impresion"`).
- **Puentes** dejó de ser un modal suelto: la gestión (crear/revincular,
  sucursal, código de un solo uso, revocar) y **Equipos con acceso** viven en su
  sección; «Gestionar puentes» navega ahí.
- **Diagnóstico** concentra el estado local (agente, predeterminada, equipo),
  red (reparar/exportar), **Cobertura por sucursal** y las métricas del Panel de
  impresiones. La tarjeta «Cola» que estaba mezclada salió: la cola local y el
  historial van a **Cola e historial**.
- **Impresoras vs Estado del sistema**: Diagnóstico y Cola enlazan al monitoreo
  global; Estado del sistema aclara que **solo monitorea** y enlaza a
  Dispositivos para configurar. Los fallos de impresión enlazan a
  `?panel=cola`.
- Deep links intactos: `/configuracion/dispositivos` es la entrada de la sección
  (el slug viejo `impresoras` redirige) y el `?panel=` sobrevive al refresh.

## Verificación

| Caso | Resultado |
| --- | --- |
| `e2e/configuracion-lote5.spec.js` | **8/8 ✓** (nuevo: «Dispositivos ordena sus secciones sin duplicar el monitoreo de Sistema»; los grupos siguen separando Dispositivos/Sistema) |
| `e2e/impresion-remota.spec.js` | **27/27 ✓** (puentes secciones, confirmación en papel en Cola e historial, cobertura en Diagnóstico, cola global en Estado del sistema) |
| `npm run test:e2e:smoke` | 19/19 ✓, 0 flaky |
| `npm run lint` | 0 errores |
| `npm test` / `backend test:unit` | 735 ✓ / 75 ✓ |
| Builds FE/BE + `prisma:validate` | ✓ con `BUILD_ID` |
| Shards (`--check`) | ✓ |

Comando usado (puertos aislados del worktree MOS-PRN):

```
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-PRN MOBOS_E2E_PGPORT=5527 \
MOBOS_E2E_API_PORT=3127 MOBOS_E2E_WEB_PORT=5237 \
npx playwright test e2e/configuracion-lote5.spec.js e2e/impresion-remota.spec.js
```

## Capturas

`docs/qa/253-dispositivos/`: `antes-impresoras.png` y `antes-sistema.png` (main
previo) vs `despues-impresoras.png`, `despues-puentes.png`,
`despues-formatos.png`, `despues-diagnostico.png`, `despues-cola.png` y
`despues-sistema.png`. Se tomaron con el arnés real (admin) y dos impresoras +
un puente de ejemplo.
