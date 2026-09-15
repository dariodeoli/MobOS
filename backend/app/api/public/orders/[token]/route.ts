import { NextResponse } from 'next/server'

// Ruta histórica de tracking público. El comprobante vigente apunta a
// /api/orders/public/[token], que expone la vista mínima. Se conserva un
// redirect para no romper los QR de comprobantes ya entregados.
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = params.token?.trim()
  if (!token || token.length > 200) return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 })
  return NextResponse.redirect(new URL(`/api/orders/public/${encodeURIComponent(token)}`, request.url), 308)
}
