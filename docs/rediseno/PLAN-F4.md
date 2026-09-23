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

## F4 arrancado · shell (navegación v2)

Primer paso del lote F4, detrás del flag `preview v2` y sin tocar el default:

- **Navegación**: el ítem activo usa el **azul de acción** del v2 y los rótulos
  de grupo quedan más marcados; hover con superficie suave. Es CSS dentro del
  scope `.tema-v2`, así que se apaga con el flag o retirando el bloque.
- Capturas (claro y oscuro, 390 y 1280, con el flag apagado y prendido):
  `c241f4-shell-{off,on}-{claro,oscuro}-{mobile,desktop}.png` en esta carpeta.
- Siguiente en el shell: densidad de la barra superior y del menú plegado (los
  cambios de estructura se hacen con PLT, que es dueño del archivo).

## F4 por dominio · estado de la primera pasada

Los cinco dominios pedidos (**inventario → POS → pedidos → clientes →
finanzas**) ya heredan el scope v2 con el flag, porque el shell aplica
`.tema-v2` a su raíz y los tokens bajan a todas las vistas del panel. La
verificación se hizo capturando cada dominio con el flag **apagado** y
**prendido**, en claro/oscuro y mobile/desktop:
`c241f4-<dominio>-{off,on}-{claro,oscuro}-{mobile,desktop}.png`.

Lo que **falta por dominio** (patrones, no tokens): tiles/chips/stepper propios
de cada pantalla, y el carrito POS (que espera la guarda de CMP). El ajuste de
estructura del shell y de las vistas queda con PLT/CMP según corresponda.

## F4 · accesibilidad AA del shell y modo oscuro completo

Medición real en el navegador (no de tokens) sobre el shell v2 con el flag
prendido, en claro/oscuro y 390/1280: `e2e/dsn-241-a11y.spec.js` recorre los
textos del shell (barra lateral, topbar, cajón del menú, barra inferior,
banners y pie), compone las alfas sobre el fondo real —los tokens usan /75,
/15, /14— y falla por debajo de AA (4.5:1; 3:1 en texto grande). La guarda de
tokens `src/lib/contrasteTokens.test.js` cubre la paleta base **y** el scope v2
en ambos temas (el bloque oscuro no se estaba midiendo: el selector caía en
`html.dark { color-scheme }`, que no tiene tokens).

| Superficie | Antes | Después |
|---|---|---|
| Rótulos de grupo, claro (medido) | 3.20:1 | 4.97:1 |
| Ítem activo, claro (medido) | 2.91:1 | 4.80:1 |
| Ítem activo, oscuro (medido) | 3.49:1 | 5.93:1 |
| `ok` claro sobre superficies v2 | 2.99–3.30 | 6.46+ |
| `warn` claro | 2.89–3.19 | 6.43+ |
| `info` claro | 3.38–3.73 | 5.89+ |
| `bad` claro | 4.38 | 5.86+ |
| `bad` oscuro | 4.12 | 5.61+ |
| `info` oscuro | 4.16 | 7.96+ |

Qué cambió (todo dentro del scope `.v2-piloto`/`.tema-v2`; el default sigue
igual):
- Tokens semánticos v2 con **tono de texto AA** por tema: los vivos de
  PhoneCheck (`#16A34A`/`#22C55E`, `#DC2626`, `#D97706`, `#4D7CFE`) quedan para
  rellenos e indicadores. Los bloques quedan completos en claro y oscuro
  (fono, reserved, onbrand e ink-950 dejan de heredarse sueltos).
- Rótulos de grupo del shell en verde **sólido** (al 75% sobre la barra clara
  daban 3.2:1).
- Ítem activo con azul de acción AA en cada tema (claro `#2059BE`; oscuro
  `#9FB8FF`) sobre su tinte `/14`.
- Aviso sin conexión y contador de notificaciones con texto legible en ambos
  temas; foco visible con verde oscuro en claro (el de marca quedaba casi
  blanco sobre blanco) y el de marca en oscuro.

Capturas: `c241f4-shell-aa-{claro,oscuro}-{desktop,mobile}.png`,
`c241f4-shell-aa-{claro,oscuro}-menu.png` (cajón abierto en móvil),
`c241f4-shell-aa-inventario-oscuro.png` (el shell y el contenido del pilotaje
en oscuro) y el par `c241f4-shell-aa-antes-{claro,oscuro}-desktop.png` con el
estado medido antes del arreglo.

Resultado: 38 textos de shell en desktop, 14 en mobile (+47 con el cajón
abierto), todos ≥ AA; el aviso sin conexión también. El contenido del panel
midió 0 bajos en los cuatro combos de `/resumen` y en la tabla de inventario en
oscuro. Pendiente para CMP: portar estos tonos AA al scope `tema-v2` de
`owncoding-ui`.

## F4 · dominios: pedidos, clientes, finanzas, servicio/garantías, resumen/análisis, compras, configuración e inventario

Pasos del rollout por dominio (contenido, no solo tokens), también detrás del
flag: chips pill, números de consola, azul de acción en los activos internos,
stepper del taller, tiles de KPI, el "x de y" de recepción, los tiles de
rol/acceso y los tiles de equipo del inventario. Detalle, capturas y medición en
[`F4-DOMINIOS.md`](F4-DOMINIOS.md).
