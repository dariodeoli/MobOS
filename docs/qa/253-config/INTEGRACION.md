# #253 · Integración de la sección Configuración (lead PLT)

Verificación del **conjunto completo** de la sección, hecha sobre una rama local
de integración (`tmp/253-integracion`, no se pushea): `main` (`9d750790`) +
`slot/plataforma` + `slot/diseno` + `slot/pos` + `slot/componentes` +
`slot/inventario` + `slot/clientes` + `slot/finanzas` + `slot/impresion`.

## Resultado

- **55 e2e verdes / 0 rojos** en el conjunto:
  - `qa-253-config-grupos` (DSN: estructura + AA + capturas), `qa-253-equipo-acceso`
    (POS), `qa-253-mi-cuenta` (CRM), `ia-configuracion`, `menu-ia`,
    `configuracion-lote5`, `config-guardado`, `config-seguro-limites`,
    `dsn-241-a11y` y `permissions` → **52 passed + 4 skipped**.
  - Estabilidad de los dos rojos del CI: `inventario-unidades` («motivo de baja
    recuerda…») y `qa-148-16-menciones` → **3/3 cada uno** con `--repeat-each=3`.
- Build integrado OK; panel **48,9 KB** (sigue muy por debajo de los 87 KB
  previos a #247). Sharding regenerado: 160/160/159.

## Conflictos y resoluciones

1. **`playwright.config.js` + `e2e/sharding.json`** (todas las ramas que suman
   specs): conflicto de registro. Resolución: **unión** de los `testMatch` que
   agregan + `node scripts/e2e-shards.mjs --generar`.
2. **`AppShell.jsx` / `PanelVendedor.jsx` / `App.jsx` / `rutas.js` /
   `metadataPolicy.js`**: mi `/mi-perfil` se solapaba con el `/mi-cuenta` de
   CRM. Resolución: **gana `/mi-cuenta`** (CRM: superficie personal completa
   para todos los roles). Se descarta mi botón `shell-mi-perfil`, su ruta y su
   metadata; la ruta vieja `/configuracion/identidad` redirige a `/mi-cuenta`.
3. **`Config.jsx`** (INV vs CRM vs FIN): me quedo con la reestructura de INV
   (Organización con `TiendasSucursales`) + se quita el bloque `mi-cuenta`
   (movido a `MiCuenta.jsx` por CRM) + el bloque `comercial` inline se reemplaza
   por el componente de FIN (`control/config/Comercial.jsx`, que incluye las
   listas). Se limpian los imports que quedaron sin uso.
4. **`e2e/ia-configuracion.spec.js`** (5 editores): unión de secciones
   (`Equipo y acceso → Integrantes`, `Comercial → Seguro de ventas`) y ajuste de
   mi test: «Mi cuenta se abre desde el avatar» + Precios con **una sola entrada
   de menú** (Inventario → Precios), con las listas dentro del grupo Comercial.
5. **`docs/qa/ia-config/ia-config-organizacion.png`** (binario): se conserva la
   captura de INV (es la autoridad de su grupo).

## Decisión de producto pendiente de confirmar

El issue pedía «Precios: una sola entrada visible». Quedó **una sola entrada de
menú** (Inventario → Precios) y las listas viven **dentro del grupo Comercial**
(alcance de FIN). Si se quiere además que Comercial no muestre el gestor, es un
recorte de una línea en `Comercial.jsx` (dominio FIN).

## Estado del hd / CI

Al momento de la verificación, `main` seguía en `9d750790` y **las 8 ramas
tenían commits sin integrar**; los dos rojos del CI (releases .171/.172) eran
timeouts de un test y ya tenían fix en `main` (`6ea00d30` y `9d750790`).
La racha de 3 verdes se cuenta después de que el hd integre y corran los CI.
