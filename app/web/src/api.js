// Thin client for the REST API under /api/v1.
let token = ''
try { token = sessionStorage.getItem('mlw-token') || '' } catch { /* storage may be blocked */ }

export function getToken() { return token }
export function setToken(t) {
  token = t
  try { sessionStorage.setItem('mlw-token', t) } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const seg = (keys) => keys.map((k) => '/' + encodeURIComponent(k)).join('')

async function call(method, path, body) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch('/api/v1' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data && data.error
    throw new ApiError(res.status, e ? e.code : 'error', e ? e.message : res.statusText)
  }
  return data
}

export const api = {
  tables: () => call('GET', '/tables'),
  list: (table, keys, limit, pageState) => {
    const q = new URLSearchParams({ limit: String(limit) })
    if (pageState) q.set('pageState', pageState)
    return call('GET', `/${encodeURIComponent(table)}${seg(keys)}?${q}`)
  },
  create: (table, row) => call('POST', `/${encodeURIComponent(table)}`, row),
  patch: (table, keys, changes) => call('PATCH', `/${encodeURIComponent(table)}${seg(keys)}`, changes),
  remove: (table, keys) => call('DELETE', `/${encodeURIComponent(table)}${seg(keys)}`),
}
