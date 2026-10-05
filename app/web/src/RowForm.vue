<script setup>
import { computed, reactive, ref } from 'vue'

// Create or edit one row. The fields come from the table's column metadata.
const props = defineProps({
  table: { type: Object, required: true },
  row: { type: Object, default: null }, // null: create a new row
})
const emit = defineEmits(['save', 'cancel'])

const editing = computed(() => props.row !== null)
const isKey = (c) => c.kind === 'partition_key' || c.kind === 'clustering'
const isList = (c) => /^(list|set)</.test(c.type)

function toField(c, v) {
  if (v === null || v === undefined) return ''
  if (isList(c)) return (v || []).join('\n')
  return String(v)
}
const fields = reactive(Object.fromEntries(props.table.columns.map((c) => [c.name, toField(c, props.row?.[c.name])])))
const original = { ...fields }
const error = ref('')

// Convert the text of a field to a JSON value; '' means null.
function toValue(c, text) {
  if (isList(c)) {
    const items = text.split('\n').map((s) => s.trim()).filter(Boolean)
    return /<int>/.test(c.type) ? items.map(Number) : items
  }
  if (text === '') return null
  if (/^(int|smallint|tinyint|bigint)$/.test(c.type)) {
    if (!/^-?\d+$/.test(text)) throw new Error(`${c.name} must be an integer`)
    return Number(text)
  }
  if (/^(float|double)$/.test(c.type)) {
    if (Number.isNaN(Number(text))) throw new Error(`${c.name} must be a number`)
    return Number(text)
  }
  if (c.type === 'boolean') return text === 'true'
  return text
}

function save() {
  error.value = ''
  try {
    const body = {}
    for (const c of props.table.columns) {
      if (editing.value) {
        if (isKey(c) || fields[c.name] === original[c.name]) continue
        body[c.name] = toValue(c, fields[c.name])
      } else {
        const v = toValue(c, fields[c.name])
        if (v !== null && !(Array.isArray(v) && v.length === 0)) body[c.name] = v
      }
    }
    if (editing.value && Object.keys(body).length === 0) throw new Error('nothing changed')
    emit('save', body)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="modal" @keydown.esc="emit('cancel')">
    <form class="dialog" @submit.prevent="save">
      <h3>{{ editing ? 'Edit' : 'New' }} {{ table.name }} row</h3>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-for="c in table.columns" :key="c.name" class="field">
        <label :for="'f-' + c.name">
          {{ c.name }} <code>{{ c.type }}</code>
          <span v-if="c.kind !== 'regular'"> · {{ c.kind.replace('_', ' ') }}</span>
        </label>
        <select v-if="c.type === 'boolean'" :id="'f-' + c.name" v-model="fields[c.name]">
          <option value="">(not set)</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <textarea v-else-if="isList(c)" :id="'f-' + c.name" v-model="fields[c.name]" rows="3" />
        <input v-else :id="'f-' + c.name" v-model="fields[c.name]" :disabled="editing && isKey(c)"
               :placeholder="c.type === 'timestamp' ? '2026-10-05T12:00:00Z' : ''" autocomplete="off" />
        <div v-if="isList(c)" class="hint">One item per line.</div>
      </div>
      <div class="row">
        <button type="button" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>
  </div>
</template>
