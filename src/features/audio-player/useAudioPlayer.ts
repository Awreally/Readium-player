import { inject, readonly, shallowRef, type App, type InjectionKey, type Ref } from 'vue'
import { AudioPlayerController, type AudioPlayerState } from './AudioPlayerController'

export interface AudioPlayer {
  readonly state: Readonly<Ref<AudioPlayerState>>
  open(manifestUrl: string): Promise<void>
  play(): void
  pause(): void
  togglePlay(): void
  close(): void
}

const audioPlayerKey: InjectionKey<AudioPlayer> = Symbol('audio-player')

/**
 * Creates the app-wide audio player. Install it once with `app.use()` so playback survives
 * route changes and components mounting or unmounting.
 */
export function createAudioPlayer(controller = new AudioPlayerController()) {
  const state = shallowRef(controller.state)
  controller.subscribe((next) => {
    state.value = next
  })

  const player: AudioPlayer = {
    state: readonly(state),
    open: (url) => controller.open(url),
    play: () => controller.play(),
    pause: () => controller.pause(),
    togglePlay: () => controller.togglePlay(),
    close: () => controller.close(),
  }

  return {
    ...player,
    install(app: App) {
      app.provide(audioPlayerKey, player)
    },
  }
}

export function useAudioPlayer(): AudioPlayer {
  const player = inject(audioPlayerKey)
  if (!player) {
    throw new Error('useAudioPlayer() requires createAudioPlayer() to be installed with app.use()')
  }
  return player
}
