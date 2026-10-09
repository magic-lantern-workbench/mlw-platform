// End-to-end test of the login with Keycloak. It expects the local development
// stack to be running (scripts/test-login.sh starts one) and drives the web UI
// with a headless Chrome/Chromium through playwright-core.
//
// Environment: APP_URL (default http://localhost:8090), KEYCLOAK_URL (default
// http://localhost:8180), CHROME (path of the browser, found automatically).
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const APP = process.env.APP_URL || 'http://localhost:8090'
const KC = process.env.KEYCLOAK_URL || 'http://localhost:8180'
const USER = 'mlw'
const PASS = 'mlw' // the development realm (docker/keycloak/mlw-realm-dev.json)

let failed = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`)
  if (!ok) failed++
}

async function status(path, headers = {}) {
  return (await fetch(APP + '/api/v1' + path, { headers })).status
}

async function token(password = PASS, scope = '') {
  const body = new URLSearchParams({ client_id: 'mlw-app', username: USER, password, grant_type: 'password' })
  if (scope) body.set('scope', scope)
  const r = await fetch(`${KC}/realms/mlw/protocol/openid-connect/token`, { method: 'POST', body })
  return { status: r.status, json: await r.json() }
}

// ---- API ----
const cfg = await (await fetch(APP + '/api/v1/auth/config')).json()
check('auth config enabled with the mlw realm', cfg.enabled && cfg.clientId === 'mlw-app' && cfg.issuer.endsWith('/realms/mlw'), JSON.stringify(cfg))
check('health needs no token', (await status('/health')) === 200)
check('tables without a token is refused', (await status('/tables')) === 401)
const t = await token(PASS, 'openid')
check('Keycloak issues a token for the test user', t.status === 200)
check('access token is accepted', (await status('/tables', { Authorization: 'Bearer ' + t.json.access_token })) === 200)
check('tampered token is refused', (await status('/tables', { Authorization: 'Bearer ' + t.json.access_token + 'x' })) === 401)
check('ID token is refused', (await status('/tables', { Authorization: 'Bearer ' + t.json.id_token })) === 401)
check('wrong password is refused by Keycloak', (await token('wrong')).status === 401)

// ---- browser ----
const chrome = process.env.CHROME
  || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
if (!chrome) { console.error('no Chrome or Chromium found; set CHROME'); process.exit(2) }
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] })
try {
  const page = await (await browser.newContext()).newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const apiStatuses = []
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && !r.url().includes('/auth/config')) apiStatuses.push(r.status())
  })

  await page.goto(APP + '/#shot')
  await page.waitForSelector('text=Sign in with Keycloak')
  check('login page is shown first, without the sidebar', (await page.locator('.side').count()) === 0)
  check('no API calls before signing in', apiStatuses.length === 0, apiStatuses.join(','))

  await page.click('text=Sign in with Keycloak')
  await page.waitForSelector('#username')
  check('login redirects to Keycloak', page.url().startsWith(KC + '/realms/mlw/'))
  await page.fill('#username', USER)
  await page.fill('#password', 'wrong')
  await page.click('#kc-login')
  check('wrong password shows an error', (await page.waitForSelector('text=Invalid username or password').catch(() => null)) !== null)

  await page.fill('#password', PASS)
  await page.click('#kc-login')
  await page.waitForSelector('.side li button', { timeout: 15000 })
  check('signed in: tables are listed', (await page.locator('.side li button').count()) > 20)
  check('user name is shown', (await page.locator('.side .user span').innerText()) === USER)
  check('page is restored after login (#shot)', (await page.locator('h2:text-is("shot")').count()) === 1 && page.url().endsWith('#shot'))
  check('API calls after login succeed', apiStatuses.length > 0 && apiStatuses.every((s) => s === 200), apiStatuses.join(','))

  await page.reload()
  await page.waitForSelector('.side li button')
  check('a reload keeps the session', (await page.locator('.side .user').count()) === 1)

  // "Try it out" in the API documentation uses the login
  await page.click('text=API documentation')
  await page.waitForSelector('.swagger-ui .opblock-tag', { timeout: 20000 })
  await page.click('.opblock-tag[data-tag="Service"]')
  let sent = ''
  page.on('request', (r) => { if (r.url().endsWith('/api/v1/tables')) sent = r.headers().authorization || '' })
  await page.locator('.opblock-summary-path[data-path="/tables"]').first().click()
  await page.click('.opblock.is-open .execute')
  await page.waitForTimeout(1500)
  check('API documentation "Try it out" sends the access token', sent.startsWith('Bearer ey'))

  // an access token the API refuses sends the user back to the login page
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) {
      const v = JSON.parse(sessionStorage.getItem(k))
      if (v && v.access_token) { v.access_token = v.access_token.slice(0, -3) + 'xxx'; sessionStorage.setItem(k, JSON.stringify(v)) }
    }
  })
  await page.reload()
  await page.click('.side li button >> nth=0').catch(() => {})
  check('a refused token returns to the login page', (await page.waitForSelector('text=Sign in with Keycloak', { timeout: 15000 }).catch(() => null)) !== null)

  // sign out ends the Keycloak session
  await page.click('text=Sign in with Keycloak')
  await page.waitForSelector('.side li button, #username', { timeout: 15000 })
  if (await page.locator('#username').count()) { // the refused token did not end the session, so SSO signs in again
    check('Keycloak asked for credentials', true)
    await page.fill('#username', USER); await page.fill('#password', PASS); await page.click('#kc-login')
    await page.waitForSelector('.side li button', { timeout: 15000 })
  }
  await page.click('text=Sign out')
  await page.waitForSelector('text=Sign in with Keycloak', { timeout: 15000 })
  await page.click('text=Sign in with Keycloak')
  check('after sign out Keycloak asks for the password again', (await page.waitForSelector('#username', { timeout: 15000 }).catch(() => null)) !== null)

  check('no JavaScript errors in the page', pageErrors.length === 0, pageErrors.join('; '))
} finally {
  await browser.close()
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
