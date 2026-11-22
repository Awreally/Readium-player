import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import { createAudioPlayer } from './features/audio-player/useAudioPlayer'

createApp(App).use(createAudioPlayer()).mount('#app')
