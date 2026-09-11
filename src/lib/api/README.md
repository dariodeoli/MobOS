# Capa API de OwnCoding Hub

Esta carpeta es un adaptador aislado para el backend futuro. Se activa únicamente
cuando un módulo importa `@/lib/api`; la aplicación actual sigue usando
La capa nueva apunta al API de MobOS en OwnCoding Hub. La migración de las pantallas
que aún usan el adaptador histórico se realizará módulo por módulo, sin usar Supabase
como fuente de datos de producción.

## Configuración

Definir `VITE_API_URL` en el entorno de Vite, por ejemplo:

```env
VITE_API_URL=https://api.example.com
```

La URL se normaliza sin `/` final. Todas las peticiones incluyen `Accept`,
serializan cuerpos JSON y, si existe, envían el token como `Authorization:
Bearer <token>`.

## Uso futuro

```js
import { api, sessionApi, setAccessToken } from '@/lib/api'

const result = await api.get('/products')
const login = await sessionApi.login({ email, password })
setAccessToken(login.accessToken)
```

`ApiError` expone `status`, `code` y `details`. `API_NOT_CONFIGURED` permite que
la UI distinga una instalación sin backend de un error de red. Los paths de
`sessionApi` (`/auth/login`, `/auth/me`, `/auth/logout`) son el contrato
provisional y deben alinearse con OwnCoding Hub cuando exista el backend.

Esta capa no modifica la sesión de Supabase ni migra datos. La migración deberá
hacerse mediante adaptadores de dominio independientes y por etapas.
