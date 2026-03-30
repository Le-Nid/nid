import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Point 1: send httpOnly cookies automatically
})

// Handle 401 globally — trigger re-login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url = err.config?.url ?? ''
      // Don't redirect for /me (fetchMe handles it) or if already on /login
      if (!url.includes('/auth/me') && globalThis.location.pathname !== '/login') {
        globalThis.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
