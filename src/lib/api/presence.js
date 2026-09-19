import { api } from './client'

// Presencia en vivo. El latido nunca debe romper la UI: los errores se ignoran
// en el tracker y la píldora simplemente no se muestra.
export const presenciaApi = {
  latir: (data) => api.post('/api/presence/heartbeat', data),
  personas: () => api.get('/api/presence'),
  uso: (userId = '') => api.get(`/api/presence/usage${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
}
