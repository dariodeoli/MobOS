# F4 · rollout v2 por dominio (listo para aprobar, sin activar)

El v2 ya está implementado detrás del flag `preview v2` (shell + tablero +
inventario + ficha). **F4** es llevarlo al resto de la app por dominio, con el
mismo criterio del piloto: capturas antes/después, contraste AA, smoke y cero
cambios de lógica.

## Switch de activación (apagado hoy)

En `src/lib/temaV2.js`:

```js
export const TEMA_V2_POR_DEFECTO = false   // pasar a true al aprobar
```

- `false` (hoy): el v2 se ve **solo** en los dispositivos con la vista previa.
- `true` (al aprobar): el v2 queda **por defecto para todos**, y cada
  dispositivo puede salir con `localStorage['mobos:tema-v2'] = '0'`.
- La misma bandera gobierna shell, tablero y pantallas migradas: no hay builds
  ni ramas distintas.

## Orden por dominio

| Lote | Dominio | Qué cambia | Esfuerzo | Depende de |
|---|---|---|---|---|
| A | Resumen / Análisis | tokens + KPIs grandes + tiles de KPI | M | — |
| B | Clientes / CRM | filas y chips + tiles de cliente | M | — |
| C | Inventario / Compras | tiles de equipo + chips de estado (ya hay base) | S/M | A |
| D | Finanzas (Caja, Conciliación, Cuentas) | tokens + números grandes + chips | M | — |
| E | Servicio técnico / Garantías | tokens + stepper del servicio + chips | S/M | INV |
| F | Configuración / Equipo | tokens + tiles de rol/acceso | S | — |
| G | Públicas (landing, portal, pedido, informe) | tokens + chips + impresión coherente | M | PRN |
| H | Prints (etiquetas, informe) | tokens v2 en papel | M | PRN |

**Sugerido**: A + C primero (lo más visto y donde el piloto ya dejó base), luego
B, D y E, y al final F/G/H.

## Criterio de aceptación por lote

1. Capturas antes/después en `docs/rediseno/` (claro/oscuro y mobile).
2. Contraste AA en ambos temas (la medición automática del piloto sirve de base).
3. Sin scroll horizontal en 360/390/768/1440 y sin errores de runtime.
4. `npm test` + smoke e2e en verde y **cero cambios de lógica**.
5. Cada lote entra detrás del flag; el default se cambia **una sola vez** al
   final (o al aprobar cada lote, si Dario lo prefiere).

## Bloqueos actuales (declarados)

- Guarda de CMP `src/lib/objetosReglas.test.js:165` en rojo por el cambio de
  clases de la vista previa (`npm test` 579/580): se ajusta antes de arrancar F4.
- Carrito POS: vuelve al piloto cuando esa guarda esté resuelta.
- Datos de INV (#240) para los chips de locks del tablero y la ficha completa.
