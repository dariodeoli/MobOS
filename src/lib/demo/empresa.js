// Empresa y sucursales del modo demo (#213): ficticias y visibles, sin RUC ni
// teléfonos reales. Sin dependencias para poder testearlas en node.
export const EMPRESA_DEMO = {
  id: 'mobos-demo',
  razonSocial: 'Aurora Móviles S.A.',
  nombreFantasia: 'Aurora Móviles',
  ruc: '80012345-0',
  direccion: 'Av. Ficticia 1234, Asunción',
  telefono: '+595 21 000 000',
  email: '35800100@correo.com.py',
  logoIniciales: 'AM',
  logoDescripcion: 'Logo placeholder de la demo',
  horarios: 'Lunes a viernes 08:00–18:00 · sábados 08:00–13:00',
}

export const SUCURSALES_DEMO = [
  { id: 'mobos-demo-central', name: 'Casa Central', city: 'Asunción', address: 'Av. Ficticia 1234', schedule: 'Lun a vie 08:00–18:00 · sáb 08:00–13:00' },
  { id: 'mobos-demo-villa-morra', name: 'Sucursal Villa Morra', city: 'Asunción', address: 'Calle Falsa 456', schedule: 'Lun a sáb 09:00–20:00' },
  { id: 'mobos-demo-luque', name: 'Sucursal Luque', city: 'Luque', address: 'Av. del Demo 789', schedule: 'Lun a vie 08:30–18:30' },
]
