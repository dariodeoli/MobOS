// Estado del sistema ficticio del modo demo (#324): los chequeos, la
// sincronización y la cola remota que la pantalla Sistema mostraría con una
// cuenta real, con la misma forma que `/api/system/checks`, `/api/system/
// sync-status` y `printingApi.trabajos`.
const hace = (minutos) => new Date(Date.now() - minutos * 60000).toISOString()
const haceHoras = (horas) => new Date(Date.now() - horas * 3600000).toISOString()

export function sistemaDemo() {
  const trabajos = [
    { id: 'demo-job-1', kind: 'comprobante', state: 'PENDIENTE', reference: 'AUR-0001', requestedByName: 'Diego López', requestedByUserId: 'demo-user-vendedor', printerName: 'Térmica mostrador', bridgeName: 'Mac del mostrador', enqueuedAt: hace(2), attempts: 0, error: '' },
    { id: 'demo-job-2', kind: 'etiquetas-lote', state: 'PENDIENTE', reference: 'LOTE-004', requestedByName: 'Hernán Acosta', requestedByUserId: 'demo-user', printerName: 'Etiquetas depósito', bridgeName: 'Mac del mostrador', enqueuedAt: hace(6), attempts: 1, error: '' },
    { id: 'demo-job-3', kind: 'nota-entrega', state: 'INCIERTO', reference: 'AUR-0003', requestedByName: 'Sofía Cáceres', requestedByUserId: 'demo-user-vendedora', printerName: 'Térmica mostrador', bridgeName: 'Mac del mostrador', enqueuedAt: hace(25), attempts: 2, error: 'El puente se reinició durante la impresión.' },
    { id: 'demo-job-4', kind: 'cierre-caja', state: 'FALLIDO', reference: 'CAJA-0002', requestedByName: 'María Benítez', requestedByUserId: 'demo-user-cajera', printerName: 'Láser oficina', bridgeName: 'PC administración', enqueuedAt: hace(48), attempts: 3, error: 'Sin respuesta de la impresora en 6000 ms.' },
  ]
  const pendientes = trabajos.filter((trabajo) => trabajo.state === 'PENDIENTE').length
  const fallidos = trabajos.filter((trabajo) => trabajo.state === 'FALLIDO').length
  // #301: el panel lista los problemas desde esta misma fuente (antes los
  // recortaba de los 50 trabajos más recientes y podía contradecir el contador).
  const problemas = trabajos
    .filter((trabajo) => trabajo.state === 'FALLIDO' || trabajo.state === 'INCIERTO')
    .map((trabajo) => ({ id: trabajo.id, state: trabajo.state, kind: trabajo.kind, printerName: trabajo.printerName, destination: '', error: trabajo.error, createdAt: hace(48) }))
  return {
    checks: {
      checkedAt: new Date().toISOString(),
      resumen: { ok: 5, atencion: 2, error: 0 },
      checks: [
        { id: 'base', label: 'Base de datos', estado: 'ok', detalle: 'Conectada · migraciones al día' },
        { id: 'archivos', label: 'Almacenamiento de archivos', estado: 'ok', detalle: 'Bucket accesible' },
        { id: 'correo', label: 'Correo saliente', estado: 'ok', detalle: 'Remitente verificado' },
        { id: 'cifrado', label: 'Cifrado de datos sensibles', estado: 'ok', detalle: 'Clave configurada' },
        { id: 'seguridad', label: 'Firmas y tokens', estado: 'ok', detalle: 'Rotación vigente' },
        { id: 'imei', label: 'Proveedor IMEI', estado: 'atencion', detalle: 'Saldo de consultas bajo: cargá crédito para seguir verificando' },
        { id: 'backups', label: 'Copias de seguridad', estado: 'atencion', detalle: 'Última copia hace 30 horas' },
      ],
    },
    sincronizacion: {
      generadoEn: new Date().toISOString(),
      puentes: { total: 2, activos: 1, ultimaSenal: hace(1) },
      impresoras: { total: 3, enLinea: 2, sinSenal: 1, sinPuente: 0 },
      trabajos: { pendientes, enCurso: pendientes, fallidos, problemas, ultimoExitoAt: haceHoras(3) },
      emails: { pendientes: 1, fallidos: 0 },
      aex: {
        configurado: true,
        webhookToken: true,
        ultimoEventoAt: haceHoras(5),
        ultimos: [
          { id: 'demo-aex-1', guia: 'AEX-778812', estado: 'EN_TRANSITO', tipoEvento: 'transito', fechaEvento: haceHoras(5), recibidoEn: haceHoras(5) },
          { id: 'demo-aex-2', guia: 'AEX-778801', estado: 'ENTREGADO', tipoEvento: 'entrega', fechaEvento: haceHoras(28), recibidoEn: haceHoras(27) },
        ],
      },
      errores: { ventanaHoras: 24, recientes: 0, ultimos: [] },
      reservas: { vencidasSinLiberar: 1 },
    },
    trabajos,
  }
}
