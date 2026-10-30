import { FastifyInstance } from 'fastify'
import { authPresets } from '../utils/auth'
import { getAbout } from '../about/about.service'

/** Version of this instance and the latest published one (Settings › À propos). */
export async function aboutRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  app.get('/', auth, () => getAbout())
}
