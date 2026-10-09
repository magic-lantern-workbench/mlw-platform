<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { api, ApiError, getToken, setToken } from './api.js'
import RowForm from './RowForm.vue'
import LoginView from './LoginView.vue'
import { auth, initAuth, loginAccepted, logout, markLoginAccepted, userName } from './auth.js'

const SwaggerView = defineAsyncComponent(() => import('./SwaggerView.vue'))

const keyspace = ref('')
const tables = ref([])
const filter = ref('')
const current = ref(null)
const keyInputs = ref([])
const rows = ref([])
const pageStack = ref([]) // page states of the pages before the current one
const nextState = ref(null)
const pageState = ref(null)
const limit = ref(50)
const loading = ref(false)
const error = ref('')
const needToken = ref(false)
const tokenInput = ref(getToken())
const form = ref(null) // { row } while the form is open
const view = ref(location.hash === '#api-docs' ? 'api' : 'tables') // 'tables' or 'api'

const visible = computed(() => tables.value.filter((t) => t.name.includes(filter.value.trim())))
const keyCols = computed(() => (current.value ? [...current.value.partitionKey, ...current.value.clusteringKey] : []))
const columns = computed(() => current.value?.columns ?? [])
const isKey = (c) => keyCols.value.includes(c.name)

function fail(e) {
  if (e instanceof ApiError && e.status === 401 && auth.enabled) {
    // The API refused the access token. If it never accepted this login, the account has no access
    // (for example it lacks the required role); otherwise the session has ended.
    auth.user = null
    auth.error = loginAccepted()
      ? 'Your session has ended. Sign in again.'
      : 'Your account does not provide access. Contact your system administrator for details.'
  } else if (e instanceof ApiError && e.status === 401) {
    needToken.value = true
    error.value = 'This server needs an API token.'
  } else {
    error.value = e.message
  }
}

async function loadTables() {
  try {
    const r = await api.tables()
    keyspace.value = r.keyspace
    tables.value = r.tables
    markLoginAccepted()
    needToken.value = false
    error.value = ''
    const wanted = decodeURIComponent(location.hash.slice(1))
    const t = r.tables.find((x) => x.name === wanted)
    if (t && !current.value && view.value === 'tables') select(t)
  } catch (e) { fail(e) }
}

function saveToken() {
  setToken(tokenInput.value.trim())
  loadTables()
}

function showApi() {
  view.value = 'api'
  try { history.replaceState(null, '', '#api-docs') } catch { /* ignore */ }
}

function select(t) {
  view.value = 'tables'
  current.value = t
  keyInputs.value = keyCols.value.map(() => '')
  rows.value = []
  pageStack.value = []
  pageState.value = null
  nextState.value = null
  error.value = ''
  try { history.replaceState(null, '', '#' + t.name) } catch { /* ignore */ }
  load()
}

// The leading key inputs that are filled in form the key prefix of the query.
function prefix() {
  const out = []
  for (const v of keyInputs.value) {
    if (v === '') break
    out.push(v)
  }
  return out
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const keys = prefix()
    if (keys.length > 0 && keys.length < current.value.partitionKey.length) {
      throw new Error(`Fill in all partition key values (${current.value.partitionKey.join(', ')}), or leave every key empty to scan.`)
    }
    let r
    if (keys.length === keyCols.value.length) {
      // a full key addresses one row, which the API returns on its own
      const row = await api.list(current.value.name, keys, 1).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      })
      r = { items: row ? [row] : [], nextPageState: null }
    } else {
      r = await api.list(current.value.name, keys, limit.value, pageState.value)
    }
    rows.value = r.items
    nextState.value = r.nextPageState
  } catch (e) { rows.value = []; fail(e) } finally { loading.value = false }
}

function search() {
  pageStack.value = []
  pageState.value = null
  load()
}
function next() {
  pageStack.value.push(pageState.value)
  pageState.value = nextState.value
  load()
}
function prev() {
  pageState.value = pageStack.value.pop() ?? null
  load()
}

const rowKey = (row) => keyCols.value.map((k) => row[k])

async function save(body) {
  try {
    if (form.value.row) await api.patch(current.value.name, rowKey(form.value.row), body)
    else await api.create(current.value.name, body)
    form.value = null
    await load()
  } catch (e) { fail(e) }
}

async function remove(row) {
  if (!window.confirm(`Delete this row?\n\n${keyCols.value.map((k) => `${k}: ${row[k]}`).join('\n')}`)) return
  try {
    await api.remove(current.value.name, rowKey(row))
    await load()
  } catch (e) { fail(e) }
}

function show(v) {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return String(v)
}
const isNull = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0)

onMounted(async () => {
  await initAuth()
  if (!auth.enabled || auth.user) await loadTables()
})
// the login page is shown when the user signs out or the session ends; load the tables after signing in
watch(() => auth.user, (u, old) => { if (u && !old && tables.value.length === 0) loadTables() })
</script>

<template>
  <div v-if="!auth.ready" class="empty">Loading…</div>
  <LoginView v-else-if="auth.enabled && !auth.user" />
  <div v-else class="layout">
    <aside class="side">
      <h1>MLW Database</h1>
      <div class="ks">keyspace <code>{{ keyspace || '…' }}</code></div>
      <div v-if="auth.enabled" class="user">
        <span>{{ userName() }}</span>
        <button @click="logout">Sign out</button>
      </div>
      <button class="nav" :class="{ on: view === 'api' }" @click="showApi">API documentation</button>
      <input v-model="filter" placeholder="Filter tables" />
      <ul>
        <li v-for="t in visible" :key="t.name">
          <button :class="{ on: view === 'tables' && current && current.name === t.name }" @click="select(t)">
            {{ t.name }}<span v-if="t.readOnly" class="badge">read-only</span>
          </button>
        </li>
      </ul>
    </aside>

    <main class="main">
      <div v-if="error" class="error">{{ error }}</div>
      <form v-if="needToken" class="auth" @submit.prevent="saveToken">
        <input v-model="tokenInput" type="password" placeholder="API token" autocomplete="off" />
        <button class="primary" type="submit">Use token</button>
      </form>

      <SwaggerView v-if="view === 'api'" />
      <div v-else-if="!current" class="empty">Choose a table.</div>
      <template v-else>
        <h2>{{ current.name }}</h2>
        <div class="path">
          <code>{{ current.path }}</code>
          <span v-if="current.readOnly"> · kept in sync from <code>{{ current.derivedFrom }}</code>, read-only</span>
        </div>

        <form class="keys" @submit.prevent="search">
          <label v-for="(k, i) in keyCols" :key="k">
            {{ k }}{{ current.partitionKey.includes(k) ? ' (partition)' : '' }}
            <input v-model="keyInputs[i]" autocomplete="off" />
          </label>
          <button type="submit">Load</button>
        </form>

        <div class="bar">
          <button :disabled="pageStack.length === 0 || loading" @click="prev">← Previous</button>
          <button :disabled="!nextState || loading" @click="next">Next →</button>
          <span>{{ rows.length }} rows<span v-if="loading"> · loading…</span></span>
          <span class="spacer" />
          <button v-if="!current.readOnly" class="primary" @click="form = { row: null }">New row</button>
        </div>

        <div class="grid-wrap">
          <table>
            <thead>
              <tr>
                <th v-if="!current.readOnly"></th>
                <th v-for="c in columns" :key="c.name" :class="{ key: isKey(c) }" :title="c.type + ' · ' + c.kind">{{ c.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i">
                <td v-if="!current.readOnly" class="actions">
                  <button @click="form = { row }">Edit</button>
                  <button class="danger" @click="remove(row)">Delete</button>
                </td>
                <td v-for="c in columns" :key="c.name" :class="{ null: isNull(row[c.name]) }" :title="show(row[c.name])">{{ show(row[c.name]) }}</td>
              </tr>
              <tr v-if="rows.length === 0 && !loading">
                <td :colspan="columns.length + 1" class="empty">
                  {{ current.partitionKey.length ? 'No rows. Fill in the partition key to load a partition, or leave the key empty to scan the table.' : 'No rows.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </main>

    <RowForm v-if="form" :table="current" :row="form.row" @save="save" @cancel="form = null" />
  </div>
</template>
