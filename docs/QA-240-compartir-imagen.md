# QA · Compartir documentos imprimibles como imagen (#240/#220)

Compartir como PNG el certificado/informe/constancia y las etiquetas (góndola y
taller) reusando el mismo HTML de «Descargar PDF». Capturas en
`docs/qa/240-compartir-imagen/`.

## Qué se implementó

- `lib/printing/compartirDocumento.js`: `documentoAPng` (rasteriza el HTML en un
  iframe oculto con el ancho del papel y densidad 2), `compartirArchivo` (Web
  Share; `'cancelado'` no es error), `copiarImagen` (`ClipboardItem`) y
  `nombreImagenDocumento` (nombres seguros con la referencia).
- `shared/CompartirImagen`: botones **Compartir imagen** (con respaldo de
  descarga si el navegador no comparte archivos), **PNG** y **Copiar**, con
  avisos por toast.
- Integrado en el modal del certificado/informe/constancia, en las etiquetas de
  góndola, en las etiquetas del taller («Imprimir en serie») y en el
  **comprobante de compra** (`ComprobantePreview`, el modal compartido con POS).

## Unit

`src/lib/printing/compartirDocumento.test.js` (7 ✓): nombre de archivo seguro y
recortado · anchos por formato · `canShare` con y sin soporte · compartir
distinguishing compartido/cancelado/fallo · copiar con y sin `ClipboardItem` ·
rasterizado con un entorno de marco inyectado (blob, tamaño y limpieza del
iframe) · sin HTML/documento no rompe.

`src/lib/objetosReglas.test.js`: regla del objeto compartido (las pantallas
importan `CompartirImagen`; `navigator`/`toPng` no se tocan fuera del módulo).

## e2e

`e2e/informe-dispositivo.spec.js` (spec completo **7/7**) con puertos aislados
del worktree:

```
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-PRN MOBOS_E2E_PGPORT=5527 \
MOBOS_E2E_API_PORT=3127 MOBOS_E2E_WEB_PORT=5237 \
npx playwright test e2e/informe-dispositivo.spec.js
```

| Caso | Qué verifica |
| --- | --- |
| `el certificado se comparte como imagen PNG (descarga y portapapeles)` | Sin Web Share en el arnés, *Compartir imagen* **descarga** `certificado-phonecheck-<4>.png` (>10 KB, firma PNG, ancho de rollo y alto > ancho); *PNG* descarga de nuevo; *Copiar* deja *Imagen copiada* con `clipboard-read/write`; el iframe de rasterizado se limpia (`iframe[data-png-documento]` = 0). |
| `las etiquetas del taller se descargan como PNG` | En «Imprimir en serie», *PNG* descarga `etiquetas-taller-<n>.png` del alcance elegido (>5 KB, firma PNG) y limpia el iframe. |

Además, `e2e/pos-pedidos.spec.js` (spec completo **6/6**, coordinado con POS):
el comprobante de compra se descarga como `comprobante-<código>.png` (>10 KB),
deja *Imagen descargada*, limpia el iframe y muestra las acciones Compartir/PNG/
Copiar en el modal.

## Verificación en producción (v1.0.172)

`scripts/qa-240-prod-impresion.mjs` (demo, sin credenciales) bajó el
**certificado como PNG** desde la app desplegada: `certificado-phonecheck-0000.png`
de **179 KB** con firma PNG, guardado en `docs/qa/240-impresion-prod/`. La misma
corrida verificó informe, certificado y constancia en 80/A4 (1 página, QR
decodificado) y las **etiquetas de unidad** del taller (3 páginas). Reporte:
`docs/qa/240-impresion-prod/REPORTE.md`.

Capturas: `01-certificado-modal.jpg`, `02-etiquetas-taller-modal.jpg`;
muestras de salida: `certificado-80mm.png` (rollo, 194 KB) y el PDF que sigue
saliendo por «Descargar PDF» sin cambios.

## Checks (worktree MOS-PRN)

`npm run lint` 0 errores · `npm test` 722 ✓ · `npm --prefix backend run test:unit`
75 ✓ · builds FE/BE con `BUILD_ID` ✓ · `prisma:validate` ✓ · shards
**143/143/142** ✓ · `rg "<<<<<<<"` sin resultados.
