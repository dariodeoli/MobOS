# PDF profesional de cotización — ejemplo

Así sale la cotización como **PDF real** para compartir por WhatsApp o correo:
A4, identidad de marca (logo, verde de marca, tipografía del sistema), datos de
la empresa y el vendedor, cliente, ítems, totales, validez, notas y el **QR de
aceptación en línea**. Generado con el mismo código que usa la app
(`buildProformaHtml` + `documentoAPdf`) en Chromium real.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `cotizacion-a4.pdf` | El PDF que se comparte/descarga (1 página A4, 236 KB, una imagen JPEG por página con `/DCTDecode`). |
| `cotizacion-a4.jpg` | La vista del HTML que lo genera (para comparar diseño). |
| `qr-aceptacion.png` | El QR que va impreso en el PDF (verificado con Vision → `https://app.moboss.online/cotizacion/COT-DEMO-0007`). |
| `datos-ejemplo.json` | La cotización usada (número, cliente, vendedor, total y validez). |

En la app, el vendedor lo dispara desde **Cotizaciones → Enlace/QR** con
*Compartir PDF* (share sheet del sistema; si el navegador no comparte archivos,
descarga el PDF y lo avisa) o *PDF* (descarga directa).

## Regenerar

```bash
npx vite --port 5281 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5281 node scripts/ejemplo-cotizacion-pdf.mjs
```

Reglas y contrato: `docs/IMPRESION.md` §17.
