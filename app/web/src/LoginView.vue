<script setup>
import { auth, login } from './auth.js'
</script>

<template>
  <div class="login">
    <h1>MLW Database</h1>
    <p>Sign in to continue.</p>
    <div v-if="auth.error" class="error">{{ auth.error }}</div>
    <button class="primary" @click="login">Sign in with Keycloak</button>
  </div>
</template>
