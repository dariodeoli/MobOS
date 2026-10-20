# Compatibilidad POS #620 / #622 + fiscal #344 / #627

## Fuente para integración

Rama propia `codex/pos-620-fiscal-344`, creada desde `origin/main` v1.0.235 (`2845521a`). Incorpora la secuencia de #622 hasta `7fe0076e` y la de #627 hasta `a1427c20` mediante cherry-picks sin conflictos Git. Las ramas originales se preservaron. No contiene la edición Apple #628 ni MCP #557; no cambia versión ni despliega.

## Contrato combinado

- Un único campo «Nombre del cliente en ficha», dentro del Modal compartido, limita el nombre visible a200 caracteres. Editarlo conserva id, identidad fiscal exacta (hasta2000), confirmación PERSON y contacto. Se eliminó el segundo campo redundante «Nombre visible».
- El buscador exterior conserva la intención de buscar/seleccionar. Su consulta es estado independiente del nombre de la ficha: corregir el nombre en el Modal no selecciona otro cliente homónimo. La limpieza del efecto invalida respuestas pendientes al cambiar consulta/id o abrir el Modal, y abrirlo limpia la intención de búsqueda para no reemitir una consulta vieja al cancelar; quitar cliente limpia la consulta y recupera el foco. Los consumidores con ficha inline mantienen su búsqueda aunque su bloque de contacto esté abierto.
- Fiscal, POST/PATCH de ficha y payload orders mantienen el contrato de #627. El checkout respeta el paso explícito «Listo, ir a cobrar» de #622. Un409 conserva Modal/datos/error y el reintento válido cierra.

## Evidencia final

- Última fuente: **19 POS PASS**,38,0s y **4 fiscales PASS**,19,5s,0flaky en ambas corridas. Incluyen18 pruebas frontend POS + guardado/reintento POS y los4 contratos fiscales, con respuesta homónima tardía y cierre/cancelación del Modal.
- El caso fiscal largo deja una consulta externa pendiente, abre el Modal, corrige su nombre y entrega la respuesta homónima obsoleta: no reemplaza la ficha ni su fiscal. Confirma un único input, maxlength200, POST/PATCH y orders con fiscal1924 caracteres exactos.
- Revisión de capturas detectó que emular sistema oscuro no activaba el tema móvil. Se fijó explícitamente el tema y se exigió `.dark`: los2 casos de tema/Modal finales **2 PASS**,10,4s,0flaky. Las capturas desktop/móvil finales están realmente en oscuro.
- Prueba de pagos adaptada al catálogo de cuentas actual: en lugar de asumir9 opciones (hay10), comprueba nombres diferentes y que cada fila muestra la cuenta elegida. No se modificó lógica de pagos.
- FE1598 PASS; BE347 PASS +1skip; lint0errores y1warning previo DeliveryOperations; build Vite PASS; build Next PASS con `BUILD_ID=Gnpx0yZOX0SmSYJorq6p3`; Prisma validate PASS.
- Arnés HTTP/PG completo exit0: paridad schema PASS,18 checks fiscales inline, backup/restauración con67productos y98órdenes idénticos y demás regresiones del arnés. Backend no cambió después de esa corrida. Sólo datos sintéticos, sin OwnData real ni lectura de claves.
- UI aislada: PG `/tmp/mobos-e2e-pg-620344`:5590, API3190, web5290; cada corrida detuvo sus recursos. El arnés HTTP creó y limpió su cluster propio.

Los contratos de cliente/RUC/orders fiscales son HTTP simulados sobre componentes reales; no demuestran el piloto de OwnData. #344 mantiene esa aceptación pendiente.

## Capturas revisadas

Directorio local: `/Users/dario/Documents/Codex/2026-10-15/gi/outputs/pos-620-fiscal-344-review/`.

- `customer-modal-existing-1440x900.png`: cliente seleccionado, nombre en Modal.
- `customer-modal-new-1440x900.png`: cliente nuevo, único campo.
- `ticket-5-lines-no-modal-1440x900.png`: cliente y ticket de5líneas.
- `ticket-10-lines-768x900.png`: ticket10líneas en tablet.
- `checkout-payment-over-total-1440x900.png`: validación de sobrepago visible.
- `theme-1440px.png` / `theme-390px.png`: POS oscuro desktop/móvil.
- `customer-modal-theme-1440px.png` / `customer-modal-theme-390px.png`: Modal oscuro desktop/móvil.

Se inspeccionaron visualmente el Modal oscuro desktop/móvil y el ticket5líneas: un nombre editable, sin campo duplicado ni desbordes visibles. No se crea PR de release; el integrador recibe esta rama funcional y decide la integración al candidato236.

## Novedades para el dueño

- El POS renovado y los datos fiscales funcionan juntos en un solo editor de cliente.
- Corregir el nombre visible conserva la ficha y su identidad fiscal; una búsqueda tardía no los reemplaza.
- Un error al guardar mantiene los datos para reintentar.
- La consulta real del proveedor sigue pendiente; esta preparación no publica cambios.

## Revisión final: selección de pre-cliente

`usarBorrador` y `elegirCliente` limpian explícitamente la intención de búsqueda. Elegir un borrador sin id y con el mismo nombre de la consulta no siempre cambiaba otra dependencia del efecto; ahora invalida cualquier respuesta pendiente. Regresión nueva: borrador sintético en localStorage, consulta exacta pendiente, selección del pre-cliente, respuesta tardía de otra ficha y confirmación POST nuevo con el documento del borrador intacto. Suite fiscal ampliada: **5 PASS**,15,7s,0flaky; helpers fiscales12PASS; lint0errores/1warning previo y buildfrontend PASS. Backend/gates generales y capturas anteriores permanecen sin cambios.
