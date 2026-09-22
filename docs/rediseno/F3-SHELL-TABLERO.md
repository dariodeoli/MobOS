# Propuesta F3 · Shell + tablero operativo estilo PhoneCheck (#241)

Mock de cómo se verían el **shell** y el **tablero** con los tokens v2 del
piloto, para aprobar el rumbo antes del rollout. **No es funcional**: no lee
inventario real, no guarda nada y está rotulado como mock en la propia pantalla.

- Ruta de la propuesta: **`/rediseno-f3`** (solo dueño, detrás de la sesión).
- Capturas: [mobile claro](c241f3-mobile-light.png) · [mobile oscuro](c241f3-mobile-dark.png) · [desktop claro](c241f3-desktop-light.png) · [desktop oscuro](c241f3-desktop-dark.png).

## Qué muestra

1. **Shell con tokens v2**: barra superior de consola (base `#0E1116`/`#1F2430`),
   verde pass, azul de acción y la etiqueta “Mock · no funcional”.
2. **KPIs grandes** (patrón número grande con `v2-numero`): en inspección,
   listos para vender y pass promedio.
3. **Stepper de workflow**: por verificar → verificado → listo para vender, con
   cantidades del lote.
4. **Tiles de equipo**: modelo + serial enmascarado en mono, **grado grande**
   (A/B/C con color), **chips de locks** (sin blacklist, iCloud off, MDM off,
   SIM libre), **batería con barra** y estado.

## Qué falta para el rollout de F3

1. **Biblioteca (CMP)**: promover los tokens v2 del scope `.v2-piloto` a los
   tokens globales y retirar el scope.
2. **Shell real**: aplicar los tokens al `AppShell` (hoy el mock solo los
   ilustra) y al menú lateral; revisar contraste AA en ambos temas.
3. **Tablero real**: reemplazar los datos ficticios por los del resumen
   (`armarResumenDia`/métricas) y conectar los chips de locks con la consulta
   de IMEI guardada (INV, #240).
4. **Stepper**: definir los estados reales por método de entrega (ya existen en
   pedidos) y si vive en el tablero o en el modo taller.
5. **Modo taller/rack** (idea 4 de la épica): lista de equipos en proceso con
   acciones en serie (verificar, imprimir etiqueta) — siguiente iteración.

## Qué se pide

- ¿El shell/tablero con esta estética es el rumbo para F3?
- ¿El stepper va en el tablero o se reserva para el modo taller?
- ¿Los chips de locks muestran “sin verificar” con acción para consultar (recomendado) o solo informan?

Checks del mock: lint 0 · build FE ✓ · QA 1/1 (390/1280, claro/oscuro, sin
scroll horizontal).
