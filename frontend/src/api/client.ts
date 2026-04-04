import axios from 'axios'
import { createLogger } from '../utils/logger'

const logger = createLogger('api')

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Point 1: send httpOnly cookies automatically
})

// Handle 401 globally — trigger re-login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status
    const url = err.config?.url ?? ''
    const method = err.config?.method?.toUpperCase() ?? ''

    if (status === 401) {
      logger.warn('Unauthorized request', { url, method })
      // Don't redirect for /me (fetchMe handles it) or if already on /login
      if (!url.includes('/auth/me') && globalThis.location.pathname !== '/login') {
        globalThis.location.href = '/login'
      }
    } else if (status && status >= 500) {
      logger.error('Server error', { url, method, status, message: err.response?.data?.error })
    } else if (!err.response) {
      logger.error('Network error', { url, method, message: err.message })
    }

    return Promise.reject(err)
  }
)

export default api
