import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h } from 'vue'
import type { AudioNavigatorListeners } from '@readium/navigator'
import { Locator, Manifest, Publication } from '@readium/shared'
import { PublicationLoadError } from '@/shared/publication/loadPublication'
import AudioPlayer from '../AudioPlayer.vue'
import { AudioPlayerController } from '../AudioPlayerController'
import { createAudioPlayer, useAudioPlayer } from '../useAudioPlayer'

function makePublication() {
  const manifest = Manifest.deserialize({
    metadata: { title: 'Flatland' },
    readingOrder: [{ href: 't1.mp3', type: 'audio/mpeg', duration: 3725, title: 'Part 1' }],
  })!
  return new Publication({ manifest })
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

function setup(loadPublication: () => Promise<Publication> = async () => makePublication()) {
  let listeners: Partial<AudioNavigatorListeners> = {}
  const navigator = {
    currentTime: 0,
    duration: 3725,
    currentLocator: new Locator({ href: 't1.mp3', type: 'audio/mpeg', title: 'Part 1' }),
    play: vi.fn<() => void>(() => listeners.play?.(navigator.currentLocator)),
    pause: vi.fn<() => void>(() => listeners.pause?.(navigator.currentLocator)),
    destroy: vi.fn<() => void>(),
  }
  const controller = new AudioPlayerController({
    loadPublication,
    createNavigator: (_pub, l) => {
      listeners = l
      queueMicrotask(() => l.trackLoaded?.({} as HTMLMediaElement))
      return navigator
    },
  })
  const player = createAudioPlayer(controller)

  const Host = defineComponent(() => {
    const { open } = useAudioPlayer()
    return () => [
      h('button', { type: 'button', onClick: () => open('https://example.org/m.json') }, 'Öppna'),
      h(AudioPlayer),
    ]
  })
  render(Host, { global: { plugins: [player] } })

  return { navigator, listeners: () => listeners, user: userEvent.setup() }
}

afterEach(cleanup)

describe('AudioPlayer', () => {
  it('renders nothing visible before a book is opened', () => {
    setup()

    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByRole('status').textContent?.trim()).toBe('')
  })

  it('announces loading in a status region that exists before loading starts', async () => {
    const load = deferred<Publication>()
    const { user } = setup(() => load.promise)
    const status = screen.getByRole('status')

    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    expect(status.textContent).toContain('Laddar ljudboken')
    expect(screen.getByRole('status')).toBe(status)
  })

  it('shows the player as a region named by the book title', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    const region = await screen.findByRole('region', { name: 'Flatland' })
    expect(region.querySelector('h2')?.textContent).toBe('Flatland')
    expect(screen.getByText('Part 1')).toBeTruthy()
  })

  it('shows elapsed and total time, with a spoken version for screen readers', async () => {
    const { user, navigator, listeners } = setup()
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await screen.findByRole('region')

    navigator.currentTime = 65
    listeners().positionChanged?.(navigator.currentLocator)

    expect(await screen.findByText('1:05 / 1:02:05')).toBeTruthy()
    expect(screen.getByText('1 minut 5 sekunder av 1 timme 2 minuter 5 sekunder')).toBeTruthy()
  })

  it('toggles between play and pause, updating the button name', async () => {
    const { user, navigator } = setup()
    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    await user.click(await screen.findByRole('button', { name: 'Spela' }))
    expect(navigator.play).toHaveBeenCalledOnce()

    await user.click(await screen.findByRole('button', { name: 'Pausa' }))
    expect(navigator.pause).toHaveBeenCalledOnce()
    expect(await screen.findByRole('button', { name: 'Spela' })).toBeTruthy()
  })

  it('can be operated with the keyboard', async () => {
    const { user, navigator } = setup()
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await screen.findByRole('button', { name: 'Spela' })

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Spela' }))
    await user.keyboard('{Enter}')
    expect(navigator.play).toHaveBeenCalledOnce()

    await user.keyboard(' ')
    expect(navigator.pause).toHaveBeenCalledOnce()
  })

  it('shows playback errors as an alert', async () => {
    const { user, listeners, navigator } = setup()
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await screen.findByRole('region')

    listeners().error?.(new Error('boom'), navigator.currentLocator)

    expect((await screen.findByRole('alert')).textContent).toBe('Ljudet kunde inte spelas upp.')
  })

  it('shows load errors as an alert that can be dismissed', async () => {
    const { user } = setup(async () => {
      throw new PublicationLoadError('network', 'offline')
    })
    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    expect((await screen.findByRole('alert')).textContent).toContain('internetanslutning')

    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('destroys the navigator when closed', async () => {
    const { user, navigator } = setup()
    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    await user.click(await screen.findByRole('button', { name: 'Stäng spelaren' }))

    expect(navigator.destroy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('returns focus to the element that opened the player when it is closed', async () => {
    const { user } = setup()
    const openButton = screen.getByRole('button', { name: 'Öppna' })
    await user.click(openButton)

    await user.click(await screen.findByRole('button', { name: 'Stäng spelaren' }))

    expect(document.activeElement).toBe(openButton)
  })
})
