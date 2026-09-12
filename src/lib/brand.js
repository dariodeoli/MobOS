// Identidad configurable de la aplicación. Cambiar VITE_APP_NAME no altera
// las claves históricas de almacenamiento ni los datos existentes.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'MobOS'
export const APP_FULL_NAME = import.meta.env.VITE_APP_FULL_NAME || 'MobOS Retail'
export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE || 'Gestión móvil'
// Cada actualización publicada incrementa el último punto: 1.0.2, 1.0.3...
// Los pies visibles de la app leen esta constante central.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'v1.0.19'
export const APP_CREDIT = import.meta.env.VITE_APP_CREDIT || 'Desarrollado por Owncoding'
export const APP_CREDIT_URL = import.meta.env.VITE_APP_CREDIT_URL || 'https://owncoding.dev/'
export const LEGACY_APP_NAME = 'MobOS'
