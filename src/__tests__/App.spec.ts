import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import { AudioPlayerController } from '../features/audio-player/AudioPlayerController'
import { createAudioPlayer } from '../features/audio-player/useAudioPlayer'

describe('App', () => {
  it('renders a main landmark with a level-one heading', () => {
    const wrapper = mount(App, {
      global: { plugins: [createAudioPlayer(new AudioPlayerController())] },
    })

    expect(wrapper.find('main h1').exists()).toBe(true)
  })

  it('keeps the audio player outside main so it survives page changes', () => {
    const wrapper = mount(App, {
      global: { plugins: [createAudioPlayer(new AudioPlayerController())] },
    })

    expect(wrapper.find('.audio-player').exists()).toBe(true)
    expect(wrapper.find('main .audio-player').exists()).toBe(false)
  })
})
