import { templateApi } from '../../../../lib/print-templates-api'
export const GET = (request: Request) => templateApi(request, 'list')
export const POST = (request: Request) => templateApi(request, 'create')
