# Verificación de impresión en producción · informe, certificado, constancia y etiquetas (#240/#220)

- Base: https://app.moboss.online
- Fecha: 2026-09-25T19:50:29.111Z
- Versión desplegada: v1.0.172
- Método: camino real de la app (demo → ficha → «Informe/Certificado/Constancia» → formato → «Descargar PDF»), el PNG del certificado por «Compartir imagen», las etiquetas desde el taller («Imprimir en serie»), PDFs armados con el HTML que manda la app y QR decodificado con Vision.

| Documento | Páginas | QR decodificado | Resultado |
| --- | --- | --- | --- |
| informe-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| informe-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| constancia-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-a4 | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-80mm | 1 | `https://app.moboss.online/u/AUR0001000000000` | ✅ |
| certificado-png | — | `` | ✅ |
| etiquetas-unidad-80mm | 3 | `` | ✅ |

## Pasos

- ✅ demo + versión: v1.0.172
- ✅ botón Informe en la ficha: presente
- ✅ botón Certificado en la ficha: presente (ronda con la etiqueta)
- ✅ impresión directa en la demo: aviso honesto del demo
- ✅ certificado como imagen: 179 KB · certificado-phonecheck-0000.png
- ✅ hoja de estación (demo): aviso honesto del demo
- ✅ PDF 80 mm generado desde la app: 106281 bytes

**Lectura**: la ronda desplegada ya trae informe, certificado, constancia, el **certificado como PNG**
(«Compartir imagen») y las **etiquetas de unidad** del taller; si una fila figura ausente o en ❌, esa
ronda no está desplegada o hay una regresión. Se re-corre con el mismo comando (demo, sin credenciales).
