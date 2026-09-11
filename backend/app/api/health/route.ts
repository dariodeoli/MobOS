export function GET() {
  return Response.json({
    ok: true,
    service: "mobos-backend",
  });
}

export function HEAD() {
  return new Response(null, { status: 200 })
}
