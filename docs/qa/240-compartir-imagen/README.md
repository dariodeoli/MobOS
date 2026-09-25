# Compartir como imagen · capturas (#240/#220)

Evidencia de la verificación en `docs/QA-240-compartir-imagen.md`.

| Archivo | Qué muestra |
| --- | --- |
| `01-certificado-modal.jpg` | Modal del certificado con **Compartir imagen · PNG · Copiar** (y la vista previa del mismo HTML). |
| `02-etiquetas-taller-modal.jpg` | «Imprimir en serie» del taller con las acciones de imagen para las etiquetas del alcance elegido. |
| `certificado-80mm.png` | Salida real del rasterizado en rollo de 80 mm (el mismo HTML de «Descargar PDF»), generada por los e2e. |

Las capturas de pantalla las deja la corrida de
`e2e/informe-dispositivo.spec.js` (tests «Compartir como imagen PNG» y
«Etiquetas del taller como PNG»). El PNG de muestra se generó con
`documentoAPng` —el mismo camino que usan esas pruebas— sobre el certificado de
un IMEI ficticio.
