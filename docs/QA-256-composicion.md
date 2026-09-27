# #256 · Composición compacta de Clientes y POS

Las páginas repetían identidad, acciones y métricas entre el shell y el
contenido: Clientes acumulaba espacio vacío, acciones partidas y métricas
ambiguas (total de la tienda mezclado con filas cargadas), y el POS repetía un
encabezado grande y dispersaba las secundarias. Esta unidad crea **dos
composiciones compartidas** y las aplica.

## Objetos nuevos

| Objeto | Qué resuelve |
|---|---|
| `shared/BarraModulo` | Una sola barra por módulo: ícono + **título `h2`** (el `h1` sigue siendo el del shell), detalle y contexto a la derecha, y **acciones juntas** al final. En mobile el título no colapsa (mínimo 11 rem) y las acciones envuelven; el detalle se oculta en pantallas chicas. |
| `shared/ResumenMetricas` | Tiles de métricas donde cada uno declara su **alcance**: «Tienda» (totales del negocio) o «En pantalla» (filas cargadas/filtradas), con nota opcional («12 en pantalla»). |

## Cómo quedan las pantallas

- **Clientes**: barra con la identidad y la navegación Clientes/Campañas en el
  contexto, y las acciones (Crear, Exportar CSV, Importar) juntas; filtros,
  búsqueda, orden y lista/cuadrícula en una sola fila; y **4 tiles** con alcance:
  Clientes·Tienda (con «N en pantalla»), Mayoristas·Tienda, Con deuda·En pantalla
  y Por cobrar·En pantalla. Se eliminaron los badges duplicados.
- **POS**: el bloque grande de encabezado se reemplazó por la barra única
  («Nueva venta» + fecha + Analytics / Ventas suspendidas / Suspender venta),
  sin filas con botones aislados.
- Se respetaron roles, rutas, APIs, modo demo, cola offline y el POS montado
  (la venta en curso no se pierde al navegar).

## Medición antes/después (demo, v1.0.188)

| | Antes | Después |
|---|---|---|
| Clientes · barra | ✗ | **✓** (`barra-clientes`) |
| Clientes · tiles | 3, sin alcance | **4**, con «Tienda» ×2 y «En pantalla» ×2 |
| POS · barra | ✗ | **✓** (`barra-pos`) |
| POS · bloque grande de encabezado | ✓ | **✗** (0 bloques) |

Sin desborde horizontal en 390 ni 1280 en ninguna de las dos pantallas.
Capturas en `docs/qa/256-composicion/{antes,despues}/` (claro/oscuro desktop y
claro mobile) reproducibles con `node scripts/qa-256-composicion.mjs`
(`QA_BASE_URL` para el host).

## Segunda unidad: páginas secundarias

La barra de módulo se aplicó también a las secundarias: **Productos**
(«Actualizar/Combos/Importar» suben a la barra), **Pedidos** («Actualizar» en la
barra y resumen con alcance «En pantalla»), **Promociones**, **Cotizaciones**
(«+ Nueva cotización» y «Actualizar» en la barra), **Plantillas** («Nueva
plantilla») y **Delivery**. El **cotizador de Trade-In** («Cotizar equipo») la
usa en la vista del vendedor; el dueño ve el pipeline.

Medición (demo, v1.0.190): **6/7 con barra visible** (la séptima es el pipeline
del dueño), títulos visibles y sin desbordes. Capturas claro/oscuro desktop y
claro mobile en `docs/qa/paginas-secundarias/{antes,despues}/` con
`scripts/qa-secundarias.mjs`.

## Revisión de Configuración (v1.0.190)

`scripts/qa-config-revision.mjs` recorre los 7 grupos **con el contenido
cargado** (nada de esqueletos) en claro/oscuro/móvil: 21 capturas, sin
desbordes. **Hallazgo corregido**: en «Equipo y acceso», la ficha del
integrante apretaba los importes en tiles de 4 columnas dentro de una tarjeta
angosta (los números se pisaban); ahora las métricas van como filas
etiqueta/valor con el objeto `FilaDato`.

## Cierre visual (final)

Barrido final del panel vendedor con `scripts/qa-secundarias.mjs` →
`docs/qa/paginas-secundarias/cierre/`: **6/7 con barra visible** y títulos
visibles (la séptima es el pipeline del dueño en Trade-In, que no es una
secundaria de vendedor). No quedan `SellerSection description` sueltos en
`src/components`.

Lámina de cierre (matriz claro/oscuro/móvil × ANTES | DESPUÉS) de Productos en
`docs/qa/paginas-secundarias/cierre/comparativa-cierre.jpg`, generada con
`scripts/qa-comparativas-cierre.mjs`.

## Verificación

- `e2e/qa-256-composicion.spec.js` **4/4**: barra única del POS (con fecha y
  acciones), resumen con alcance en Clientes, barra en las secundarias y sin
  desbordes 390/1280.
- Regla de objetos: las pantallas usan las composiciones y los tiles declaran su
  alcance (`src/lib/objetosReglas.test.js`).
- Sin regresiones: smoke **19/19**, gate responsive **12/12** y touch de
  POS/Clientes **16/16** con la biblioteca vigente (owncoding-ui v0.43).
