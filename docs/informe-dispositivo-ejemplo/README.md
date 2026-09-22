# Ejemplo del informe de dispositivo (#240 · PhoneCheck)

Muestra imprimible de cómo sale el informe de una unidad desde la ficha, para
ver el resultado con una unidad del inventario demo. Los PDFs los genera el
mismo código que usa la app (`src/lib/printing/informeDispositivo.js`,
`tickets.js` y `OrderReceipt.jsx`), así que lo que se ve acá es lo que sale por
la impresora o por «Descargar PDF».

## Archivos

| Archivo | Qué es |
| --- | --- |
| `informe-a4.pdf` / `.jpg` | Informe A4 (1 página) con el checklist completo, la verificación IMEI, la garantía y el QR. |
| `informe-80mm.pdf` / `.jpg` | El mismo informe en rollo de 80 mm (el HTML que usa «Descargar PDF» en formato 80 mm). |
| `informe-80mm-escpos.pdf` / `.jpg` | Lo que recibe la impresora térmica (ESC/POS, 42 columnas) en la impresión directa. |
| `certificado-80mm.pdf` / `.jpg` · `certificado-a4.pdf` / `.jpg` | La constancia de inspección (etiqueta Certificado) del mismo equipo: grado, puntaje, controles y checklist. |
| `qr-enlace.png` | El QR que va impreso, para escanearlo desde la pantalla. |
| `datos-ejemplo.json` | La unidad, la inspección y el enlace usados. |

## Unidad del ejemplo

- Inventario demo: **iPhone 15 Pro Max 256GB Titanio Natural**, seminuevo,
  batería 85%, D1 · Depósito 1, proveedor Mayorista Apple PY.
- El inventario demo usa seriales `AUR…` que **no** son IMEI (a propósito). Para
  que el papel se vea como un equipo real, el ejemplo usa un **IMEI ficticio
  válido** (`351500000000004`, pasa Luhn): así el informe muestra solo el IMEI
  enmascarado (últimos 4), igual que en producción.
- La **inspección PhoneCheck** es un ejemplo con los estados y campos de INV:
  grado A, puntaje 95/100, 9/10 conformes, una observación con nota en
  altavoces y el aviso de blacklist mundial. La **garantía de tienda** es
  ficticia (la demo no carga garantía; sin dato el informe dice «Sin garantía
  cargada»).
- La **verificación IMEI** es de ejemplo; en la demo real figura como simulada.

## El QR

Codifica `https://app.moboss.online/u/<serial>` (el contrato vigente de la
etiqueta de unidad). Hoy abre la app y pide sesión: la **página pública sin
sesión es el pendiente de DSN**. Cuando DSN defina la ruta (mejor si es opaca,
sin el serial en la URL), se cambia un solo dato (`enlace`) y el QR y el texto
impreso apuntan ahí; sin ruta pública el papel no imprime la URL con el serial:
dice «Escaneá para abrir el informe público.»

## Verificación

- Local (código de esta rama): `scripts/verificar-informe-qr.mjs` genera los PDFs
  A4/80 mm/ESC/POS y **decodifica el QR** de cada uno (8/8 apuntan a
  `/u/<serial>`): `docs/qa/240-informe-dispositivo/verificacion-qr/`.
- Producción: `scripts/qa-240-prod-impresion.mjs` recorre la demo y genera los
  PDFs 80 mm y A4 con el HTML que manda la app desplegada, con el QR decodificado:
  `docs/qa/240-impresion-prod/` (v1.0.142 ya imprime el informe; el certificado
  entra en la próxima ronda).

## Cómo se imprime en la app

Ficha de la unidad → **«Informe»** (o **«Certificado»**) → formato 80 mm / A4 /
58 mm → **«Impresión directa»** (ESC/POS por el agente o el puente, sin diálogo)
o **«Descargar PDF»** (diálogo del navegador con el mismo HTML).

Regenerar este ejemplo:

```bash
npx vite --port 5283 --strictPort --host 127.0.0.1 &
QA_BASE_URL=http://127.0.0.1:5283 node scripts/ejemplo-informe-dispositivo.mjs
```
