<script setup lang="ts">
import AudioPlayer from '@/features/audio-player/AudioPlayer.vue'
import { useAudioPlayer } from '@/features/audio-player/useAudioPlayer'

const TEST_BOOK_URL = 'https://readium.org/webpub-manifest/examples/Flatland/manifest.json'

const player = useAudioPlayer()
</script>

<template>
  <main>
    <h1>Readium-player</h1>
    <button type="button" @click="player.open(TEST_BOOK_URL)">Öppna testboken Flatland</button>
  </main>

  <AudioPlayer />
</template>
