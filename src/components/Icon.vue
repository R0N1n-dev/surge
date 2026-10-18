<script setup>
/**
 * <Icon name="download" :size="20" />
 *
 * A single `<use>` into the injected SVG sprite. No per-icon components, no
 * icon font: one symbol table, one stroke weight everywhere, and tree-shaking
 * costs nothing because unused symbols are just unused `<symbol>` nodes.
 */
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
  /** Extra class, e.g. 'icon--filled' for solid variants. */
  cls: { type: String, default: '' },
  label: { type: String, default: '' },
});
</script>

<template>
  <svg
    class="icon"
    :class="cls"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :aria-hidden="label ? null : true"
    :role="label ? 'img' : null"
    focusable="false"
  >
    <title v-if="label">{{ label }}</title>
    <use :href="`#i-${name}`" />
  </svg>
</template>
