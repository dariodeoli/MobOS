# Capa API de OwnCoding Hub

Esta carpeta centraliza el acceso al API productivo de MobOS en OwnCoding Hub.
Los módulos operativos consumen este contrato; el frontend no accede directamente a
PostgreSQL ni contiene credenciales de base de datos.

## Configuración

Definir `VITE_API_URL` en el entorno de Vite, por ejemplo:

```env
VITE_API_URL=https://api.example.com
```

La URL se normaliza sin `/` final. Todas las peticiones incluyen `Accept`,
serializan cuerpos JSON y viajan con `credentials: 'include'`: la sesión vive en
cookies HttpOnly del API, nunca en JavaScript.

## Uso

```js
import { api, sessionApi, setAccessToken } from '@/lib/api'

const result = await api.get('/products')
const login = await sessionApi.login({ email, password })
setAccessToken(login.accessToken)
```

`ApiError` expone `status`, `code` y `details`. `API_NOT_CONFIGURED` permite que
la UI distinga una instalación sin backend de un error de red. Los paths de
`sessionApi` son el contrato de autenticación propio de MobOS.

## Caché y tiempos

- Cada `GET` se guarda unos segundos (`CACHE_GET_MS`, 3 s) y se sirve desde
  memoria dentro de esa ventana; `api.get(path, { cacheMs: 0 })` lo desactiva
  para una consulta puntual.
- Cualquier `POST`, `PUT`, `PATCH` o `DELETE` limpia la caché entera, y un
  `401`, `402` o `403` también. `invalidarConsultas()` la vacía a mano (logout,
  cambio de empresa).
- Toda petición corta la espera a los 15 s (`VITE_API_TIMEOUT_MS` para
  cambiarla, `timeoutMs: 0` para desactivarla) y falla con `REQUEST_TIMEOUT` en
  vez de dejar la pantalla cargando sin fin.
