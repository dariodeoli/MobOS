# IA de Configuración en siete secciones + Ayuda (#IA · #251)

**Pedido (Dario, 25/09):** ordenar Configuración en secciones que no dupliquen
contenido, sacar «Mi identidad» y «Documentación» del panel y mantener las rutas
viejas funcionando.

## Qué cambió

Antes: 4 grupos (Personas · Negocio · Seguridad · Sistema) y 12 pestañas.
Ahora: **7 secciones** sin solapamientos.

| Sección | Contenido |
| --- | --- |
| **Mi cuenta** | Perfil y foto de la persona, nombre y correo, preferencias del dispositivo, sesiones personales. |
| **Organización** | Datos de la tienda, numeración de pedidos, logos, datos legales y titulares, tiendas, sucursales y archivar/eliminar empresa. |
| **Equipo y acceso** | Integrantes, invitaciones, roles y permisos, horarios, PIN, metas y comisiones. |
| **Comercial** | Seguro de ventas, límites y autorizaciones, fidelización y mora, listas de precios. |
| **Seguridad y auditoría** | Confirmar identidad, sesiones activas, uso del equipo, auditoría y exportación. |
| **Dispositivos** | Impresoras, puentes y diagnósticos (con PLT). |
| **Sistema** | Salud, correo saliente, AEX y webhooks, reservas, errores y versión (con PLT). |

- **Sin duplicar:** Tiendas solo en Organización; foto y nombre solo en Mi cuenta;
  ID de tienda solo en el detalle de Tiendas; Datos de la tienda centralizados.
- **Documentación** sale de Configuración y vive en **Ayuda**, la entrada del
  shell (para todo el equipo: `/ayuda/ayuda`, integrado con PLT en #251). La
  sección **Comandos y atajos** de Ayuda lista Ctrl/Cmd+K, F1–F4, Ctrl/Cmd+S,
  Esc y el chip de usuario (1 clic cambia de vendedor, triple clic bloquea),
  aclara el teclado de Mac y enlaza `/status` y `/ops`.
- **Redirecciones** (los marcadores y enlaces viejos siguen entrando):
  `identidad|preferencias` → `mi-cuenta`; `negocio|sucursales` → `organizacion`;
  `roles` → `equipo`; `precios` → `comercial`; `historial` → `seguridad`;
  `impresoras|impresion` → `dispositivos`; `documentacion` → `/ayuda/ayuda`.
- La reautenticación de archivar/eliminar empresa se pide **en el lugar**
  (Organización) y sigue disponible en Seguridad y auditoría.

## Verificación

- `npm run lint` — 0 errores.
- `npm test` (733) y `npm --prefix backend run test:unit` (75) en verde.
- `npm run build` + `npm --prefix backend run build` (con `BUILD_ID`) y
  `prisma:validate`, en verde.
- e2e: **181/181** en la suite enfocada (`ia-configuracion`, `documentacion`,
  `ocultos-plataforma`, `shell-roles`, `admin`, `config-*`, `precios-listas`,
  `auditoria`, `seguridad-cuenta`, `dsn-241-dominios`, `equipo-*`,
  `invitar-persona`, `finanzas-comisiones`, `ruc-*`, `demo-anonimo`,
  `demo-finanzas*`, `analisis`, `permissions`) sobre el rebase a v1.0.169 —
  detalle en `resultados.txt`.

## Capturas

- `ia-config-*.png`: las siete secciones en claro (desktop).
- `ia-config-organizacion-mobile.png` y `mi-cuenta-mobile.png`: mobile 390×844.
- `ia-config-organizacion-oscuro.png`: tema oscuro.
- `ia-config-ayuda.png` y `ia-config-ayuda-atajos.png`: Documentación y la
  sección de comandos y atajos en la Ayuda del shell (`/ayuda/ayuda`).
