# #215/#241 · Tablero por etapas de Servicio y Garantías

Vista pipeline del dominio: las órdenes del taller y las garantías se leen como
tablero, con las **etapas existentes** (no agrupa ni inventa estados), contador
por etapa, tarjetas con cliente/equipo/IMEI y el avance de etapa en la propia
tarjeta. Vive como pestaña **Tablero** de la pantalla unificada
(Servicio y Garantías), junto a Todo, Servicio y Garantías.

## Qué cambió

| Pieza | Cambio |
|---|---|
| **Tablero** (`TableroServicioGarantias.jsx`, nuevo) | Columnas por etapa con contador, tarjetas (código, cliente, equipo, IMEI) y botón de avance. Filtros: tipo (Órdenes/Garantías) y búsqueda por cliente, equipo o IMEI. La más vieja espera primero. |
| **Etapas** | Órdenes: `RECIBIDO → DIAGNOSTICO → CON_TECNICO → ESPERANDO_REPUESTO → REPARADO → LISTO → ENTREGADO` + `CANCELADO`. Garantías: `RECEIVED → DIAGNOSIS → READY → DELIVERED`. |
| **Fuente única del avance** | `SIGUIENTE_SERVICIO` (`lib/estadosServicio.js`) y `SIGUIENTE_GARANTIA` (`lib/estadosPedido.js`): la tabla del taller y el tablero comparten el mismo mapa (antes vivía dentro de `ServicioTecnico`). |
| **Avance desde la tarjeta** | Usa el mismo camino que la tabla: demo → almacenamiento del navegador; real → `PATCH /api/service-orders` y `PATCH /api/warranties`. Con `procesandoId` para no duplicar el clic. |
| **Mobile sin scroll horizontal** | Hasta `lg` las etapas se apilan (una debajo de la otra); desde `lg` son columnas con desplazamiento contenido dentro del tablero. |
| **v2** | Tarjetas/columnas (`v2-tile`) y contadores (`v2-numero`) con los tokens; con el flag apagado el tablero funciona igual con el tema anterior. |

## QA

`e2e/qa-241-servicio-pipeline.spec.js` (proyecto admin, **6/6**):

- 4 corridas v2 (claro/oscuro × desktop/mobile): contadores por etapa **iguales**
  a las tarjetas de cada columna en los dos tableros, **avance real** (la orden
  de `RECIBIDO` pasa a `DIAGNOSTICO` y su contador sube), **0 textos bajo AA** en
  el contenido del tablero y **sin scroll horizontal de página**.
- 2 corridas con el flag v2 apagado (claro, desktop/mobile): el tablero
  funciona igual y dejan la captura del tema anterior.

Capturas (16) en `docs/rediseno/`:

| Tablero | v2 | Tema anterior |
|---|---|---|
| Órdenes | `c241f4f-tablero-ordenes-{claro,oscuro}-{desktop,mobile}.png` | `c241f4f-tablero-ordenes-clasico-{desktop,mobile}.png` |
| Garantías | `c241f4f-tablero-garantias-{claro,oscuro}-{desktop,mobile}.png` | `c241f4f-tablero-garantias-clasico-{desktop,mobile}.png` |
| Avance | `c241f4f-tablero-avance-{claro,oscuro}-{desktop,mobile}.png` | — |

```bash
MOBOS_CAPTURAS=docs/rediseno \
  npx playwright test e2e/qa-241-servicio-pipeline.spec.js --project=admin
```

Unitarios: `lib/estadosServicio.test.js` y `lib/estadosPedido.test.js` fijan los
mapas de avance (incluidas las etapas terminales que no avanzan).

## Checks

`npm run lint` 0 errores · `npm test` **690 ✓** · backend `test:unit` **75 ✓** ·
builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · `test:e2e:smoke` **19/19** ✓ ·
spec del tablero **6/6** ✓ · spec del lote E **8/8** ✓ · shards **129/128/128** ✓ ·
sin cambios de schema.
