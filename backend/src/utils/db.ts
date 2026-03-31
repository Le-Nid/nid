import { FastifyReply } from 'fastify'

/** Escape ILIKE special characters to prevent wildcard injection */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&')
}

/** Send a 404 response with a standardized error message */
export function notFound(reply: FastifyReply, message = 'Not found') {
  return reply.code(404).send({ error: message })
}
