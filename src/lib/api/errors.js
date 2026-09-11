/** Error normalizado para respuestas fallidas del backend de OwnCoding Hub. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', details = null, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isApiError(error) {
  return error instanceof ApiError
}

