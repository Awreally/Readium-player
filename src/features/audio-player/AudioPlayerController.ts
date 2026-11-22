import { AudioNavigator, type AudioNavigatorListeners } from '@readium/navigator'
import type { Publication } from '@readium/shared'
import {
  loadPublication as defaultLoadPublication,
  PublicationLoadError,
  type LoadPublicationOptions,
} from '@/shared/publication/loadPublication'

export type AudioPlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AudioPlayerState {
  status: AudioPlayerStatus
  bookTitle?: string
  trackTitle?: string
  isPlaying: boolean
  currentTime: number
  duration: number
  /** Set when status is 'error': the book could not be opened. */
  loadError?: string
  /** Set when the book is open but playback failed, e.g. a track could not be fetched. */
  playbackError?: string
}

export type PlayerNavigator = Pick<
  AudioNavigator,
  'play' | 'pause' | 'destroy' | 'currentTime' | 'duration' | 'currentLocator'
>

export type NavigatorFactory = (
  publication: Publication,
  listeners: Partial<AudioNavigatorListeners>,
) => PlayerNavigator

export interface AudioPlayerDependencies {
  loadPublication: (url: string, options: LoadPublicationOptions) => Promise<Publication>
  createNavigator: NavigatorFactory
}

const IDLE_STATE: AudioPlayerState = Object.freeze({
  status: 'idle',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
})

// AudioNavigator fills in no-op defaults for listeners that are not provided.
const createAudioNavigator: NavigatorFactory = (publication, listeners) =>
  new AudioNavigator(publication, listeners as AudioNavigatorListeners)

export function loadErrorMessage(error: unknown): string {
  if (error instanceof PublicationLoadError) {
    switch (error.kind) {
      case 'network':
        return 'Ljudboken kunde inte hämtas. Kontrollera din internetanslutning och försök igen.'
      case 'http':
        return error.status === 401 || error.status === 403
          ? 'Du har inte behörighet till den här ljudboken.'
          : 'Ljudboken kunde inte hämtas. Försök igen om en stund.'
      case 'invalid-json':
      case 'invalid-manifest':
        return 'Ljudboken kunde inte öppnas eftersom den verkar vara trasig.'
    }
  }
  return 'Ljudboken kunde inte öppnas.'
}

/**
 * Owns one audiobook session at a time: loading, the Readium navigator, playback state and
 * cleanup. Framework-free; UI layers subscribe to state changes.
 */
export class AudioPlayerController {
  private readonly deps: AudioPlayerDependencies
  private readonly listeners = new Set<(state: AudioPlayerState) => void>()
  private _state: AudioPlayerState = IDLE_STATE
  private navigator: PlayerNavigator | undefined
  private abortController: AbortController | undefined
  /** Incremented on every open/close so callbacks from a previous session can be ignored. */
  private session = 0

  constructor(deps: Partial<AudioPlayerDependencies> = {}) {
    this.deps = {
      loadPublication: deps.loadPublication ?? defaultLoadPublication,
      createNavigator: deps.createNavigator ?? createAudioNavigator,
    }
  }

  get state(): AudioPlayerState {
    return this._state
  }

  subscribe(listener: (state: AudioPlayerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async open(manifestUrl: string): Promise<void> {
    const session = this.reset()
    const abortController = new AbortController()
    this.abortController = abortController
    this.setState({ ...IDLE_STATE, status: 'loading' })

    let publication: Publication
    try {
      publication = await this.deps.loadPublication(manifestUrl, {
        signal: abortController.signal,
      })
    } catch (error) {
      if (session !== this.session) return
      this.setState({ ...IDLE_STATE, status: 'error', loadError: loadErrorMessage(error) })
      return
    }
    if (session !== this.session) return

    const ifCurrent =
      <Args extends unknown[]>(handler: (...args: Args) => void) =>
      (...args: Args) => {
        if (session === this.session) handler(...args)
      }

    const firstTrack = publication.readingOrder.items[0]
    this.update({
      bookTitle: publication.metadata.title.getTranslation(),
      trackTitle: firstTrack?.title,
      duration: firstTrack?.duration ?? 0,
    })

    // The navigator ignores play/pause until its first track has loaded, so the player is
    // only reported ready (and its controls shown) once trackLoaded fires.
    this.navigator = this.deps.createNavigator(publication, {
      trackLoaded: ifCurrent(() => {
        if (this._state.status === 'loading') this.update({ status: 'ready' })
      }),
      play: ifCurrent(() => this.update({ isPlaying: true, playbackError: undefined })),
      pause: ifCurrent(() => this.update({ isPlaying: false })),
      positionChanged: ifCurrent((locator) =>
        this.update({
          currentTime: this.navigator?.currentTime ?? this._state.currentTime,
          trackTitle: locator.title,
        }),
      ),
      metadataLoaded: ifCurrent((metadata) => this.update({ duration: metadata.duration })),
      trackEnded: ifCurrent(() => this.update({ isPlaying: false })),
      error: ifCurrent(() => {
        if (this._state.status === 'loading') {
          this.reset()
          this.setState({
            ...IDLE_STATE,
            status: 'error',
            loadError: 'Ljudet i ljudboken kunde inte laddas. Försök igen om en stund.',
          })
          return
        }
        this.update({ isPlaying: false, playbackError: 'Ljudet kunde inte spelas upp.' })
      }),
    })
  }

  play(): void {
    this.navigator?.play()
  }

  pause(): void {
    this.navigator?.pause()
  }

  togglePlay(): void {
    if (this._state.isPlaying) this.pause()
    else this.play()
  }

  close(): void {
    this.reset()
    this.setState(IDLE_STATE)
  }

  private reset(): number {
    this.session++
    this.abortController?.abort()
    this.abortController = undefined
    this.navigator?.destroy()
    this.navigator = undefined
    return this.session
  }

  private update(patch: Partial<AudioPlayerState>): void {
    this.setState({ ...this._state, ...patch })
  }

  private setState(state: AudioPlayerState): void {
    this._state = state
    for (const listener of this.listeners) listener(state)
  }
}
