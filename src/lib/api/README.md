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
serializan cuerpos JSON y, si existe, envían el token como `Authorization:
Bearer <token>`.

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
