# Reglas de tablas y listados (MobOS)

Regla viva del proyecto, hermana de `docs/CAMPOS.md`. Antes de armar o tocar un listado, seguí estas reglas: son las mismas que ya usan Pedidos, Clientes e Inventario.

## 1. La grilla

Una sola constante `GRID` compartida por el encabezado y cada fila. Si el encabezado y la fila no usan la misma constante, las columnas se desalinean.

```js
const GRID = 'grid min-w-[60rem] grid-cols-[...] items-center gap-x-2'
```

| Pieza | Regla |
|---|---|
| Contenedor | `overflow-x-auto` + `data-testid="<vista>-tabla"` en el wrapper |
| `min-w` | Igual al ancho mínimo real de las columnas. En pantallas chicas la tabla scrollea **dentro** de su caja; en desktop (1280+) tiene que entrar sin scroll |
| `gap-x-2` | 8 px. Con `gap-x-3` el ancho fijo se come el espacio de las columnas flexibles |
| Alto de fila | `px-3.5 py-2`, una línea por fila. Solo la celda de identidad puede llevar dos líneas |
| Sin tabla HTML | `<div>` con grid; la fila es `role="button"` + `tabIndex={0}` cuando abre un detalle |

## 2. Anchos: por contenido real

Nunca reservar ancho "por si acaso". Cada columna se mide sobre lo que realmente muestra:

| Tipo de dato | Ancho | Ejemplos |
|---|---|---|
| Identidad o lo que diferencia | `minmax(Xrem, Nfr)` | Producto, Cliente, Artículos, Falla |
| Categórico corto | `rem` fijo | Estado, Pago, Cant., Entrega, Condición |
| Fecha | `5rem`–`6.5rem` | `17-sep`, `17 sept 26 · 15:30` |
| Monto | `5.5rem`–`8.5rem` | `Gs. 12.500.000` |
| Serial | `6.75rem`–`7.25rem` | completo con los últimos 4 destacados |
| Acciones | `8rem`–`15rem` | el ancho del conjunto de botones, `whitespace-nowrap` |

`minmax(0, …)` en las flexibles: permite que encojan por debajo de su contenido mínimo. Sin el `0`, el texto largo empuja la grilla y aparece scroll horizontal.

`fr` con prioridad: el dato que se lee primero lleva el `fr` más alto (Pedidos: artículos `1.6fr` > cliente `1.15fr` > serial `0.9fr`).

## 3. Celdas

| Regla | Por qué |
|---|---|
| `truncate` + `title` con el texto completo | Nada se pierde: el tooltip tiene todo |
| Badges y chips: `w-fit justify-self-start whitespace-nowrap` | Un grid item se estira por defecto; sin esto el badge parece un textfield gigante |
| Montos y cantidades: `text-right tabular-nums` | Los dígitos se alinean en columna |
| Seriales: `<SerialTexto>` (`src/components/shared/SerialTexto.jsx`) | Recorta la cabeza y **nunca** pierde los últimos 4 |
| Fechas: helper local `fechaCorta` | `17 sep 26 · 15:30` o `17-sept`; sin año cuando es el corriente |
| Vencimientos: color **solo cuando apura** | Vencido o dentro de 3–7 días; el resto es una fecha más |
| Estado: `Badge` con `color` del mapa | Verde/ok, naranja/warn, rojo/bad, slate/neutro |
| Encabezados: `text-[10px] font-bold uppercase tracking-wider text-mute` | Densidad sin ruido |
| Celdas: `text-xs` / `text-[11px]`; el nombre en `text-sm font-semibold` | Jerarquía por tamaño, no por color |

## 4. Encabezados ordenables

`button` con `↑`/`↓`; activo en `text-fono-light`. El default por vista se elige por lo que se mira primero (Pedidos: fecha desc; Catálogo: nombre asc; Servicio Técnico: recibido desc).

## 5. Filas desplegables

Cuando el detalle no entra en una línea (líneas de una compra, cambios de un movimiento), la fila se despliega **debajo** en la misma grilla: `chevron` que rota, panel con `rounded-xl border border-ink-600 bg-ink-800/60 p-3`. Nunca una tarjeta por registro.

## 6. Verificación

- Medir en el navegador: `scrollWidth === clientWidth` del contenedor a **1280 y 1440**.
- Un test e2e por vista que afirme que no hay scroll horizontal (ver `e2e/admin.spec.js`).
- Ojo con Playwright: los locators por texto son estrictos. Los datos de prueba no deben contener palabras que aparezcan en encabezados o botones (por eso los productos de prueba usan prefijo `ZZ`).
