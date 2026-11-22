import { describe, expect, it, vi } from 'vitest'
import type { AudioNavigatorListeners } from '@readium/navigator'
import { Locator, Manifest, Publication } from '@readium/shared'
import { PublicationLoadError } from '@/shared/publication/loadPublication'
import {
  AudioPlayerController,
  type AudioPlayerDependencies,
  type AudioPlayerState,
  type PlayerNavigator,
} from '../AudioPlayerController'

type LoadPublication = AudioPlayerDependencies['loadPublication']

function makePublication(title = 'Flatland'): Publication {
  const manifest = Manifest.deserialize({
    metadata: { title },
    readingOrder: [
      { href: 'track1.mp3', type: 'audio/mpeg', duration: 1371, title: 'Part 1' },
      { href: 'track2.mp3', type: 'audio/mpeg', duration: 1669, title: 'Part 2' },
    ],
  })!
  return new Publication({ manifest })
}

class FakeNavigator implements PlayerNavigator {
  currentTime = 0
  duration = 1371
  currentLocator = new Locator({ href: 'track1.mp3', type: 'audio/mpeg', title: 'Part 1' })
  play = vi.fn<() => void>()
  pause = vi.fn<() => void>()
  destroy = vi.fn<() => void>()

  constructor(readonly listeners: Partial<AudioNavigatorListeners>) {}

  emitTrackLoaded() {
    this.listeners.trackLoaded?.({} as HTMLMediaElement)
  }
  emitPlay() {
    this.listeners.play?.(this.currentLocator)
  }
  emitPause() {
    this.listeners.pause?.(this.currentLocator)
  }
  emitPosition(time: number, title = 'Part 1') {
    this.currentTime = time
    this.currentLocator = new Locator({ href: 'track1.mp3', type: 'audio/mpeg', title })
    this.listeners.positionChanged?.(this.currentLocator)
  }
  emitError() {
    this.listeners.error?.(new Error('decode failed'), this.currentLocator)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(loadPublication = vi.fn<LoadPublication>(async () => makePublication())) {
  const navigators: FakeNavigator[] = []
  const controller = new AudioPlayerController({
    loadPublication,
    createNavigator: (_pub, listeners) => {
      const nav = new FakeNavigator(listeners)
      navigators.push(nav)
      return nav
    },
  })
  /** Opens a book and lets the fake navigator finish loading its first track. */
  async function openReady(url = 'https://example.org/manifest.json') {
    await controller.open(url)
    navigators.at(-1)?.emitTrackLoaded()
    return navigators.at(-1)!
  }
  return { controller, navigators, loadPublication, openReady }
}

describe('AudioPlayerController', () => {
  it('starts idle', () => {
    const { controller } = setup()

    expect(controller.state.status).toBe('idle')
  })

  it('stays loading until the navigator has loaded the first track', async () => {
    const { controller, navigators } = setup()

    await controller.open('https://example.org/manifest.json')

    expect(controller.state).toMatchObject({ status: 'loading', bookTitle: 'Flatland' })

    navigators[0]!.emitTrackLoaded()
    expect(controller.state.status).toBe('ready')
  })

  it('does not go back to ready when later tracks load', async () => {
    const { controller, openReady } = setup()
    const nav = await openReady()
    controller.close()

    nav.emitTrackLoaded()

    expect(controller.state.status).toBe('idle')
  })

  it('shows a load error when the first track cannot be loaded', async () => {
    const { controller, navigators } = setup()
    await controller.open('https://example.org/manifest.json')
    const nav = navigators[0]!

    nav.emitError()

    expect(controller.state.status).toBe('error')
    expect(controller.state.loadError).toBeTruthy()
    expect(nav.destroy).toHaveBeenCalledOnce()
  })

  it('goes through loading to ready with book and track info', async () => {
    const { controller, openReady } = setup()
    const statuses: string[] = []
    controller.subscribe((s) => statuses.push(s.status))

    await openReady()

    expect(statuses).toEqual(['loading', 'loading', 'ready'])
    expect(controller.state).toMatchObject({
      status: 'ready',
      bookTitle: 'Flatland',
      trackTitle: 'Part 1',
      duration: 1371,
      isPlaying: false,
    })
  })

  it('passes an abort signal to the loader', async () => {
    const { controller, loadPublication } = setup()

    await controller.open('https://example.org/manifest.json')

    expect(loadPublication).toHaveBeenCalledWith('https://example.org/manifest.json', {
      signal: expect.any(AbortSignal),
    })
  })

  it('follows play, pause and position events from the navigator', async () => {
    const { controller, openReady } = setup()
    const nav = await openReady()

    nav.emitPlay()
    expect(controller.state.isPlaying).toBe(true)

    nav.emitPosition(42, 'Part 2')
    expect(controller.state).toMatchObject({ currentTime: 42, trackTitle: 'Part 2' })

    nav.emitPause()
    expect(controller.state.isPlaying).toBe(false)
  })

  it('togglePlay calls play when paused and pause when playing', async () => {
    const { controller, openReady } = setup()
    const nav = await openReady()

    controller.togglePlay()
    expect(nav.play).toHaveBeenCalledOnce()

    nav.emitPlay()
    controller.togglePlay()
    expect(nav.pause).toHaveBeenCalledOnce()
  })

  it('does nothing when play is called before a book is open', () => {
    const { controller } = setup()

    expect(() => controller.play()).not.toThrow()
    expect(controller.state.status).toBe('idle')
  })

  it('shows a playback error and stops playing when the navigator reports an error', async () => {
    const { controller, openReady } = setup()
    const nav = await openReady()
    nav.emitPlay()

    nav.emitError()

    expect(controller.state).toMatchObject({ status: 'ready', isPlaying: false })
    expect(controller.state.playbackError).toBeTruthy()

    nav.emitPlay()
    expect(controller.state.playbackError).toBeUndefined()
  })

  it('shows a load error message when the manifest cannot be loaded', async () => {
    const { controller } = setup(
      vi.fn<LoadPublication>(async () => {
        throw new PublicationLoadError('http', 'nope', { status: 403 })
      }),
    )

    await controller.open('https://example.org/manifest.json')

    expect(controller.state.status).toBe('error')
    expect(controller.state.loadError).toBe('Du har inte behörighet till den här ljudboken.')
  })

  it('destroys the navigator and returns to idle on close', async () => {
    const { controller, navigators } = setup()
    await controller.open('https://example.org/manifest.json')

    controller.close()

    expect(navigators[0]!.destroy).toHaveBeenCalledOnce()
    expect(controller.state.status).toBe('idle')
  })

  it('destroys the previous navigator when another book is opened', async () => {
    const { controller, navigators } = setup()
    await controller.open('https://example.org/a.json')

    await controller.open('https://example.org/b.json')

    expect(navigators).toHaveLength(2)
    expect(navigators[0]!.destroy).toHaveBeenCalledOnce()
    expect(navigators[1]!.destroy).not.toHaveBeenCalled()
  })

  it('ignores events from a navigator that has been replaced', async () => {
    const { controller, navigators } = setup()
    await controller.open('https://example.org/a.json')
    const oldNav = navigators[0]!
    await controller.open('https://example.org/b.json')

    oldNav.emitPlay()
    oldNav.emitPosition(999, 'Stale')

    expect(controller.state).toMatchObject({ isPlaying: false, currentTime: 0 })
    expect(controller.state.trackTitle).not.toBe('Stale')
  })

  it('aborts a slow load and never creates its navigator when another book is opened', async () => {
    const slow = deferred<Publication>()
    const signals: AbortSignal[] = []
    const loadPublication = vi.fn<LoadPublication>(async (url, { signal }) => {
      signals.push(signal!)
      return url.endsWith('slow.json') ? slow.promise : makePublication('Fast book')
    })
    const { controller, navigators } = setup(loadPublication)

    const slowOpen = controller.open('https://example.org/slow.json')
    await controller.open('https://example.org/fast.json')
    slow.resolve(makePublication('Slow book'))
    await slowOpen

    expect(signals[0]!.aborted).toBe(true)
    expect(navigators).toHaveLength(1)
    expect(controller.state.bookTitle).toBe('Fast book')
  })

  it('does not show an error when a load fails after the player was closed', async () => {
    const slow = deferred<Publication>()
    const { controller } = setup(vi.fn<LoadPublication>(() => slow.promise))

    const opening = controller.open('https://example.org/manifest.json')
    controller.close()
    slow.reject(new DOMException('Aborted', 'AbortError'))
    await opening

    expect(controller.state.status).toBe('idle')
  })

  it('stops notifying a listener after it unsubscribes', async () => {
    const { controller } = setup()
    const listener = vi.fn<(state: AudioPlayerState) => void>()
    const unsubscribe = controller.subscribe(listener)

    unsubscribe()
    await controller.open('https://example.org/manifest.json')

    expect(listener).not.toHaveBeenCalled()
  })
})
