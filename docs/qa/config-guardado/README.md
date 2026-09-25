# Configuración · «Guardar» no guardaba (bug/UX transversal)

Ronda del slot/finanzas (2026-09-25). Pedido del dueño: al clicar **Guardar** no
se guardaba en `/negocio` ni en la mayoría de los apartados de Configuración;
había que arreglar la causa raíz (frontend y `api/account`), con **feedback
Guardado/Error** y **Enter** para guardar. Además, «Datos de la tienda» tenía
los campos de **Ciudad, Teléfono y RUC demasiado cortos** y el RUC del negocio
debía usar el `RucField` con extractor.

## Causa raíz (reproducida antes de tocar código: 5/5 fallando)

1. **El API pide reautenticación reciente** (10 minutos) para *todas* las
   acciones sensibles de `PATCH /api/account` —numeración, datos de la tienda,
   seguro y límites, revocar sesión— y también para `GET /api/account/export`.
   Sin esa ventana, el guardado devolvía **403** y el mensaje quedaba en el aviso
   global del tope de la pantalla (o directamente no había forma de resolverlo
   en la sección): «no guarda».
2. **La carga pisaba lo escrito**: el formulario de «Datos de la tienda» se
   rehidrataba cuando llegaba `GET /api/account` y borraba en silencio lo que la
   persona ya había cargado; Guardar enviaba los campos en blanco.
3. **Después de guardar, los campos volvían a los valores viejos**: el guardado
   actualizaba el contexto de sesión pero no el `tenant` del panel (la ficha de
   la izquierda seguía mostrando "—"), así que el formulario se "restauraba" y
   parecía que no se había guardado nada.
4. **El campo «Prefijo» nacía vacío** aunque el backend numere con `MOB` cuando
   la empresa no configuró prefijo (`backend/lib/order-number.ts`): se veía
   `MOB-#0294` arriba y un campo vacío abajo, sin forma de guardar sin volver a
   escribirlo.
5. **Anchos**: «Datos de la tienda» ponía Ciudad y Teléfono en dos columnas
   dentro del panel angosto (`minmax(18rem, 24rem)` ≈ 300 px): ~140 px por campo.
   Lo mismo pasaba con Teléfono/Instagram en Sucursales.

## Qué se hizo

- **Mecanismo transversal** (`src/components/control/GuardadoCuenta.jsx` +
  `src/utils/guardadoCuenta.js`): `useGuardadoCuenta()` envuelve cada guardado,
  muestra el estado **Guardado/Error** en el formulario y, si el API pide la
  contraseña (403 de reautenticación), la pide **ahí mismo** y **reintenta el
  guardado solo** al verificarla (habilitado 10 minutos).
- Aplicado en Negocio (numeración, seguro, límites), Datos de la tienda,
  Seguridad (exportación, revocar sesión), Mi identidad y Sucursales.
- **Enter guarda**: «Guardar numeración» pasó de `type="button"` a submit del
  formulario; el resto de los formularios ya eran submit.
- **La hidratación no pisa lo escrito** (bandera `tocado`) y, al guardar,
  el `tenant` del panel se actualiza al instante (formulario y ficha).
- **Prefijo efectivo**: la pantalla muestra y edita `MOB` cuando la empresa no
  tiene prefijo (misma regla que el backend).
- **Anchos correctos en la grilla**: Ciudad/Teléfono/RUC a una columna en
  escritorio (dos en tablet/móvil), igual que Teléfono/Instagram en Sucursales.
- El RUC del negocio sigue con `RucField` (extractor `/api/ruc` adentro,
  «Usar estos datos» con confirmación) y ahora ocupa el ancho del panel.

## Evidencia

| Qué | Dónde |
| --- | --- |
| Antes: Enter en la dirección → «Ingresá la contraseña…» y nada guardado | `config-guardado-datos-tienda-enter-antes.png` |
| Antes: Ciudad y Teléfono apretados en dos columnas (≈140 px) | `config-guardado-datos-tienda-antes.png` |
| Antes: «Prefijo» vacío y el botón deshabilitado | `config-guardado-numeracion-enter-antes.png` |
| Después: una columna por campo (Ciudad, Teléfono, RUC con extractor) | `config-guardado-datos-tienda-despues.png` |
| Después: Guardado con los datos cargados y persistidos tras recargar | `config-guardado-datos-tienda-guardado-despues.png` |
| Después: numeración con el prefijo efectivo y chip «Guardado.» | `config-guardado-numeracion-guardado-despues.png` |
| Después: prefijo inválido explicado en la sección (no se guarda) | `config-guardado-numeracion-error-despues.png` |
| Después: la contraseña se pide en la sección y el guardado sigue solo | `config-guardado-reauth-datos-tienda-despues.png`, `config-guardado-reauth-numeracion-despues.png`, `config-guardado-reauth-exportar-despues.png` |
| Después: Mi identidad y Sucursales con estado Guardado | `config-guardado-identidad-despues.png`, `config-guardado-sucursal-guardado-despues.png` |

Spec: `e2e/config-guardado.spec.js` (5 casos: datos de la tienda con
restauración, numeración con Enter y error, Mi identidad, exportación con
descarga real, sucursales). Unit: `src/utils/guardadoCuenta.test.js` (3 casos).
Cada caso entra como dueño desde `/login` para que la ventana de
reautenticación esté vencida y el pedido de contraseña sea determinista.

## Coordinación

- **PLT (`api/account`, lote F)**: la puerta de reautenticación del `PATCH` y del
  `export` queda **igual** (no se tocó el backend); la UI ahora la resuelve en el
  lugar. Queda reportado de la ronda anterior:
  `GET /api/auth/me` devuelve el tenant sin `insurancePct`, `loyaltyPct` ni
  `collectionLateFeeBpPerDay` (hoy ninguna pantalla los lee de ahí). También:
  `GET /api/account` devuelve `orderPrefix: null` cuando la empresa no lo
  configuró; el frontend replica el `MOB` efectivo de `lib/order-number.ts` —si
  PLT prefiere devolver el prefijo efectivo, se puede quitar esa regla del
  frontend.
- **DSN (diseño v2)**: los estados usan el `Badge`/`Aviso` compartido (chip v2) y
  la grilla nueva se resolvió localmente (`cn(GRILLA_DOS_COLUMNAS, 'lg:grid-cols-1')`);
  si conviene, puede promoverse a `components/shared/formulario.js` como
  constante de «grilla en panel».
