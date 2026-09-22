import { AlertTriangle, Check, Printer, WifiOff } from 'lucide-react'
import { Aviso, BarraProgreso } from '@/components/ui'

// «Capturas» de la landing (#202): miniaturas de UI hechas con HTML (no son
// imágenes) para mostrar cada módulo sin depender de pantallas reales. Todas
// usan los tokens del tema, así que se leen igual en claro y oscuro.

function Marco({ titulo, badge, children }) {
  return (
    <div className="rounded-2xl border border-fore/[.08] bg-ink-800/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-mute">{titulo}</span>
        {badge}
      </div>
      <div className="mt-2.5 space-y-1.5">{children}</div>
    </div>
  )
}

function Fila({ children, className = '' }) {
  return <div className={`flex items-center justify-between gap-2 rounded-lg bg-fore/[.035] px-2.5 py-1.5 text-[11px] ${className}`}>{children}</div>
}

function Chip({ children, tono = 'fono' }) {
  const tonos = {
    fono: 'border-fono/30 bg-fono/10 text-fono-dark',
    ok: 'border-ok/30 bg-ok/10 text-ok',
    warn: 'border-warn/35 bg-warn/10 text-warn',
    mute: 'border-fore/15 bg-fore/[.04] text-mute',
  }
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.1em] ${tonos[tono]}`}>{children}</span>
}

const CAPTURAS = {
  pos: (
    <Marco titulo="Venta · POS" badge={<Chip>PIN 2001</Chip>}>
      <Fila><span className="truncate">iPhone 15 · 128 GB</span><b className="tabular-nums">Gs 5.200.000</b></Fila>
      <Fila><span className="truncate">Funda silicona</span><b className="tabular-nums">Gs 80.000</b></Fila>
      <Fila className="border border-fono/25 bg-fono/[.08]"><span className="font-semibold">Total</span><b className="tabular-nums">Gs 5.280.000</b></Fila>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Chip ok>Efectivo</Chip>
        <Chip ok>Transferencia</Chip>
        <Chip warn>Pendiente Gs 1.280.000</Chip>
      </div>
    </Marco>
  ),
  crm: (
    <Marco titulo="Cliente 360°" badge={<Chip>Mini-CRM</Chip>}>
      <div className="flex items-center gap-2 rounded-lg bg-fore/[.035] px-2.5 py-1.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-fono/15 font-display text-[11px] font-bold text-fono-dark">MC</span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[11px]">María Cardozo</b>
          <span className="text-[10px] text-mute">3 pedidos · al día</span>
        </span>
        <Chip ok>Cliente seguro</Chip>
      </div>
      <Fila><span className="text-mute">Deuda</span><b className="tabular-nums">Gs 0</b></Fila>
      <Fila><span className="text-mute">Garantía vigente</span><span className="font-semibold">iPhone 15 · 8 meses</span></Fila>
      <Fila><span className="text-mute">Cronología</span><span className="truncate">WhatsApp de recompra enviado</span></Fila>
    </Marco>
  ),
  finanzas: (
    <Marco titulo="Finanzas · Caja" badge={<Chip>Hoy</Chip>}>
      <Fila><span className="text-mute">Caja Efectivo</span><b className="tabular-nums">Gs 4.920.000</b></Fila>
      <Fila><span className="text-mute">Banco · transferencia</span><b className="tabular-nums">Gs 3.150.000</b></Fila>
      <div className="px-2.5 pt-1">
        <div className="flex items-center justify-between text-[10px] text-mute"><span>Conciliación del extracto</span><span>12 de 12</span></div>
        <BarraProgreso valor={100} tono="ok" className="mt-1" />
      </div>
      <Fila><span className="text-mute">Comisiones por liquidar</span><span className="font-semibold">2 vendedores</span></Fila>
    </Marco>
  ),
  inventario: (
    <Marco titulo="Inventario por IMEI" badge={<Chip warn>Reponer</Chip>}>
      <Fila><span className="min-w-0 truncate font-mono text-[10px]">356938035643809</span><Chip ok>Disponible</Chip></Fila>
      <Fila><span className="text-mute">Ubicación</span><span>Sucursal 1 · Depósito</span></Fila>
      <Fila><span className="text-mute">Condición</span><span>Nuevo · sellado</span></Fila>
      <Fila><span className="text-mute">Reservado para</span><span className="truncate">María Cardozo · 24 h</span></Fila>
    </Marco>
  ),
  servicio: (
    <Marco titulo="Servicio técnico" badge={<Chip>Orden ST-0042</Chip>}>
      <Fila><span className="truncate">iPhone 13 · batería</span><Chip warn>En diagnóstico</Chip></Fila>
      <div className="space-y-1 px-2.5 pt-1 text-[10px] text-mute">
        <p className="flex items-center gap-1.5"><Check size={12} className="text-fono-dark" />Recepción con fotos y checklist</p>
        <p className="flex items-center gap-1.5"><Check size={12} className="text-fono-dark" />Técnico asignado</p>
        <p className="flex items-center gap-1.5 opacity-60">◌ Repuesto y costo estimado</p>
      </div>
    </Marco>
  ),
  portal: (
    <Marco titulo="Portal del cliente" badge={<Chip>Link o QR</Chip>}>
      <div className="rounded-xl border border-fore/10 bg-paper p-2.5">
        <p className="text-[10px] text-mute">Seguimiento de pedido</p>
        <b className="block text-[12px] font-display">MOB-0042</b>
        <div className="mt-1.5 flex items-center justify-between text-[10px]">
          <span className="text-mute">Saldo pendiente</span>
          <b className="tabular-nums text-warn">Gs 1.280.000</b>
        </div>
        <div className="mt-1.5 flex gap-1">
          {['En preparación', 'En camino', 'Entregado'].map((etapa, i) => (
            <span key={etapa} className={`h-1.5 flex-1 rounded-full ${i < 2 ? 'bg-fono' : 'bg-fore/10'}`} />
          ))}
        </div>
      </div>
      <Fila><span className="text-mute">Cuenta y cuotas</span><span className="font-semibold">Al día</span></Fila>
    </Marco>
  ),
  impresion: (
    <Marco titulo="Cola de impresión" badge={<Printer size={13} className="text-mute" />}>
      <Fila><span className="min-w-0 truncate">Comprobante · MOB-0042</span><Chip ok>Aceptado</Chip></Fila>
      <Fila><span className="min-w-0 truncate">Etiqueta de góndola ×12</span><Chip warn>Pendiente</Chip></Fila>
      <Fila><span className="text-mute">Puente</span><span className="truncate">Sucursal 1 · USB + LAN</span></Fila>
      <Fila><span className="text-mute">Prueba de papel</span><span className="font-semibold">Código validado</span></Fila>
    </Marco>
  ),
  offline: (
    <Marco titulo="Sin conexión" badge={<WifiOff size={13} className="text-warn" />}>
      <Aviso tono="warn" como="div" compact className="flex items-center gap-2 px-2.5 py-2 text-[11px]">
        <AlertTriangle size={13} />
        <span>La venta se guarda en el equipo y se envía al reconectar.</span>
      </Aviso>
      <Fila><span className="text-mute">Cola local</span><span className="font-semibold">1 venta esperando</span></Fila>
      <Fila><span className="text-mute">Catálogo y clientes</span><span>Disponibles offline</span></Fila>
      <Fila><span className="text-mute">PWA instalable</span><span className="font-semibold">Android · iOS</span></Fila>
    </Marco>
  ),
  imei: (
    <Marco titulo="Ficha de IMEI" badge={<Chip>Simulado</Chip>}>
      <Fila><span className="min-w-0 truncate font-mono text-[10px]">•••••••••••3809</span><Chip ok>Verificado</Chip></Fila>
      <Fila><span className="text-mute">Lista negra</span><span className="font-semibold">Sin reportes</span></Fila>
      <Fila><span className="text-mute">Find My / iCloud</span><span className="font-semibold">Desactivado</span></Fila>
      <Fila><span className="text-mute">Fuente</span><span className="truncate">IMEIcheck.net</span></Fila>
    </Marco>
  ),
}

export default function CapturaModulo({ tipo }) {
  return CAPTURAS[tipo] || null
}
