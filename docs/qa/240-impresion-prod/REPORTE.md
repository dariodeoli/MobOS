# Verificación de impresión en producción · informe (#240)

- Base: https://app.moboss.online
- Fecha: 2026-09-24T23:55:53.942Z
- Versión desplegada: v1.0.161
- Método: camino real de la app (demo → ficha → «Informe» → formato → «Descargar PDF»), PDFs armados con el HTML que manda la app y QR decodificado con Vision.

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
| informe-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| informe-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |

## Pasos

- ✅ demo + versión: v1.0.161
- ✅ botón Informe en la ficha: presente
- ✅ botón Certificado en la ficha: presente (ronda con la etiqueta)
- ✅ impresión directa en la demo: aviso honesto del demo
- ✅ hoja de estación (demo): aviso honesto del demo
- ✅ PDF 80 mm generado desde la app: 107215 bytes

**Lectura**: si el botón «Certificado» figura ausente, es que la etiqueta todavía no está desplegada
(ronda pendiente); el informe ya sale con el QR al informe público (`/u/<serial>`). Cuando la próxima
ronda esté en producción, se corre este mismo script y la tabla se completa sola.
