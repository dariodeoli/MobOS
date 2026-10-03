# #330 — Triage del QR impreso (PRN)

Fecha: 2026-10-03 · Rama: `slot/impresion` · Alcance: `print-agent/`, `src/lib/printing/`.

Reporte de Dario: «el QR no estaba funcionando, el impreso». Se recorrió el camino
completo: pairing del agente, QR impresos (térmica y A4), destino al escanear y
bytes ESC/POS.

## 1. Qué se verificó y cómo

| Superficie | Método | Resultado |
| --- | --- | --- |
| Pairing del agente | `print-agent/test/remoto.test.mjs` (backend falso: canje, token, config, errores) + e2e `impresion-remota.spec.js` (crear puente por UI y parear contra el backend real) | OK. `pair.mjs` canjea contra `POST /api/print/bridge/pair` con `{code, version, platform}`, normaliza Crockford igual que el backend y guarda `apiUrl`+token sin loguearlo. No hay QR en el pairing: el código se muestra como texto y se tipea (por diseño). |
| Artefacto del agente | `npm run pack:agent:check` + manifest publicado | OK. v1.7.4 al día; el manifest de `api.moboss.online` coincide con `backend/public/print-agent/`. |
| QR de informe y certificado | `scripts/verificar-informe-qr.mjs` (PDF reales → Vision) | 8/8 OK, todos decodifican `https://app.moboss.online/u/351500000000004`. |
| Destino del QR de informe (`/u/<serial>`) | Producción, navegador sin sesión | OK: renderiza el informe público por serial (IMEI enmascarado). Serial inexistente → «No encontramos este equipo» (sin login). |
| Destino del QR de prueba (`/prueba?...`) | Producción, navegador sin sesión | OK: muestra destino, validación, fecha y tipo del papel. |
| Destino del comprobante (`/pedidos/<token>` en `clientes.moboss.online`) | Bundle desplegado + producción | OK: el bundle arma `clientes.moboss.online` (no la app) y la página responde «Seguimiento no encontrado.» para un token inválido (no queda en blanco). |
| QR de góndola (`/producto/<sku>`) | Producción, navegador sin sesión | OK: pide sesión con retorno (por diseño). |
| e2e de impresión | `ocultos-plataforma` + `etiquetas-gondola` + `informe-dispositivo` | 17/17 en verde. |

## 2. Defecto encontrado y corregido

**El QR térmico salía con corrección M, no H.** El contrato de
`docs/IMPRESION.md` §1 dice: «El QR del comprobante va con corrección H y el
módulo térmico en 7»; el HTML ya usaba H (`nivel: 'H'`) pero el comando ESC/POS
(`GS ( k fn 69`) estaba fijo en M (`0x31`). Es exactamente el cuadro que
`docs/IMPRESION-PRUEBA-FISICA.md` lista como «El QR no se lee».

- `src/lib/printing/escpos.js`: `qr()` ahora acepta `correccion` (L/M/Q/H) y
  usa **H** por defecto; el módulo por defecto pasa de 6 a **7** (los llamadores
  ya pasaban 7 en comprobante, etiquetas, informe, certificado y liquidaciones).
- `src/lib/printing/escpos.test.js`: 2 tests nuevos (H/7 por defecto; niveles
  explícitos y valor inválido → H).

## 3. Hallazgos externos (no forzados)

1. **`owncoding-ui` (CMP):** el ticket de prueba se arma con `paginaDePrueba` de
   la biblioteca, que imprime su QR con `tamano: 6` y corrección M fija
   (`owncoding-ui/src/printing/escpos.js:160`, `.../prueba.js:111`). El fix de
   `src/lib/printing/escpos.js` no lo alcanza (la biblioteca crea su propio
   ticket). Debe llevar `correccion: 'H'` + módulo 7 para cumplir
   `docs/IMPRESION.md` §1 y la tabla de errores de la prueba física.
2. **PLT — `playwright.config.js`:** `e2e/qr-unificado.spec.js` no aparece en
   ningún `testMatch`, así que **no lo corre nadie** (el gate que documenta
   `docs/IMPRESION.md` §6 no existía). Además estaba desactualizada y se
   corrigió: `/u/<serial>` ya no pide sesión (#240 lo hizo público) y el slug de
   impresoras es `/configuracion/dispositivos` (#253). Con la spec alineada,
   correrla con `--project=core` da 4/4; falta engancharla.
3. **INV/FIN — comprobante rápido (`src/components/control/Inventario.jsx:536`):**
   si `tokenDeNivel()` falla (403/red), `link` queda vacío y el ticket sale
   **sin QR**, en silencio. El comprobante del modal cae a
   `trackingUrlFor(order)`; el rápido debería tener la misma red.
4. **QR de manifiesto y lista de compra:** los builders aceptan `enlace`, pero
   los llamadores (`Recepcion.jsx`, `PrepararLote.jsx`, `ListaCompraModal.jsx`)
   no lo pasan, así que hoy no se imprime QR en esos documentos (evita un QR
   muerto: `/envio/<token>` no tiene página todavía; el endpoint público
   `GET /api/public/supply/shipments/[token]` ya existe).

## 4. Verificación de la rama

- `npm test` (unitaria completa), `npm --prefix backend run test:unit`,
  `npm run lint`, builds FE/BE con `BUILD_ID`, `prisma:validate` y
  `rg '<<<<<<<'`: en el handover del commit.
- e2e de impresión: `impresion-remota` + `informe-dispositivo` +
  `vendidos-comprobante-rapido` + `ocultos-plataforma` + `qr-unificado` (con la
  spec enganchada de forma temporal): en verde.
