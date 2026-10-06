<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { getToken } from './api.js'

// Interactive API documentation. The Swagger UI code is large, so it is only
// loaded when this page is opened.
const root = ref(null)
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    const [{ default: SwaggerUIBundle }] = await Promise.all([
      import('swagger-ui-dist/swagger-ui-bundle.js'),
      import('swagger-ui-dist/swagger-ui.css'),
    ])
    SwaggerUIBundle({
      url: '/api/v1/openapi.yaml',
      domNode: root.value,
      deepLinking: false, // the URL hash is used by this application
      docExpansion: 'none',
      defaultModelsExpandDepth: -1,
      tryItOutEnabled: true,
      // use the token entered in this application, so there is no need to authorize again
      requestInterceptor: (req) => {
        const token = getToken()
        if (token && !req.headers.Authorization) req.headers.Authorization = 'Bearer ' + token
        return req
      },
      onComplete: () => { loading.value = false },
    })
  } catch (e) {
    error.value = 'Could not load the API documentation: ' + e.message
    loading.value = false
  }
})
onBeforeUnmount(() => { if (root.value) root.value.innerHTML = '' })
</script>

<template>
  <div>
    <h2>API documentation</h2>
    <div class="path">
      OpenAPI 3.0 · <a href="/api/v1/openapi.yaml" target="_blank" rel="noopener">openapi.yaml</a>
      · requests from “Try it out” go to this server and use the API token entered in this page
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="empty">Loading…</div>
    <div ref="root" class="swagger-wrap"></div>
  </div>
</template>

<style>
/* Swagger UI has no dark theme, so it is shown on a light panel. */
.swagger-wrap { background: #fff; color: #3b4151; border-radius: 8px; padding: 0 12px 12px; }
.swagger-wrap .swagger-ui .topbar { display: none; }
.swagger-wrap .swagger-ui .info { margin: 20px 0; }
.swagger-wrap .swagger-ui input, .swagger-wrap .swagger-ui select, .swagger-wrap .swagger-ui textarea { color: #3b4151; background: #fff; width: auto; }
.swagger-wrap .swagger-ui button { color: inherit; }
</style>
