# QA PhoneCheck #240 · informe de dispositivo y certificado de inspección

- Fecha: 2026-09-22
- Método: `scripts/qa-240-informe-dispositivo.mjs` con Vite local (Playwright
  headless) + e2e del arnés con agente simulado.
- Alcance de esta entrega (PRN): el **informe impreso** (80 mm y A4) y la
  **etiqueta Certificado** desde la ficha, con los datos del checklist PhoneCheck
  (contrato de INV) y el **QR al informe público**. La página pública es de DSN.

## Artefactos

| Archivo | Qué es |
| --- | --- |
| `informe-a4.pdf` / `.jpg` | Informe A4 (1 página) con checklist completo en dos columnas, grado, puntaje, aviso y QR. |
| `informe-thermal-80.pdf` / `.jpg` | HTML de 80 mm (respaldo del navegador y PDF del rollo). |
| `informe-termico-80.pdf` / `.jpg` | ESC/POS 80 mm (42 columnas) con el checklist, el aviso y el QR. |
| `informe-termico-58.pdf` / `.jpg` | ESC/POS 58 mm: rótulos largos apilados, sin cortes. |
| `certificado-a4.pdf` / `.jpg` | Certificado A4 (1 página): grado grande, controles, checklist, QR + barras. |
| `certificado-thermal-80.pdf` / `.jpg` | HTML del certificado en 80 mm. |
| `certificado-termico-80.pdf` / `.jpg` | ESC/POS 80 mm del certificado (QR + código interno en barras). |
| `certificado-termico-58.pdf` / `.jpg` | ESC/POS 58 mm del certificado. |
| `resultados.json` | Checks por documento (contenido, QR, serial enmascarado, páginas). |

## Checks (9/9 OK)

- **Checklist (INV)**: los 10 ítems con su estado (`OK`, `Con observación`,
  `Falla`, `N/A`), la nota del ítem no OK, cosmético, batería %/ciclos,
  repuestos no-OEM y el aviso «iCloud/US Block clean no equivalen a blacklist
  mundial».
- **Grado y puntaje**: el payload de INV manda (A · 100/100 · 9/10 conformes);
  sin payload se calculan con sus reglas (OK=1, obs.=0,5, falla=0, N/A no
  cuenta; A ≥ 90, B ≥ 75).
- **Controles**: iCloud, MDM, ESN/Blacklist y Carrier/SIM con semáforo (OK/FALLA);
  sin verificación IMEI dicen «Sin verificación IMEI registrada.».
- **Privacidad**: el serial va enmascarado (solo los últimos 4) y no se imprime
  en claro en ninguna fila; el código interno `CERT|…` va en barras y tampoco
  lleva el serial completo.
- **QR**: siempre una URL de la app. Sin ruta pública de DSN cae al contrato
  `/u/<serial>` y el papel **no** imprime la URL con el serial: imprime
  «Escaneá para abrir el informe público.». Cuando INV/DSN pasan `enlace`, ese
  enlace se imprime tal cual.
- **Formatos**: A4 en 1 página (informe y certificado); los ESC/POS en 1 página
  de rollo (80 y 58 mm) sin líneas cortadas.

## Pendiente de coordinación con INV (comentario en #240)

1. **QR de la etiqueta Certificado**: el contrato todavía propone `CERT|…` como
   contenido del QR. PRN imprime una URL (regla dura de `docs/IMPRESION.md`) y
   manda `CERT|…` a las barras. Con `enlace` (ruta pública de DSN) el QR apunta
   ahí; si el informe público necesita token, avisen y cambiamos solo el `enlace`.
2. **`items` del checklist**: la UI guarda `items` como objeto por clave
   (`{ pantalla: { estado } }`) pero el PATCH `action=inspection` solo puntúa si
   `Array.isArray(items)` y guarda `items: []` en ese caso (se pierden los ítems
   y el grado queda nulo). PRN tolera las dos formas, pero conviene unificar en
   INV (la lib `phonecheck.js` lee objeto; la ruta lee lista).
3. **Título visible**: el certificado usa el `titulo` del payload
   («Certificado PhoneCheck»); sin payload PRN imprime «Certificado de
   inspección» (neutro). Si «PhoneCheck» es marca de un tercero, definan el
   título de producto.

## Funcional (e2e del arnés)

- `e2e/informe-dispositivo.spec.js` (3/3): informe directo por el agente + A4 de
  respaldo; **certificado** directo por el agente (`certificado-phonecheck`) con
  estado «pendiente» honesto mientras la base del arnés no tenga la inspección de
  INV. Capturas en `test-results/qa-240-informe-dispositivo/` (ignoradas por git).
- Regresión de impresión en la misma corrida: etiquetas, lote, comprobante
  rápido, documentos no fiscales y góndola.

## Producción (ronda .142)

`node scripts/qa-240-prod.mjs` (evidencia en `docs/qa/240-informe-dispositivo/prod/`):
al 22/09 la producción está en **v1.0.141** y la ronda .142 (checklist de INV +
esta rama) **todavía no está desplegada**: los assets no llevan las marcas del
informe/certificado y la ficha de la demo no muestra los botones «Informe» ni
«Certificado». Es el único paso que queda de la verificación post-deploy: cuando
.142 esté arriba, se corre el mismo script y se actualiza esta sección con las
capturas del botón y del aviso honesto del demo.

Veredicto: informe y certificado listos para papel con los datos del checklist;
la verificación en producción queda atada al deploy de la ronda .142 (checklist
de INV + esta rama).
