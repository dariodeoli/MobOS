# Reglas del avatar y las fotos de personas (MobOS)

Regla viva del proyecto, hermana de `docs/CAMPOS.md` y `docs/TABLAS.md`. Antes de mostrar una persona (usuario, vendedor, técnico, dueño, quien hizo un movimiento) seguí estas reglas: son las que ya usan el shell, Equipos con acceso, la presencia del topbar, las cronologías y las fichas.

## 1. Un solo objeto: `Avatar`

`src/components/shared/Avatar.jsx` es el **único** formato de avatar de la app.

```jsx
<Avatar user={{ id, name }} size="md" picture={soloDueno ? perfilEmpresa?.picture : undefined} />
```

| Prop | Para qué |
| --- | --- |
| `user` | La persona: `id` (identidad real) y `name` para el alt/título y las iniciales. |
| `hasAvatar` | `false` evita pedir la foto (no hay 404 innecesarios). Por defecto se deduce de `user.hasAvatar !== false`. |
| `picture` | URL de la **identidad Google** (solo cuando corresponde, ver regla 3). |
| `size` | `xs` `sm` `md` (por defecto) `lg` `xl`. |
| `className` / `title` | Ajuste fino y texto del tooltip. |

**Orden de la foto (no se altera):** foto subida → `picture` de Google → iniciales.

## 2. Reglas de uso

1. **Nunca** un `<img>` ni un círculo de iniciales a mano: si se muestra una persona, se usa `Avatar`.
2. **Identidad por `id`**, nunca por coincidencia de nombre o correo.
3. La **foto de Google se pasa solo para quien corresponde**: el perfil de empresa (`perfilEmpresa.picture`, la identidad del dueño) y la fila "Acceso de empresa" cuya sesión es `google:`. Nunca atribuir la foto del dueño a un tercero; un vendedor sin foto muestra sus iniciales.
4. No mostrar iniciales si hay foto, y no mezclar en la misma entidad la foto subida con la de Google: la subida siempre gana.
5. `alt` = `Foto de <nombre>`; el tooltip usa el nombre o `title`.
6. Las fotos se sirven con **sesión** (endpoint autenticado) y `referrerPolicy="no-referrer"` cuando vienen de Google.
7. Borrado **explícito** (no se restaura sola) y auditado.

## 3. Formato de la foto

- **Subida de avatar:** `POST /api/users/[id]/avatar` (la propia, o cualquier usuario si sos ADMIN) con `FormData` campo `avatar`.
- **Tipos:** PNG, JPG o WebP. **Tamaño:** hasta **1 MiB**. Se validan MIME **y magic bytes** en el servidor (y en el cliente con `AttachmentInput`/`PhotoCropper`).
- **Lectura:** `GET /api/users/[id]/avatar` (con sesión) → imagen con `nosniff` y caché privada; `DELETE` la quita.
- **Recorte y compresión:** `PhotoCropper` (+ `preparePhoto`) antes de subir; el resultado se guarda como data URL en `getAvatarDataUrl` (una sola descarga por pestaña, cacheada como **promesa** para que dos componentes no pidan dos veces).
- **Logo de empresa** (no es avatar): `POST/GET/DELETE /api/tenant/logo`, mismo límite de 1 MiB y formatos.
- **Almacenamiento:** volumen de adjuntos (`MOBOS_STORAGE_DIR`) con respaldo de bytes en base; nunca dentro del HTML público.

## 4. Dónde ya está aplicado

Shell/topbar, "Equipos con acceso" (sesiones de la empresa), presencia del topbar, cronología del cliente (`ActorAvatar`), detalle de pedido, unidad de inventario, recepción de Servicio Técnico y formularios que muestran personas.

> Referencia: `src/components/shared/Avatar.jsx`, `src/components/customers/ActorAvatar.jsx`,
> `src/lib/userAvatar.js`, `src/components/shared/PhotoCropper.jsx`,
> `backend/app/api/users/[id]/avatar/route.ts`, `backend/app/api/tenant/logo/route.ts`.
