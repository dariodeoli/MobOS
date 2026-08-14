// Edge Function: resumen-diario
// Arma el cierre del día (ventas, por vendedor, comisiones, delivery y gastos)
// y lo manda por correo con Resend. La dispara un cron todas las noches.
//
// Variables de entorno necesarias (se cargan con `supabase secrets set`):
//   RESEND_API_KEY   → clave de https://resend.com
//   RESUMEN_TO       → destinatario (tu Gmail). Varios: separados por coma.
//   RESUMEN_FROM     → remitente. Sin dominio propio: "Fono <onboarding@resend.dev>"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TZ_OFFSET = -3 // Paraguay = UTC-3

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', ...cors } })

const gs = (n: number) => '₲ ' + Math.round(n || 0).toLocaleString('es-PY')
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Fecha local (YYYY-MM-DD) desplazando la hora UTC a Paraguay.
function fechaLocal(d = new Date(), diasAtras = 0) {
  const x = new Date(d.getTime() + TZ_OFFSET * 3600 * 1000 - diasAtras * 86400 * 1000)
  return x.toISOString().slice(0, 10)
}
function fmt(f: string) {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = new URL(req.url)
    // ?fecha=YYYY-MM-DD para reenviar un día puntual; por defecto, hoy.
    const fecha = url.searchParams.get('fecha') || fechaLocal()
    const ayer = fechaLocal(new Date(fecha + 'T12:00:00Z'), 1)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const traer = async (coll: string) => {
      const { data, error } = await supabase
        .from('entities')
        .select('data')
        .eq('collection', coll)
      if (error) throw error
      return (data || []).map((r: { data: Record<string, unknown> }) => r.data)
    }

    const [ventas, vendedores, productos, gastos] = await Promise.all([
      traer('ventas'), traer('vendedores'), traer('productos'), traer('gastos'),
    ])

    const prodById: Record<string, any> = {}
    productos.forEach((p: any) => (prodById[p.id] = p))
    const vendById: Record<string, string> = {}
    vendedores.forEach((v: any) => (vendById[v.id] = v.nombre))

    const delDia = ventas.filter((v: any) => v.fecha === fecha)
    const delAyer = ventas.filter((v: any) => v.fecha === ayer)
    const totalHoy = delDia.reduce((a: number, v: any) => a + num(v.precio), 0)
    const totalAyer = delAyer.reduce((a: number, v: any) => a + num(v.precio), 0)
    const delivery = delDia.reduce((a: number, v: any) => a + num(v.montoDelivery), 0)
    const gastosDia = gastos.filter((g: any) => g.fecha === fecha)
    const totalGastos = gastosDia.reduce((a: number, g: any) => a + num(g.monto), 0)

    // Agrupado por vendedor
    const porVend: Record<string, { n: number; total: number; com: number }> = {}
    delDia.forEach((v: any) => {
      const k = v.vendedorId || 'sin'
      porVend[k] ??= { n: 0, total: 0, com: 0 }
      porVend[k].n++
      porVend[k].total += num(v.precio)
      porVend[k].com += num(v.comision ?? prodById[v.productoId]?.comision)
    })
    const filas = Object.entries(porVend)
      .map(([k, x]) => ({ nombre: vendById[k] || 'Sin vendedor', ...x }))
      .sort((a, b) => b.total - a.total)
    const totalCom = filas.reduce((a, f) => a + f.com, 0)

    const dif = totalHoy - totalAyer
    const cmp = totalAyer > 0
      ? `${dif >= 0 ? '🟢 +' : '🔴 '}${gs(Math.abs(dif))} vs ayer (${gs(totalAyer)})`
      : 'Sin referencia de ayer'

    const th = 'padding:8px 10px;text-align:left;font-size:12px;color:#64748b;border-bottom:2px solid #e2e8f0'
    const td = 'padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:14px'
    const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:22px;border-radius:14px 14px 0 0">
    <div style="font-size:13px;opacity:.85">FONO MOBILE STORE · Cierre del día</div>
    <div style="font-size:15px;margin-top:2px">${fmt(fecha)}</div>
    <div style="font-size:34px;font-weight:800;margin-top:8px">${gs(totalHoy)}</div>
    <div style="font-size:13px;opacity:.9;margin-top:4px">${cmp}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;padding:18px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <tr>
        <td style="${td}">🧾 Ventas del día</td><td style="${td};text-align:right;font-weight:700">${delDia.length}</td>
      </tr>
      <tr><td style="${td}">💰 Comisiones a pagar</td><td style="${td};text-align:right;font-weight:700">${gs(totalCom)}</td></tr>
      <tr><td style="${td}">🛵 Delivery del día</td><td style="${td};text-align:right;font-weight:700">${gs(delivery)}</td></tr>
      <tr><td style="${td}">🧾 Gastos cargados</td><td style="${td};text-align:right;font-weight:700;color:#dc2626">${gs(totalGastos)}</td></tr>
    </table>

    <div style="font-weight:700;margin-bottom:6px">🧑‍💼 Por vendedor</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><th style="${th}">Vendedor</th><th style="${th};text-align:center">Ventas</th>
          <th style="${th};text-align:right">Vendido</th><th style="${th};text-align:right">Comisión</th></tr>
      ${filas.map((f) => `<tr>
        <td style="${td};font-weight:600">${f.nombre}</td>
        <td style="${td};text-align:center;color:#64748b">${f.n}</td>
        <td style="${td};text-align:right;font-weight:700">${gs(f.total)}</td>
        <td style="${td};text-align:right;color:#059669">${gs(f.com)}</td></tr>`).join('') ||
        `<tr><td colspan="4" style="${td};text-align:center;color:#94a3b8">Sin ventas este día</td></tr>`}
    </table>

    <div style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">
      Enviado automáticamente por Fono Mobile Store
    </div>
  </div>
</div>`

    const KEY = Deno.env.get('RESEND_API_KEY')
    if (!KEY) return json({ ok: false, error: 'Falta RESEND_API_KEY' }, 500)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESUMEN_FROM') || 'Fono Mobile Store <onboarding@resend.dev>',
        to: (Deno.env.get('RESUMEN_TO') || '').split(',').map((s) => s.trim()).filter(Boolean),
        subject: `📊 Cierre ${fmt(fecha)} · ${gs(totalHoy)} · ${delDia.length} ventas`,
        html,
      }),
    })
    const out = await res.json()
    if (!res.ok) return json({ ok: false, error: out }, 500)

    return json({ ok: true, fecha, ventas: delDia.length, total: totalHoy, id: out.id })
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
