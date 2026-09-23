# Certificado embebido en el informe público (#240)

`/u/<serial>` ahora abre con el **certificado** (los objetos compartidos
`FichaCertificado` + `CodigoQr` de owncoding-ui), alimentado con los datos que la
ruta pública ya entrega: grado, checklist («x de y pass»), controles
(iCloud/MDM/ESN/carrier), batería/ciclos, quién y cuándo verificó, IMEI
enmascarado y el **QR al informe**. El checklist detallado, los controles y los
repuestos siguen debajo, como estaban.

## Contrato de datos usado

`GET /api/public/units/:serial` → `unit`: `grade`, `checklist { puntaje,
aprobados, evaluados, items[] }`, `controles [{ clave, label, valor, ok }]`,
`batteryHealth`, `batteryCycles`, `verifiedBy/At`, `imeiMasked`,
`repuestosNoOem(Nota)`. La ficha los mapea:

- `estado` del chip de cabecera: `falla` si algún ítem falló · `revision` con
  observaciones o grado C · `pendiente` sin checklist · `pass` el resto.
- `locks`: `controles` → `{ clave, estado: ok ? 'libre' : 'activo', detalle }`
  (vocabulario de `ChipsLocks`).
- La batería de la inspección manda sobre la de recepción (igual que el papel).

## Coordinación (comentada en #240)

- **CMP**: props que el embed necesita y aún no están en el componente:
  `estado` (v0.15.1 ✅), `puntaje`, `condicion` y `repuestosNoOem(Nota)`. La
  página ya las pasa (el componente actual las ignora): cuando la biblioteca
  entre, la ficha las muestra sin otro cambio.
- **CRM** (página): el certificado se suma **arriba** del checklist y los
  controles, sin tocar el resto; queda a su criterio podar la tarjeta de equipo
  cuando la ficha muestre `condicion` (evitar duplicación, criterio #246).
- **DSN** (visual): se usan los objetos compartidos (ficha + QR + chips de
  locks); sin estilos propios en la página.
- **PRN**: contrato de la **constancia de preparación** documentado en
  `docs/PHONECHECK-INFORME.md` (sección nueva), reusando el mismo payload del
  certificado + firma.

## Capturas

- `docs/qa/240-informe-certificado/01-informe-certificado-demo.png` (demo: ficha
  con grado B, «1 de 2 pass», chips de locks y QR).
- `test-results/informe-publico-checklist/01-informe-publico-checklist.png`
  (harness con backend real).
