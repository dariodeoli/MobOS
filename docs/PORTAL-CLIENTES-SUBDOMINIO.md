# Portal de clientes en `clientes.moboss.online` (#74)

Guía operativa para Dario: pasos exactos en **Cloudflare** + **Coolify**. El
código ya está listo — la app detecta el host `clientes.moboss.online` y muestra
la entrada del portal (`src/App.jsx`), y los enlaces generados ya apuntan ahí
(`src/lib/customerPortal.js`, `src/lib/urls.js`). Es solo infraestructura.

## Antes de empezar

- Acceso a **Cloudflare** (zona `moboss.online`) y a **Coolify** (proyecto MobOS).
- La aplicación del **frontend** es la que hoy sirve `https://app.moboss.online`
  (Coolify → Project → Application → **Domains**).

## 1. DNS en Cloudflare

1. **DNS → Records → Add record**.
2. Type **CNAME** · Name **`clientes`** · Target: el **mismo destino** del
   registro de `app` (el hostname del servidor Coolify o el CNAME que ya usa
   `app`).
3. Proxy: **Proxied** (nube naranja, igual que `app`) · TTL Auto.
4. Guardar y comprobar: `dig clientes.moboss.online +short`.

## 2. Dominio en Coolify

1. Abrí la **aplicación del frontend** (la de `app.moboss.online`) →
   **Configuration → Domains**.
2. Agregá una línea: `https://clientes.moboss.online` (una por línea; **no**
   borres `app.moboss.online`).
3. Guardá. Coolify/Traefik emite el certificado del nuevo dominio (mismo SSL
   que `app`).
4. Si el proxy no toma el cambio, **Redeploy** de la aplicación.

## 3. Rewrite/fallback: no hace falta

En ese host, `/` ya renderiza la **entrada del portal** (`PortalClientesEntrada`)
y el fallback SPA existente resuelve los enlaces profundos
(`/cuenta/<token>`, `/portal/<token>`, `/pedidos/<token>`). La ruta `/clientes`
en ese host no es necesaria; si igual se quiere, un redirect de borde
`/clientes` → `/` es opcional y no afecta al portal.

## 4. URL canónica

Ya es `https://clientes.moboss.online` (`src/lib/urls.js`). Para un staging
independiente se puede fijar **en build** `VITE_CLIENT_PORTAL_URL` (enlaces del
portal) y `VITE_PUBLIC_TRACKING_URL` (comprobantes). En producción no hay que
tocar nada.

## 5. Verificación (con un token real)

```bash
curl -sI https://clientes.moboss.online | head -3            # 200 + SSL válido
curl -s https://clientes.moboss.online | grep -c 'id="root"' # 1 (shell de la SPA)
```

En el navegador, con un enlace real generado desde la ficha de un cliente (la
entrada renderiza "Portal de clientes" y el título del portal):

1. `https://clientes.moboss.online/cuenta/<token>` → saldo y vencimientos,
   pedidos con comprobante, garantías y direcciones (nivel completo).
2. `https://clientes.moboss.online/portal/<token>` → vitrina (nivel rápido).
3. Token inválido → mensaje genérico, sin datos.
4. En la ficha del cliente → **Portal del cliente**: el enlace/QR debe empezar
   con `https://clientes.moboss.online`.

## Opción: token directo (`clientes.moboss.online/<token>`)

Decisión de producto pendiente. Hoy `/` es la entrada y `/<token>` cae en la
entrada. Para abrirlo directo habría que agregar en el host de portal
`<Route path="/:token" element={<CuentaPublica />} />`, al final de la lista y
cuidando no chocar con `/cuenta`, `/portal`, `/pedidos`, `/p`, `/carrito`,
`/garantia`, `/cotizacion` y `/remito`. **No está implementado a propósito.**

## Rollback

Coolify: quitá la línea del dominio y guardá. Cloudflare: borrá el CNAME.
