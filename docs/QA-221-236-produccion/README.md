# Cierre de #221/#236 y portal — verificación en producción (v1.0.144, 23/9/2026)

Re-verificación con los scripts reusables contra la demo pública, como parte
del cierre de **#221** y **#236** (ambos ya cerrados en GitHub con la evidencia
del integrador) y del estado del **portal del cliente**.

| Corrida | Script | Resultado | Evidencia |
|---|---|---|---|
| #221 — demo Clientes/POS/portal | `scripts/qa-221-clientes-produccion.mjs` | **8/8**, 0 llamadas al API | `221-clientes/` (9 capturas + `resultados.json`) |
| #236 — lista estilo Pedidos, ojito, detalle | `scripts/qa-236-clientes-demo.mjs` | **6/6**, sin llamadas al API | `236-clientes/` (5 capturas + `resultados.json`) |
| Portal del cliente (#240 ítem 3) | `scripts/qa-240-informe-portal-demo.mjs` (versión de `main`) | **4/4**, sin llamadas al API | `portal/` (3 capturas + `resultados.json`) |
| Portal en el subdominio (#74) | `curl` contra `clientes.moboss.online` + API | 200, CORS del origen del portal y 404 sin enumeración | `verificacion-portal.txt` |

```bash
MOBOS_QA_OUT=docs/QA-221-236-produccion/221-clientes  node scripts/qa-221-clientes-produccion.mjs
MOBOS_QA_OUT=docs/QA-221-236-produccion/236-clientes  node scripts/qa-236-clientes-demo.mjs
# Portal con la versión publicada en main: el paso nuevo de visto/no visto aún
# no está desplegado (viaja en slot/clientes); se corre post-deploy.
MOBOS_QA_OUT=docs/QA-221-236-produccion/portal      node scripts/qa-240-informe-portal-demo.mjs
```

## Lectura

- Los tres scripts sellan la versión desplegada (**v1.0.144**) y fallan si la
  demo consulta el API real: la demo sigue siendo 100 % local.
- **Portal real (#74)**: el subdominio responde 200 y el API habilita su origen
  (`access-control-allow-origin: https://clientes.moboss.online`, con
  preflight 204 y `credentials: true`), así que una cuenta real puede cargar
  saldo, pedidos, informes y —desde esta rama— el taller desde el portal.
- **#221/#236 cerrados**: sus superficies siguen verdes en producción; el
  incremento de visto/no visto del informe (`slot/clientes`) se verificará en
  el release que lo incluya (`docs/QA-240-informe-visto.md`).
