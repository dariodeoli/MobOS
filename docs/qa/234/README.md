# #234 · Extractor de RUC dentro del input: seguimiento en Finanzas

- **Issue:** #234 (botón Extraer dentro del campo, visible en todos lados y
  simulado en demo) · **Rama:** `slot/finanzas`
- **Fecha:** 2026-09-24 · **Resultado:** las tres ubicaciones de Finanzas que
  seguían con `Input` pelado pasan al objeto compartido `RucField`.

## Qué cambió

| Pantalla | Campo | Antes | Ahora |
| --- | --- | --- | --- |
| Config → Negocio · Datos privados | RUC de la empresa | `Input` | `RucField` + «Usar estos datos» → nombre legal, RUC normalizado (con DV) y dirección legal **si el proveedor la trae** |
| Config → Negocio · Datos privados | Cédula/RUC del titular | `Input` | `RucField` + «Usar estos datos» → documento normalizado y las partes del nombre legal (`partesDeNombreLegal`) |
| Finanzas → Bancos y cuentas | Documento (cédula/RUC) de la cuenta | `Input` | `RucField` + «Usar estos datos» → documento y titular |

- Nada se pisa hasta que la persona confirma «Usar estos datos»; si el proveedor
  falla, se completa a mano (contrato del objeto).
- El nombre legal del proveedor llega como «APELLIDOS, NOMBRES» y se reparte en
  las partes del titular; un tercer apellido se conserva junto al segundo y,
  sin coma, no se inventa el corte (`src/lib/accountNames.js`, con tests).
- **Dirección legal:** la consulta del proveedor **no la expone** hoy; el
  autocompletado la aplica solo si aparece (`address`/`legalAddress`/`direccion`).
  Queda reportado para INV (si el contrato del endpoint suma el campo, la
  pantalla lo toma sin cambios).

## Barrido (¿quedan `Input` pelados para RUC/CI?)

```
grep -rn "<Input" src --include="*.jsx" | grep -iE "ruc|cédula|cedula|documento|document" | grep -v RucField
```

Solo aparecieron las tres ubicaciones de arriba (todas del dominio Finanzas) y
dos falsos positivos (`CheckoutCustomer` es el buscador de cliente por
CI/RUC —no un campo de captura— y un texto de `Inventario`). Fuera del dominio
no quedó nada pendiente. La guardia `src/lib/camposReglas.test.js` ahora lista
los dos archivos nuevos entre los usos esperados del objeto compartido.

## Evidencia (capturas antes/después)

En esta carpeta, con `QA234_FASE=antes|despues`:

- `234-privados-empresa-{antes,despues}.png`
- `234-privados-titular-{antes,despues}.png`
- `234-cuentas-documento-{antes,despues}.png`
- `234-demo-privados-empresa-despues.png` (demo: resultado simulado marcado,
  sin llamadas al API, y el nombre no se pisa hasta confirmar)

Specs: `e2e/ruc-extraccion.spec.js` (contrato + capturas) y `e2e/ruc-demo.spec.js`
(simulado en demo, sin tocar el API real ni consumir cuota).

## Coordinación

- **INV** (dueño de la consulta de RUC): el contrato no expone dirección legal;
  si el proveedor la devuelve, conviene sumarla al `result` (la pantalla ya la
  aplica sola).
- **CMP/DSN** (objeto compartido): `RucField` ya cumplía el pedido de #234 (botón
  adentro, demo simulado, «Usar estos datos»); no hizo falta cambiarlo. La
  guardia de campos se actualizó con las ubicaciones nuevas.
