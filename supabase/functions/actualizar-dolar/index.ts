// Edge Function: actualizar-dolar
// Lee la cotización del dólar de una casa de cambio paraguaya (Cambios Chaco vía
// DolarPy) y la guarda en la tabla `kv` (clave `tradein`). El frontend recibe el
// cambio por realtime y actualiza la conversión USD → ₲ en todos los dispositivos.
//
// Se ejecuta sola con un cron cada 4 horas (ver supabase/actualizar-dolar.sql) y
// también se puede disparar a mano desde el Centro de Control → Trade-In.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Casa de cambio a usar como referencia (clave dentro de la API DolarPy).
const FUENTE = 'cambioschaco'
const FUENTE_LABEL = 'Cambios Chaco'
const API_URL = 'https://dolar.melizeche.com/api/1.0/'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // 1) Traer la cotización paraguaya.
    const res = await fetch(API_URL)
    if (!res.ok) throw new Error(`Fuente respondió ${res.status}`)
    const data = await res.json()
    const casas = data.dolarpy ?? data
    const casa = casas[FUENTE]
    const venta = Number(casa?.venta)
    if (!venta || venta <= 0) throw new Error(`Sin valor de venta para ${FUENTE}`)

    // 2) Leer la config actual de Trade-In para respetar el ajuste manual.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: row } = await supabase
      .from('kv')
      .select('value')
      .eq('key', 'tradein')
      .maybeSingle()

    const tradein = (row?.value as Record<string, unknown>) ?? {}
    const ajuste = Number(tradein.exchangeAdjust ?? 0)
    const market = Math.round(venta)
    const rate = Math.round(venta + ajuste)

    // 3) Guardar (merge) la nueva cotización.
    const nuevo = {
      ...tradein,
      exchangeRate: rate,
      exchangeMarket: market,
      exchangeSource: `${FUENTE_LABEL} (auto)`,
      exchangeDate: new Date().toISOString().split('T')[0],
      exchangeUpdatedAt: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('kv')
      .upsert({ key: 'tradein', value: nuevo, updated_at: new Date().toISOString() })
    if (error) throw error

    return json({ ok: true, rate, market, ajuste, fuente: FUENTE_LABEL })
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500)
  }
})
