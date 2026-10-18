<script setup>
/**
 * App-level overlays: snackbar, confirm dialog and the bottom-sheet host.
 * Mounted once in App.vue so any view can raise them through the ui store
 * without owning the markup.
 */
import { computed } from 'vue';
import Icon from './Icon.vue';
import { useUiStore } from '@/stores/ui.js';

const ui = useUiStore();

const snackVisible = computed(() => !!ui.snack);
const dialogOpen = computed(() => !!ui.dialog);

const TONE_ICON = { default: 'info', error: 'alert', success: 'check-circle' };
</script>

<template>
  <!-- ------------------------------------------------------------ snackbar -- -->
  <div class="snackbar" :class="{ 'is-visible': snackVisible }" role="status" aria-live="polite">
    <Icon v-if="ui.snack" :name="TONE_ICON[ui.snack.tone] ?? 'info'" :size="20" />
    <span class="grow truncate">{{ ui.snack?.message }}</span>
    <button v-if="ui.snack?.action" class="snackbar__action" @click="ui.runAction()">
      {{ ui.snack.action }}
    </button>
  </div>

  <!-- ------------------------------------------------------------- dialog -- -->
  <div v-if="dialogOpen" class="scrim is-visible" @click="ui.resolveDialog(false)"></div>
  <div v-if="dialogOpen" class="dialog is-open" role="alertdialog" aria-modal="true" :aria-label="ui.dialog.title">
    <h2 class="dialog__title">{{ ui.dialog.title }}</h2>
    <p class="dialog__body">{{ ui.dialog.body }}</p>
    <div class="dialog__actions">
      <button class="btn btn--text" @click="ui.resolveDialog(false)">
        {{ ui.dialog.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        class="btn"
        :class="ui.dialog.tone === 'danger' ? 'btn--danger' : 'btn--filled'"
        @click="ui.resolveDialog(true)"
      >
        {{ ui.dialog.confirmLabel ?? 'Confirm' }}
      </button>
    </div>
  </div>
</template>
