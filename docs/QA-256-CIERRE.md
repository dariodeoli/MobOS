# Cierre #256 · páginas secundarias + faltantes (producción v1.0.191/v1.0.192)

Cierre de la **unidad de diseño (DSN)** de #256 sobre las páginas secundarias del
panel, con capturas en producción, y **auditoría de faltantes** del resto de las
pantallas (para asignar a cada slot).

## 1. Cierre de la unidad (secundarias)

Barrido en producción con `scripts/qa-secundarias.mjs` y auditoría por pantalla
con `scripts/qa-256-cierre.mjs`:

| Pantalla | Barra compacta | Título visible | Desborde móvil |
|---|---|---|---|
| Productos | `barra-productos` | ✅ | no |
| Pedidos | `barra-pedidos` | ✅ | no |
| Promociones | `barra-promociones` | ✅ | no |
| Cotizaciones | `barra-cotizaciones` | ✅ | no |
| Plantillas | `barra-plantillas` | ✅ | no |
| Delivery | `barra-delivery` | ✅ | no |
| Trade-In (cotizador, vendedor) | `barra-tradein` | ✅ | no |

- **6/7 con barra** en el demo de dueño (la séptima, `/trade-in`, es la
  **pipeline del dueño**, que no es una secundaria de vendedor); el **cotizador
  del vendedor** se capturó aparte en esta pasada (claro/oscuro/móvil).
- Sin `SellerSection description` sueltos en `src/components`; regla de objetos y
  e2e `qa-256-composicion` (4/4) cubren la composición.
- Evidencia: `docs/qa/post-deploy-v191/secundarias/` (3 temas por página),
  `docs/qa/paginas-secundarias/cierre/` y `docs/qa/256-cierre/produccion/`
  (27 pantallas × claro desktop + claro móvil + `resultado.json`).
- Gates: `qa-256-composicion` 4/4 · smoke 19/19 · matriz AA del shell sin bajos.

## 2. Faltantes (auditoría v1.0.192, demo pública)

27 pantallas auditadas (identidad duplicada = h2/h3 del contenido igual al h1
del shell; barra = `[data-testid^="barra-"]` visible). **0 desbordes móviles.**

### 2.1 Faltantes con el patrón de #256 (título repetido, sin barra) → **INV**
| Pantalla | Ruta | Hallazgo |
|---|---|---|
| Por comprar | `/abastecimiento` | tarjeta con «Por comprar» repetido, sin barra |
| Preparar compra | `/preparacion` | «Preparar compra» repetido, sin barra |
| Preparar lote | `/preparar-lote` | «Preparar lote» repetido, sin barra |
| Recepción | `/recepcion` | «Recepción» repetido, sin barra |
| Métricas de abastecimiento | `/metricas` | «Métricas de abastecimiento» repetido, sin barra |

Capturas: `docs/qa/256-cierre/produccion/{abastecimiento,preparacion,preparar-lote,recepcion,metricas}-claro-desktop.jpg`.
Sugerencia: aplicar la composición compartida (`BarraModulo` + `ResumenMetricas`
con alcance), como ya hicieron Inventario, Compras, Servicio y Garantías.

### 2.2 Sin barra compartida, sin identidad duplicada (decide su slot)
`/precios`, `/autorizaciones`, `/trade-in` (pipeline del dueño), `/celulares`,
`/comparador`. No repiten la identidad de página; si se quiere barra compacta es
una decisión de cada dominio (INV/FIN/POS).

### 2.3 No visibles en demo (requieren sesión real)
- **Compras del Centro** (`/compras-centro`): la composición existe en código
  (`testId="barra-compras-centro"`), pero en la demo gana el **estado vacío**
  («El Centro de Abastecimiento trabaja con las compras de una cuenta real.»).
  Verificar con sesión real (INV).

### 2.4 No aplica / fuera de #256
- **Inicio (`/resumen`)**: tablero, excluido expresamente por el issue.
- **Mi cuenta (`/mi-cuenta`)** y **Configuración**: revisión propia (#253), sin
  identidad duplicada.
- **Finanzas (`/finanzas`)**: ya usa el tratamiento de grillas densas (KPIs +
  tablas, con el título por pestaña: «Caja», «Comisiones»…), sin identidad
  duplicada — captura en la auditoría.
- **Clientes/POS**: primera unidad de #256, en producción desde v1.0.190.

## 3. Cómo re-verificar

```sh
node scripts/qa-secundarias.mjs      # barra + título por página (3 temas)
node scripts/qa-256-cierre.mjs       # auditoría por pantalla + faltantes
```

Ambos entran por la demo pública y no requieren credenciales.
