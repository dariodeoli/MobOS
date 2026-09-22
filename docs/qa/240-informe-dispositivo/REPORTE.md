# QA del informe de dispositivo (#240 · épica PhoneCheck)

- Fecha: 2026-09-22
- Método: `scripts/qa-240-informe-dispositivo.mjs` con Vite local (Playwright
  headless) + e2e del arnés con agente simulado.
- Alcance de esta entrega (PRN): el **informe impreso** desde la ficha de la
  unidad, en 80 mm (directo ESC/POS) y A4 (diálogo / «Guardar como PDF»), con el
  QR al informe público. La inspección con checklist (INV) y la página pública
  (DSN) llegan después; el informe ya las muestra cuando existan.

## Artefactos

| Archivo | Qué es |
| --- | --- |
| `informe-a4.pdf` / `.jpg` | A4 (1 página): equipo, verificación IMEI, inspección física, garantía de la tienda e informe público con QR. |
| `informe-thermal-80.pdf` / `.jpg` | HTML de 80 mm (el que usa el respaldo del navegador y el PDF del rollo). |
| `informe-termico-80.pdf` / `.jpg` | ESC/POS 80 mm (42 columnas) tal como sale por el agente. |
| `informe-termico-58.pdf` / `.jpg` | ESC/POS 58 mm: las etiquetas largas se apilan para no cortarse. |
| `resultados.json` | Checks por documento (contenido, QR, páginas). |

## Checks (4/4 OK)

- IMEI **enmascarado** en su fila (solo los últimos 4); un serial que es IMEI no
  se repite en claro.
- Verificación IMEI con sus campos públicos (blacklist, Find My/iCloud, SIM lock,
  MDM, garantía del proveedor) y la fuente; sin costos ni datos internos.
- Inspección física: quién y cuándo verificó, verificaciones, grado y checklist
  (contrato con INV); sin datos dice «Sin grado asignado» / «Sin verificación
  física registrada.».
- Garantía de la tienda (vigente/vencida/sin cargar) y leyenda «Documento
  informativo · no válido como factura».
- QR + enlace `/u/<serial>` (informe público) presentes en A4 y en el rollo.
- A4 en 1 página; los ESC/POS en 1 página (sin cortar líneas).

## Funcional (e2e del arnés)

- `e2e/informe-dispositivo.spec.js` (2/2): la ficha → «Informe» → «Impresión
  directa» manda el trabajo `informe-dispositivo` por el agente (sin diálogo) con
  el IMEI enmascarado y el QR; sin agente, «Descargar PDF» deja el A4 listo para
  guardar. Capturas en `test-results/qa-240-informe-dispositivo/` (ignoradas por
  git).
- Regresión de impresión: `etiquetas-unidad`, `vendidos-comprobante-rapido`,
  `traslados-etiquetas-lote`, `impresion-remota`, `documentos-no-fiscales` y
  `etiquetas-gondola` verdes en la misma corrida (34/35, 1 flaky reintentado del
  puente remoto).

Veredicto: informe listo para papel; pendiente de INV (grado/checklist) y DSN
(página pública) para completar el contenido, sin bloquear la impresión.
