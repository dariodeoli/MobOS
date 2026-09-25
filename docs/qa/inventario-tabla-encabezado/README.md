# Inventario · Tabla de unidades — encabezado y grilla alineada

**Pedido**: todas las columnas con su título arriba (encabezado visible), la
grilla perfectamente alineada (mismos anchos en encabezado y celdas) y al menos
un ícono por columna donde aplique; sin desalineación en ningún estado
(cargando, vacío, IMEI largo en mono, filas densas).

## El problema (medido)

El encabezado y las filas compartían la plantilla de columnas (`UNIDADES_GRID`),
pero **no el contenido-box**:

| | padding izq. | borde izq. | arranque del contenido |
|---|---|---|---|
| Encabezado | `px-2.5` (10 px) | 0 | **10 px** |
| Fila | `px-3` (12 px) | 4 px (acento de condición) | **16 px** |

→ **todas las columnas caían 6 px a la izquierda** de sus celdas (los anchos
coincidían, el corrimiento era uniforme). Además el encabezado no tenía íconos y
en el **estado de carga** se veía el aviso de “no hay unidades” (la tabla
“saltaba” del vacío a las filas).

Medición antes/después (misma medición por columna, en el mismo x):

```
ANTES   DELTAS [-6,-6,-6,-6,-6,-6,-6,-6]   TÍTULOS ["", "Producto", "Prov", "Costo", "Ubi", "Estado", "Verificado", "Acciones"]   ÍCONOS [0,0,0,0,0,0,0,0]
DESPUÉS DELTAS [ 0, 0, 0, 0, 0, 0, 0, 0]   TÍTULOS ["", "Producto", "Proveedor", "Costo", "Ubicación", "Estado", "Verificado", "Acciones"]   ÍCONOS [0,1,1,1,1,1,1,1]
```

## El fix

1. **Mismo contenido-box**: el encabezado usa `px-3` y reserva el borde
   izquierdo de 4 px (transparente) y el de 1 px del lado derecho, igual que las
   filas → cada título cae exactamente sobre su columna (Δx = 0 y Δancho = 0 en
   las ocho columnas).
2. **Títulos completos + ícono por columna**: Producto (caja), Proveedor
   (camión), Costo (dinero), Ubicación (local), Estado (info), Verificado
   (escudo) y Acciones (sliders); la casilla de selección no lleva título. La
   columna de proveedor y la de ubicación se ensanchan (5,5 y 6,5 rem) para que
   el nombre completo entre sin recortes y la grilla pasa a `min-w-[59rem]`.
3. **Encabezado visible**: fondo suave, esquina redondeada y línea inferior, para
   que se lea como encabezado en claro y oscuro.
4. **Estado de carga**: las filas esqueleto usan **la misma grilla** (contenedores
   que estiran y la barra adentro) y reemplazan al aviso de vacío mientras llegan
   los datos; el vacío solo aparece cuando la carga terminó.
5. **Alineación de las otras tablas**: las de Reservas, Traslados y Eliminados
   suman el borde de 1 px transparente que les faltaba para coincidir con sus
   filas.

Los estados con **IMEI largo en mono** y **filas densas** no cambian la grilla:
el serial cede dentro de su columna (cola visible + tooltip, #245) y la fila se
mantiene en una línea (≤ 48 px, #246).

## Evidencia (claro, 1280 y 390)

| Estado | Antes | Después |
|---|---|---|
| Tabla llena (1280) | `antes-01-lleno-desktop.png` | `despues-01-lleno-desktop.png` |
| Tabla llena (390) | `antes-02-lleno-mobile.png` | `despues-02-lleno-mobile.png` |
| Vacío | `antes-03-vacio.png` | `despues-03-vacio.png` |
| Cargando | `antes-04-cargando.png` (mostraba “no hay unidades”) | `despues-04-cargando.png` (esqueleto alineado) |
| IMEI largo / denso | `antes-05-imei-largo-denso.png` | `despues-05-imei-largo.png` |

El antes se capturó con el código previo; el después, con `e2e/inventario-tabla-encabezado.spec.js`
(corrido con `MOBOS_CAPTURAS` apuntando a esta carpeta).

## Guarda de regresión

`e2e/inventario-tabla-encabezado.spec.js`:

- llena y carga: **Δx = 0 y Δancho = 0** en las ocho columnas, en 1280 y 390;
- cada columna (menos la casilla) tiene título y al menos un ícono;
- cargando: el esqueleto existe, **no** se muestra el vacío y también alinea;
- vacío: el encabezado queda visible con todos los títulos;
- IMEI largo: la fila mide ≤ 48 px y la grilla no se mueve;
- capturas reproducibles de los cinco estados.
