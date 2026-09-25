# #253 · Organización (datos generales, logos, legales, Tiendas y sucursales, numeración, archivar)

Reparto de #253 (reorganizar Configuración en 7 grupos y eliminar
duplicaciones). El grupo **Organización** existía en `main` con sus piezas
sueltas; este lote las deja unificadas y sin el flujo repetido de archivado.

## Qué cambió

- **Tiendas y sucursales, en una sola sección** (antes: dos tarjetas separadas
  «Tiendas» y «Sucursales»). La tarjeta `Tiendas y sucursales` reúne la tienda
  actual y las demás tiendas de la cuenta (con «Actual», ID y «Copiar ID»,
  «Crear otra tienda» y «Abandonar tienda») y, debajo, las sucursales con su
  alta/edición en el panel derecho (`#sucursal-form`, patrón de Configuración).
- **Archivar, en un solo lugar**: se quitó «Archivar tienda» de la lista de
  tiendas, que duplicaba «Archivar empresa» (la misma operación sobre la
  empresa, sin motivo ni reautenticación). Queda el flujo auditado: motivo de
  10+ caracteres + reautenticación de 10 minutos + confirmación, con la ventana
  de recuperación de 30 días; «Eliminar empresa definitivamente» sigue aparte.
- **Orden del grupo**: Datos de la tienda → Logo de la empresa (identidad
  visual, un logo por modo) → Datos legales (empresas/personas jurídicas y
  titulares) → **Tiendas y sucursales** → Identificador de pedidos
  (numeración) → Archivar / Eliminar.
- **Objetos compartidos** (sin duplicar): `DialogoDestructivo` sale de
  `Config.jsx` a `components/config/DialogoDestructivo.jsx` (lo usan
  Organización y Seguridad) y el copiado con aviso pasa a `copiarValor` en
  `utils/portapapeles.js`.
- **Sin tocar** el shell, las rutas ni `metadataPolicy` (PLT), la estructura
  visual de los 7 grupos (DSN) ni los objetos de CMP. Deep links intactos:
  `/configuracion/negocio` y `/configuracion/sucursales` siguen redirigiendo a
  `/configuracion/organizacion`.

## Archivos

- `src/components/config/TiendasSucursales.jsx` (nuevo, grupo unificado).
- `src/components/config/DialogoDestructivo.jsx` (movido y compartido).
- `src/components/control/Config.jsx` (grupo reorganizado; se retiraron
  `SeccionTiendas`, `SeccionSucursales` y el diálogo local).
- `src/utils/portapapeles.js` (`copiarValor`).
- `e2e/ia-configuracion.spec.js` (fija la unificación y el archivado único).
- `src/lib/objetosReglas.test.js` (la regla del portapapeles acepta la
  importación compuesta).

## Verificación

- `npm run lint` 0 errores · `npm test` **751 ✓** · backend `test:unit` **75 ✓** ·
  builds FE/BE con `BUILD_ID` · `prisma:validate` ✓ · sin marcadores.
- e2e (arnés aislado): **87/87** — `ia-configuracion` (5/5, incluye las
  aserciones nuevas), `config-guardado`, `configuracion-lote5`,
  `config-seguro-limites`, `seguridad-cuenta` (archivar/eliminar y
  recuperación), `ruc-extraccion`, `admin` y `demo-anonimo` (aviso de
  sucursales con cuenta real).

## Capturas

- `antes/` — la sección en `main` v1.0.172 (top, mobile y oscuro); en ese
  estado «Tiendas» y «Sucursales» eran dos tarjetas y el archivado se repetía.
- `despues/` — misma toma con el grupo unificado (`organizacion*.png`) y la
  sección en detalle: `tiendas-sucursales.png` (la tarjeta unificada),
  `tiendas.png` y `sucursales.png` (cada bloque, generados por el spec).
- La galería `docs/qa/ia-config/ia-config-organizacion*.png` quedó al día con
  esta versión.

## Novedades para el dueño

- **Tiendas y sucursales ahora viven juntas** en Organización: tu tienda actual,
  las demás tiendas de tu cuenta y las sucursales, en una sola tarjeta.
- **Archivar quedó en un solo lugar**: antes se podía archivar la tienda desde
  la lista y la empresa al final (dos flujos para lo mismo); ahora hay un único
  «Archivar empresa» con motivo y confirmación, y 30 días para recuperarla.
- El resto de Organización queda ordenado: datos de la tienda → logos → datos
  legales → tiendas y sucursales → numeración → archivar/eliminar.
