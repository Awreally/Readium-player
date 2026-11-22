<script setup lang="ts">
import { computed, watch } from 'vue'
import { formatTime, formatTimeSpoken } from './formatTime'
import { useAudioPlayer } from './useAudioPlayer'

const player = useAudioPlayer()
const state = player.state

const elapsed = computed(() => formatTime(state.value.currentTime))
const total = computed(() => formatTime(state.value.duration))
const spokenTime = computed(
  () => `${formatTimeSpoken(state.value.currentTime)} av ${formatTimeSpoken(state.value.duration)}`,
)

let returnFocusTo: HTMLElement | null = null

watch(
  () => state.value.status,
  (status, previous) => {
    if (previous === 'idle' && status !== 'idle' && document.activeElement instanceof HTMLElement) {
      returnFocusTo = document.activeElement
    }
  },
)

function close() {
  player.close()
  if (returnFocusTo?.isConnected) returnFocusTo.focus()
  returnFocusTo = null
}
</script>

<template>
  <div class="audio-player">
    <p role="status" class="audio-player__status">
      {{ state.status === 'loading' ? 'Laddar ljudboken…' : '' }}
    </p>

    <div v-if="state.status === 'error'" class="audio-player__panel">
      <p role="alert">{{ state.loadError }}</p>
      <button type="button" @click="close">Stäng</button>
    </div>

    <section
      v-if="state.status === 'ready'"
      class="audio-player__panel"
      aria-labelledby="audio-player-heading"
    >
      <h2 id="audio-player-heading">{{ state.bookTitle }}</h2>
      <p v-if="state.trackTitle">{{ state.trackTitle }}</p>
      <p>
        <span aria-hidden="true">{{ elapsed }} / {{ total }}</span>
        <span class="visually-hidden">{{ spokenTime }}</span>
      </p>
      <p v-if="state.playbackError" role="alert">{{ state.playbackError }}</p>

      <div class="audio-player__controls">
        <button type="button" @click="player.togglePlay()">
          {{ state.isPlaying ? 'Pausa' : 'Spela' }}
        </button>
        <button type="button" @click="close">Stäng spelaren</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.audio-player__status:empty {
  margin: 0;
}

.audio-player__panel {
  border: 1px solid currentColor;
  border-radius: 0.5rem;
  padding: 1rem;
}

.audio-player__panel h2 {
  margin-top: 0;
}

.audio-player__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
