import { templateApi } from '../../../../../lib/print-templates-api'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) { return templateApi(request, 'get', (await context.params).id) }
export async function PATCH(request: Request, context: Context) { return templateApi(request, 'patch', (await context.params).id) }
export async function DELETE(request: Request, context: Context) { return templateApi(request, 'delete', (await context.params).id) }
export async function POST(request: Request, context: Context) { return templateApi(request, 'action', (await context.params).id) }
