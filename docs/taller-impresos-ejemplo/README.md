# Impresos en serie del taller (#240) — ejemplos

PDFs de lo que el **modo taller** manda a imprimir en serie, generados con los
mismos builders que la app (`src/lib/printing/hojaEstacion.js`,
`certificado.js` y `OrderReceipt.jsx`), sobre unidades demo del repo.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `hoja-estacion-serie.pdf` / `.jpg` | **Hojas de estación en serie**: una página por carril (por verificar · verificado · listo para vender), con modelo, variante/grado/batería, IMEI, estado y ubicación, y el bloque de firma/control. |
| `hoja-estacion-por-verificar.pdf` / `.jpg` | La **hoja individual** de un carril (el botón «Hoja de estación»), para comparar con la serie. |
| `certificados-serie.pdf` / `.jpg` | **Certificados finales**: uno por equipo verificado (grado, controles iCloud/MDM/ESN/carrier, checklist, verificación y QR al informe público + código de barras `CERT|…`). |
| `datos-ejemplo.json` | Las estaciones y los equipos usados. |

## Dónde sale cada uno en la app

- **Taller** (`/inventario/taller`, pestaña Taller) → «Imprimir en serie…»:
  - **Hojas por estación** (aparece con más de un carril en el alcance): una
    hoja por estación en un solo trabajo.
  - **Certificados (n)**: el certificado de inspección de cada equipo del
    alcance, uno por página.
  - «Hoja de estación» sigue siendo la hoja única del alcance elegido y
    «Etiquetas» el rollo en serie.
- La demo bloquea la impresión con un aviso honesto (son datos ficticios).

## Regenerar

```bash
npx vite --port 5277 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5277 node scripts/ejemplo-taller-impresos.mjs
```

## Verificación

- **Local**: e2e `informe-dispositivo.spec.js` («el taller imprime las hojas por estación y los
  certificados en serie», 2 hojas y 2 certificados) y unit de `hojaEstacion.test.js`.
- **Producción v1.0.178** (QA `scripts/qa-240-prod-impresion.mjs`): la pantalla del taller muestra
  «Hoja de estación», «Hojas por estación» y «Certificados»; en la demo se bloquean con el aviso
  honesto. Los PDFs de esta carpeta salen de los **mismos builders** que viajan en la versión.

Reglas de impresión y tokens v2: `docs/IMPRESION.md` (§13 y §16).
