# Paquete de aprobación · Piloto visual F1/F2 (#241)

Objetivo: aprobar la **dirección visual** del rediseño inspirado en PhoneCheck
(tokens v2 + patrones) antes de extenderla al resto de la app. El piloto está
aplicado y verificado en tres pantallas; nada de lo existente cambió de lógica.

## 1. Tokens v2 (acotados al piloto)

Viven en `src/index.css` dentro del scope `.v2-piloto` (más `.dark .v2-piloto`),
así el resto de la app sigue con la paleta actual hasta la migración de la
biblioteca (CMP). Las pantallas piloto se activan agregando la clase
`v2-piloto` al contenedor.

| Rol | Claro | Oscuro |
|---|---|---|
| Base / fondo | `#F6F8FB` | `#0E1116` (consola) |
| Superficie | `#FFFFFF` | `#1F2430` |
| Texto | `#0E1116` | `#F4F6FA` |
| Pass / ok | `#16A34A` | `#22C55E` |
| Falla / peligro | `#DC2626` | `#EF4444` |
| Aviso | `#D97706` | `#F59E0B` |
| Acción | `#4D7CFE` | `#4D7CFE` |

Tipografía: la del sistema; **mono** (`font-mono`) para IMEI/serial y números
grandes con `v2-numero` (tabular + tracking apretado).

## 2. Patrones

| Patrón | Estado |
|---|---|
| Checklist “x de y pasan” con semáforo y puntaje/grado | ✅ piloto (ficha, #240) |
| Tiles de equipo + chips de estado/locks | ✅ base en tabla/ficha (los locks finos llegan con INV) |
| Números grandes | ✅ en el checklist; pendiente en el tablero |
| Stepper de workflow | ⏳ pendiente (por verificar → verificado → listo) |

## 3. Capturas antes / después

Mobile **390** y desktop **1280**, claro y oscuro. La fase “antes” se capturó
con el mismo spec sobre el código sin el scope (mismo estado de datos), para
que el par sea comparable.

| Pantalla | Antes | Después |
|---|---|---|
| Ficha (desktop, claro) | [antes](c241b-ficha-desktop-light-antes.png) | [después](c241b-ficha-desktop-light-despues.png) |
| Ficha (desktop, oscuro) | [antes](c241b-ficha-desktop-dark-antes.png) | [después](c241b-ficha-desktop-dark-despues.png) |
| Ficha (mobile, claro) | [antes](c241b-ficha-mobile-light-antes.png) | [después](c241b-ficha-mobile-light-despues.png) |
| Ficha (mobile, oscuro) | [antes](c241b-ficha-mobile-dark-antes.png) | [después](c241b-ficha-mobile-dark-despues.png) |
| Carrito (desktop, claro) | [antes](c241b-carrito-desktop-light-antes.png) | [después](c241b-carrito-desktop-light-despues.png) |
| Carrito (desktop, oscuro) | [antes](c241b-carrito-desktop-dark-antes.png) | [después](c241b-carrito-desktop-dark-despues.png) |
| Carrito (mobile, claro) | [antes](c241b-carrito-mobile-light-antes.png) | [después](c241b-carrito-mobile-light-despues.png) |
| Carrito (mobile, oscuro) | [antes](c241b-carrito-mobile-dark-antes.png) | [después](c241b-carrito-mobile-dark-despues.png) |

Tabla de inventario (primera pantalla del piloto): [claro](c241-inventario-light.png).
Ficha con el checklist marcado: [claro](c241-ficha-light.png).

## 4. Qué falta para el rollout

1. **Biblioteca (CMP)**: promover los tokens v2 del scope a los tokens globales
   y retirar `.v2-piloto` (una vez aprobado el rumbo).
2. **Patrones pendientes**: stepper de workflow (estados de la unidad) y
   números grandes en el tablero.
3. **Alcance visual**: shell/tablero, bloque de cobro del POS y el resto de las
   pantallas por lotes (como el rediseño anterior: de a una pasada con QA).
4. **Datos (INV, #240)**: persistencia del checklist, grado oficial, informe
   público sin sesión y la consulta de IMEI guardada para los chips de locks.
5. **Prints**: adaptar el informe del dispositivo y las etiquetas a los tokens
   v2 cuando PRN tome la impresión.

## 5. Qué se pide aprobar

1. ¿Va la dirección (base consola oscura + verde pass + azul acción)?
2. ¿Se promueven los tokens a la biblioteca (CMP) y se retira el scope del piloto?
3. ¿El rollout se hace por lotes de pantallas (con QA antes/después como este)
   o por áreas completas?

Checks del piloto: lint 0 · `npm test` 542 · build FE ✓ · smoke e2e 7/7 · QA del
piloto 1/1 en las dos fases, sin scroll horizontal en 390/1280 y sin errores de
runtime.
