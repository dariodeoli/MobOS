# F3 detrás del flag `preview v2` · alcance y cómo activarlo

## Flag (por dispositivo, apagado por defecto)

- Vive en `src/lib/temaV2.js`: `localStorage['mobos:tema-v2'] === '1'` (+ evento
  de cambio) y `temaV2Activo()` para leerlo sin hook.
- El scope visual es `.tema-v2` (alias de `.v2-piloto`) en `src/index.css`, en
  claro y oscuro. **Nada cambia para quien no lo prende.**
- Activar: en la consola del navegador
  `localStorage.setItem('mobos:tema-v2','1')` y recargar. Apagar: `'0'`.
- **PLT**: si prefieren otro dueño del flag (rol/empresa, server-side o un
  toggle visible en Configuración), el helper está aislado y se reemplaza sin
  tocar las pantallas.

## Qué ya está detrás del flag

| Superficie | Estado |
|---|---|
| **Inventario** (tabla de unidades) | ✅ tokens v2 con el flag |
| **Ficha de unidad** (drawer, con checklist #240) | ✅ tokens v2 con el flag |
| Tablero ops (contenido del mock F3) | 📄 especificado en `F3-SHELL-TABLERO.md`; falta cablear datos |
| Carrito POS | ✅ tokens v2 con el flag + colapso máximo (#243, POS) |

## Shell: parche exacto (cuando PLT lo tome)

En `src/components/app/AppShell.jsx`, el contenedor raíz del shell suma la
clase del flag —una línea— y el default queda igual:

```jsx
import { temaV2Activo } from '@/lib/temaV2'

<div className={cn('…clases actuales…', temaV2Activo() && 'tema-v2')}>
```

Con eso, el shell entero (barra lateral, topbar, fondos) se ve en v2 **solo**
en los dispositivos con el flag, sin ramas ni builds distintas. Es reversible:
se apaga el flag o se retira la línea.

## Tablero ops (F3): qué falta para que sea real

1. Datos: KPIs y agrupaciones del resumen (`armarResumenDia`/métricas) y los
   equipos en proceso del inventario; **los chips de locks necesitan la consulta
   de IMEI guardada (INV, #240)**.
2. Objetos: tiles de equipo, chips de estado/locks, “x de y” y stepper — CMP
   define si son objetos nuevos de la biblioteca o composiciones de los actuales.
3. Flag: el mismo `preview v2` decide si el tablero se muestra en v2.
4. QA por paso: capturas antes/después (claro/oscuro, mobile), contraste AA y
   smoke, como el piloto.

## Bloqueo resuelto (guarda de CMP)

`npm test` volvió a verde (**617/617**): el pase de POS (#243) hace el colapso
máximo del carrito y el detalle vive dentro de las piezas del carrito, así que
la guarda `src/lib/objetosReglas.test.js:165` (“las piezas de formulario salen de
`shared/formulario`”) ya no marca el cambio. El carrito v2 queda cubierto.

## Estado actualizado (segunda pasada)

- **Shell**: ✅ detrás del flag. `AppShell` aplica `tema-v2` solo con la preview
  activa (`cn('flex min-h-dvh …', temaV2Activo() && 'tema-v2')`); el default
  queda igual.
- **Tablero ops**: ✅ detrás del flag. `/rediseno-f3` solo muestra el tablero con
  la preview activa; con el flag apagado explica cómo prenderlo.
- **Carrito POS**: ✅ colapso máximo (#243) + patrones v2 (`v2-numero` en los
  totales de venta, carrito, línea y cobro). Capturas y métricas en
  `docs/qa/243/README.md` (claro/oscuro, desktop/mobile, flag on/off).
- **Modales de venta del POS**: ✅ verificados con el flag (claro/oscuro) en
  `docs/qa/249-pos-responsive/rama-249-modales/`; la × del modal compartido
  queda para CMP (25×36, target 44) según la auditoría #249.
- **Capturas**: `docs/rediseno/c241f3p-shell-{off,on}.png` y
  `c241f3p-tablero-{off,on}.png` (1280, claro) + las de `docs/qa/243/`.
