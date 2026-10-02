# QA #303 — Centro de Control accesible desde Lista por modelo y Comparador

Auditoría del demo v1.0.209: Lista por modelo y Comparador pedían cargar los
datos desde el «Centro de Control Celulares/Imágenes», pero ese centro no
aparecía en la navegación, ni en la búsqueda, ni tenía enlace directo. Además,
la demo nunca sembraba `celulares`: ambas pantallas quedaban vacías.

## Qué cambió

- **Centro de Control** (`/centro-control`, `src/components/control/CentroControl.jsx`):
  dos secciones — **Celulares** (alta, edición de precios en tanda, eliminación
  y «Cargar lineup iPhone») e **Imágenes** (foto por modelo y color para el
  Comparador, con cola de pendientes y borrado).
- **Accesos**: entrada en el menú Inventario, resultado propio en la búsqueda
  global (`Ctrl+K`, grupo «Accesos») y botón contextual en las barras de Lista
  por modelo y Comparador; los estados vacíos de ambas pantallas también
  enlazan.
- **Demo con datos**: `prepararDatosDemo()` (versión 7) siembra `celulares` a
  partir de `IPHONES_DEMO`, así Lista por modelo y Comparador no arrancan
  vacíos y mantienen precios coherentes con el catálogo.
- **Cuentas reales**: la administración local (demo) todavía no tiene API; el
  Centro de Control lo explica con un aviso honesto y ofrece ir a Productos, en
  lugar de fallar al guardar.
- La administración local se apoya en la colección existente (`celulares` y
  `comparadorImg`) y en el objeto compartido `AttachmentInput` para subir fotos.

## Verificación

Spec: `e2e/qa-303-centro-control.spec.js` (proyecto `core`, demo anónimo del
Dueño). Capturas: `docs/qa/303-centro-control/`.

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama> MOBOS_E2E_PGPORT=<55xx> \
MOBOS_E2E_API_PORT=<31xx> MOBOS_E2E_WEB_PORT=<52xx> \
npx playwright test e2e/qa-303-centro-control.spec.js --project=core
```

| Test | Qué afirma |
|---|---|
| se llega desde el menú, la búsqueda y las dos pantallas | menú Inventario, «centro» en Ctrl+K, botón de Lista por modelo y botón de Comparador (abre en Imágenes) |
| la lista cargada alimenta Lista por modelo y Comparador | el demo no arranca vacío; editar un precio y cargar el lineup se refleja en la lista |
| una foto subida reemplaza la maqueta en el Comparador | la foto guardada aparece en la columna del modelo con el color elegido |

Nota: en la demo nada persiste al recargar (contrato de #201); la spec navega
dentro de la SPA para verificar los cambios.
