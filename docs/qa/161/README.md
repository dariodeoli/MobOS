# QA #161 — Caja registradora y auditoría de efectivo (verificación de cierre)

- **Issue:** #161 (cerrada) · **Versión verificada:** producción v1.0.132.
- **Método:** demo público (solo lectura) + suite local (unit + integración + e2e).

## Criterios

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| Efectivo inicial y recibido por sesión, filtros, operaciones con vendedor/nota y marcas | ✅ | `e2e/finanzas-caja.spec.js` (audita el rango y cierra con diferencia) + capturas `caja.jpg` y `auditoria-efectivo.jpg` del demo |
| Marcado verificado/pendiente/con diferencia con observación | ✅ | En la captura se marca «Con diferencia» con observación y queda registrada; el servidor exige la nota (`backend/tests` de auditoría) |
| Auditar rango de fechas contra el comprobante | ✅ | `finanzas-caja.spec.js` recorre el rango y valida el cierre; la consistencia de `expectedPyg` (apertura + cobros + movimientos) está en el arnés de integración |
| Auditoría con usuario real | ✅ | El e2e corre con la sesión de administración y las marcas guardan el usuario (`verifiedById`/`auditedBy` en la API) |
| Checks + e2e smoke | ✅ | `lint` 0 · `npm test` 461/461 · `test:unit` 71/71 · arnés de integración HTTP completo en verde · e2e 30/30 · smoke 7/7 |

## Sonda re-ejecutable

```bash
node scripts/qa-finanzas-demo-produccion.mjs   # 6/6, capturas en docs/qa/144, 161 y 162
```

Capturas: `caja.jpg`, `auditoria-efectivo.jpg` · `resultados.json`.
