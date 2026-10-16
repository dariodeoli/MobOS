import { templateApi } from '../../../../../lib/print-templates-api'
export const GET = (request: Request) => templateApi(request, 'defaults-get')
export const PUT = (request: Request) => templateApi(request, 'defaults-put')
