import '@testing-library/jest-dom'

// Mock axios pour éviter les vraies requêtes HTTP dans les tests
vi.mock('../api/client', () => ({
  default: {
    get:     vi.fn(),
    post:    vi.fn(),
    put:     vi.fn(),
    patch:   vi.fn(),
    delete:  vi.fn(),
    interceptors: {
      request:  { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { baseURL: '' },
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem:    vi.fn(),
  setItem:    vi.fn(),
  removeItem: vi.fn(),
  clear:      vi.fn(),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })
