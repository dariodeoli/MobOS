# Plan de rollout F3/F4 · rediseño PhoneCheck (#241)

Para aprobar y arrancar sin fricción. **F3** = shell + tablero + modo taller (lo
que se ve como consola). **F4** = el resto de la app por lotes. Cada paso se
entrega con **QA antes/después** (claro/oscuro + mobile), **sin cambios de
función** y con smoke e2e en verde.

## F3 — shell, tablero y taller (el corazón del rumbo)

| # | Paso | Qué cambia | Esfuerzo | Depende de |
|---|---|---|---|---|
| 1 | **Tokens v2 a la biblioteca** | `.v2-piloto` pasa a tokens globales (base #0E1116/#1F2430, pass #22C55E, azul #4D7CFE) y se retira el scope; se ajusta el claro para AA | S (1-2 d) | CMP |
| 2 | **Shell** | barra lateral + superior con tokens v2, estados de navegación y densidad; nada de lógica | M (2-3 d) | 1 |
| 3 | **Tablero operativo** | KPIs grandes, **tiles de equipo** en proceso, **chips de locks** (iCloud/MDM/blacklist), “x de y” del checklist y **stepper del lote** | M (2-3 d) | 1, INV (3) |
| 4 | **Modo taller / rack** | lista de equipos en proceso con estados (por verificar → verificado → listo) y acciones en serie (verificar, imprimir etiqueta) | L (4-6 d) | 3, INV, PRN |
| 5 | **Carrito POS completo** | extender v2 al bloque de cobro y a los modales de venta | S (1 d) | 1, POS |
| 6 | **Ficha de unidad completa** | checklist persistido + **grado oficial** + chips de locks reales con fuente/hora | S/M (2 d) | INV (persistencia y grado) |

## F4 — el resto de la app (por lotes, mismo criterio)

| Lote | Pantallas | Qué cambia | Esfuerzo |
|---|---|---|---|
| A | Resumen/Análisis/Ganancias | tokens + números grandes + tiles de KPI | M (2-3 d) |
| B | Clientes y CRM | tokens + filas/chips + tiles de cliente | M (2-3 d) |
| C | Inventario y Compras | tokens + tiles de equipo + chips de estado | M (2-3 d) |
| D | Finanzas (Caja, Conciliación, Cuentas) | tokens + números grandes + chips de estado | M (2-3 d) |
| E | Servicio técnico y Garantías | tokens + stepper del servicio + chips | S/M (2 d) |
| F | Configuración y Equipo | tokens + tiles de rol/acceso | S (1-2 d) |
| G | Públicas (landing, portal, pedido, informe del dispositivo) | tokens + chips + QR/impresión coherente | M (2-3 d) |
| H | Prints (PRN) | informe del dispositivo y etiquetas con los tokens v2 | M (2 d) |

## Orden recomendado y criterio

1. Tokens (1) y shell (2) — habilitan todo lo demás y son reversibles con el scope.
2. Tablero (3) + carrito (5) — lo que Dario ya vio aprobado en el piloto.
3. Taller (4) y ficha (6) — el corazón operativo del estilo PhoneCheck.
4. F4 de a un lote por semana, empezando por A/B (lo más visto).

**Aceptación de cada paso**: capturas antes/después en `docs/rediseno/` (claro/oscuro y mobile), contraste AA en ambos temas, sin scroll horizontal, `npm test` y smoke e2e en verde, y cero cambios de lógica.

**Riesgos a manejar**: (a) la paleta clara del v2 puede no cumplir AA — se ajusta en el paso 1 antes de promover; (b) el shell toca todas las pantallas — se hace con el scope reversible y QA por tema.

**Estimación total**: F3 ~2 semanas · F4 ~2-3 semanas por lotes.

## Qué se pide aprobar

1. El **orden** (tokens → shell → tablero/carrito → taller/ficha → lotes F4).
2. El **alcance de F3** incluyendo el modo taller/rack.
3. El **criterio de QA** (antes/después + AA + smoke por paso).
