# Último usado como predeterminado (#209)

Donde algo se elige todo el tiempo, MobOS recuerda la última selección y la
deja puesta la próxima vez. Es una **comodidad**, nunca una decisión del
sistema: el control muestra el valor recordado en su lugar habitual y se puede
cambiar en el mismo gesto. La biblioteca de objetos
(`docs/PLANTILLA-OBJETOS.md`, sección «Último usado como predeterminado») es la
fuente del patrón; esta página documenta la **API única** del frontend.

## API (una sola, compartida)

```js
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { leerUltimo, recordarUltimo, olvidarUltimo } from '@/lib/ultimoUsado'
```

### `useUltimoUsado(clave, inicial, opciones)` — para pantallas React

Se usa como un `useState`: `[valor, guardar]`.

```jsx
const [cuenta, recordarCuenta] = useUltimoUsado('pos:cuenta-cobro', 'Caja', {
  valido: (id) => cuentas.some((cuenta) => cuenta.id === id),
})

<Select value={cuenta} onChange={(event) => recordarCuenta(event.target.value)} />
```

- `clave`: `área:dato` (sin `mobos:`), por ejemplo `pos:vendedor`,
  `config:documentacion-modulo`, `shell:menu-plegado`. Se guarda como
  `mobos:<área>:<dato>`.
- `inicial`: el **default sensato de la pantalla** cuando no hay nada guardado
  (nunca un vacío evitable).
- `opciones.valido(valor)`: valida lo guardado al leer. Si la opción ya no
  existe o no está disponible en ese contexto, se usa el default.
- `opciones.legado`: una clave vieja (o lista) que se lee una vez, se migra al
  namespace nuevo y se retira (`fono:ultimoVendedor` → `mobos:pos:vendedor`).
- `recordar(valor | (actual) => siguiente)` recuerda el cambio; el tercer
  elemento trae `{ olvidar }` para volver al default. Un valor vacío olvida la
  clave (la próxima lectura usa el default).
- Los cambios avisan a todos los controles de la misma clave en la pestaña
  (`EVENTO_ULTIMO_USADO`) y el hook escucha `storage` para sincronizar entre
  pestañas. El valor vive en el namespace `mobos:<área>:<dato>`; los valores
  del primer deploy (`mobos:ultimo:<clave>`) migran al leer.

### `recordarUltimo(clave, valor)` / `leerUltimo(clave, opciones)` — fuera de React

Para código sin hooks (sesión, servicios):

```js
const sucursalId = leerUltimo(`sucursal-activa:${empresaId}`, {
  porDefecto: null,
  valido: (id) => sucursales.some((sucursal) => sucursal.id === id),
})
recordarUltimo(`sucursal-activa:${empresaId}`, sucursal.id)
```

## Reglas de uso

1. **Solo selecciones frecuentes**: cuenta/medio de cobro, vendedor, sucursal
   activa, módulo/categoría de un listado, filtro de período, formato de
   comprobante, visibilidad de columnas o menús.
2. **Nunca** en permisos, seguridad, importes, ni acciones destructivas, y nada
   que cambie el significado de una acción sin que la persona lo vea.
3. **Siempre cambiable y visible**: el valor recordado aparece en el control de
   siempre; el cambio explícito gana al instante y se vuelve a recordar.
4. **Validación al leer**: si la opción guardada ya no existe en ese contexto
   (sucursal borrada, cuenta inactiva, filtro retirado), se cae al default.
5. **Almacenamiento protegido**: `try/catch` en lectura y escritura; sin
   almacenamiento la app sigue con el default.
6. **Demo**: en la demo el valor vive en memoria de la pestaña y se descarta al
   recargar (usa el shim `demoStorage`), así el demo no deja rastros.
7. **Claves**: namespace `mobos:<área>:<dato>`; nada sensible y nada que se
   sincronice con el servidor.

## Dónde está aplicado

| Pantalla | Clave | Default | Notas |
| --- | --- | --- | --- |
| Sucursal activa (`sesion.jsx`) | `mobos:sucursal-activa:<empresa>` | la del usuario o la única | se valida contra el catálogo de sucursales |
| Menú lateral plegado (`PanelVendedor`) | `mobos:shell:menu-plegado` | desplegado | por navegador |
| Resumen plegado (`AppShell`) | `mobos:shell:stats-plegado` | desplegado | por navegador |
| Grupos del menú (`AppShell`) | `mobos:shell:nav-plegados` | todos abiertos | objeto `{ grupo: true }` |
| Documentación → módulo (`Documentacion`) | `mobos:config:documentacion-modulo` | `Todo` | valida contra los módulos reales |
| Auditoría → área y fecha (`Auditoria`) | `mobos:config:auditoria-area`, `mobos:config:auditoria-rango` | `Todo` / cualquier fecha | valida contra las opciones reales |
| Auditoría demo → filtro (`Historial`) | `mobos:config:historial-filtro` | `todas` | la URL (`?filtro=`) sigue mandando |
| POS → vendedor (`FormularioVenta`, `TradeIn`) | `mobos:pos:vendedor` | el de la sesión | migra `fono:ultimoVendedor` |

## Pendiente (otros dominios)

- POS/PRN: nivel y formato de comprobante (`OrderReceipt`), cuenta/medio de
  cobro, tipo de entrega, impresora destino, etiquetas.
- FIN/CRM/INV: categoría/cuenta en Gastos, medio en cobros, filtros de
  período, plantilla de WhatsApp por contexto, motivo de baja/ajuste,
  depósito en altas.

Cada slot migra sus helpers locales al aterrizar esta API (DSN lo refleja en
`docs/PLANTILLA-OBJETOS.md`).
