export interface PaginationInput {
  page?: string
  limit?: string
}

export function extractPagination(params: PaginationInput, defaultLimit = 50) {
  const page = Number.parseInt(params.page ?? '1')
  const limit = Math.min(Number.parseInt(params.limit ?? String(defaultLimit)), 100)
  const offset = (page - 1) * limit
  return { page, limit, offset }
}
