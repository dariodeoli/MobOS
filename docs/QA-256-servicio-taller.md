# Composición compacta · Servicio/Taller (#256, siguiente unidad)

Siguiente unidad del rediseño de composición compacta (#256) sobre el dominio
**Servicio/Taller**: una sola barra de módulo por pantalla (identidad +
contexto + acciones) y el resumen de métricas con **alcance explícito** usando
los objetos compartidos `BarraModulo` y `ResumenMetricas`.

## Qué cambió

- **Taller** (`src/components/control/ServicioTecnico.jsx`): el encabezado
  ad-hoc (descripción + acciones sueltas) pasa a `BarraModulo` (`barra-taller`,
  icono `wrench`) con **Actualizar · Cargar catálogo sugerido · Catálogo ·
  + Nueva orden** juntas en la barra; los filtros y la búsqueda quedan en su
  fila. El resumen Facturado/Costos/Utilidad usa `ResumenMetricas`
  (`resumen-taller`, 3 columnas) con «En pantalla» y los tonos de siempre.
- **Garantías** (`src/components/control/Garantias.jsx`): `BarraModulo`
  (`barra-garantias`, icono `shield`) con **Exportar CSV · Nuevo caso**; los
  chips de estado y la búsqueda bajan a su fila. El resumen Casos/En
  proceso/Listos/Por vencer usa `ResumenMetricas` (`resumen-garantias`, 4
  columnas, sigue detrás del flag v2 como antes).
- **Servicio y Garantías · Todo** (`src/components/control/ServicioGarantias.jsx`):
  el resumen Registros/En taller/Garantías/Desde garantía usa `ResumenMetricas`
  (mismo `data-testid="resumen-servicio-garantias"`, misma condición v2).
- Sin cambios de datos, permisos, rutas ni contratos: solo composición. Las
  vistas **Taller** y **Garantías** no repiten la identidad de página (la barra
  es `h2`; el `h1` del shell sigue siendo único).

## Verificación

- `e2e/qa-256-composicion.spec.js` — nuevo caso **Servicio/Taller**: barra
  única por vista, acciones dentro de la barra (`+ Nueva orden`, `Nuevo caso`),
  resumen de 3 tiles con «En pantalla», `h1` único; y `/servicio` sumado al
  control de **sin desborde horizontal** a 390 y 1280. **4/4**.
- `e2e/qa-241-servicio-v2.spec.js` (regresión AA/overflow del lote E): **8/8**.
- `e2e/qa-148-16-menciones.spec.js` (fix del CI): **1/1** en la misma corrida
  (**9/9** juntas).
- Capturas: `docs/QA-256-servicio-taller/01-taller.png` y `02-garantias.png`.

| Check | Resultado |
|---|---|
| `npm run lint` | 0 errores (3 warnings preexistentes) |
| `npm run build` | ✓ |
| `npm test` | ✓ (guards de objetos y composición) |
| backend `test:unit` + `prisma:validate` | ✓ |
| `test:e2e:smoke` | 19/19 ✓ |

## Notas

- El resumen de Garantías y del listado unificado mantiene la condición v2
  (los «antes» de #241 no cambian); el de Taller no la tenía y sigue visible.
- No hizo falta un objeto nuevo: `BarraModulo` y `ResumenMetricas` ya venían de
  la primera unidad de #256.
