// Login with an OpenID Connect provider (Keycloak): authorization code flow
// with PKCE, run in the browser. The server tells the page whether login is
// configured (GET /api/v1/auth/config) and which issuer and client to use.
import { reactive } from 'vue'
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export const auth = reactive({
  ready: false, // the configuration has been read and any login redirect handled
  enabled: false, // the server has OpenID Connect login configured
  user: null, // the signed-in user (profile and tokens), or null
  error: '',
})

let manager = null

// Whether the API has accepted this sign-in at least once. It tells "the account has no access"
// (refused from the start) from "the session has ended" (refused after it worked). It is kept in
// the tab's session storage so that it survives a reload, and is reset by every new sign-in.
const ACCEPTED = 'mlw-login-accepted'
export function loginAccepted() {
  try { return sessionStorage.getItem(ACCEPTED) === '1' } catch { return false }
}
export function markLoginAccepted() {
  try { sessionStorage.setItem(ACCEPTED, '1') } catch { /* ignore */ }
}
function resetLoginAccepted() {
  try { sessionStorage.removeItem(ACCEPTED) } catch { /* ignore */ }
}

export const accessToken = () => (auth.user && !auth.user.expired ? auth.user.access_token : '')
export const userName = () => auth.user?.profile?.preferred_username || auth.user?.profile?.name || auth.user?.profile?.sub || ''

export async function initAuth() {
  try {
    const cfg = await fetch('/api/v1/auth/config').then((r) => r.json())
    auth.enabled = !!cfg.enabled
    if (auth.enabled) await start(cfg)
  } catch (e) {
    auth.error = 'Could not read the login settings: ' + e.message
  } finally {
    auth.ready = true
  }
}

async function start(cfg) {
  manager = new UserManager({
    authority: cfg.issuer,
    client_id: cfg.clientId,
    redirect_uri: location.origin + '/',
    post_logout_redirect_uri: location.origin + '/',
    response_type: 'code',
    scope: 'openid profile',
    // tokens live in the tab only; closing it signs the user out of this page
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true, // uses the refresh token
  })
  manager.events.addUserLoaded((u) => { auth.user = u })
  manager.events.addUserUnloaded(() => { auth.user = null })
  manager.events.addAccessTokenExpired(() => { auth.user = null })
  manager.events.addSilentRenewError(() => { auth.user = null })

  const q = new URLSearchParams(location.search)
  if ((q.has('code') || q.has('error')) && q.has('state')) {
    // back from the provider's login page
    let hash = ''
    try {
      resetLoginAccepted()
      const u = await manager.signinRedirectCallback()
      auth.user = u
      hash = u.state?.hash || ''
    } catch (e) {
      auth.error = 'Sign-in failed: ' + e.message
    }
    try { history.replaceState(null, '', location.pathname + hash) } catch { /* ignore */ }
  } else {
    const u = await manager.getUser()
    auth.user = u && !u.expired ? u : null
  }
}

export function login() {
  return manager.signinRedirect({ state: { hash: location.hash } })
}

export async function logout() {
  const u = auth.user
  auth.user = null
  resetLoginAccepted()
  await manager.removeUser()
  // ends the session at the provider too, then returns to this page
  await manager.signoutRedirect({ id_token_hint: u?.id_token })
}
