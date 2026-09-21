import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../lib/rate-limit'

// Ruta histórica de tracking público. El comprobante vigente apunta a
// /api/orders/public/[token], que expone la vista mínima. Se conserva un
// redirect para no romper los QR de comprobantes ya entregados.
export async function GET(request: Request, { params }: { params: { token: string } }) {
  // Mismo límite que el resto de las superficies públicas (#178).
  const limited = enforceRateLimit(request, 'orders-public-redirect', 60, 60_000)
  if (limited) return limited
  const token = params.token?.trim()
  if (!token || token.length > 200) return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 })
  return NextResponse.redirect(new URL(`/api/orders/public/${encodeURIComponent(token)}`, request.url), 308)
}
