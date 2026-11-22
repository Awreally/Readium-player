import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('renders a main landmark with a level-one heading', () => {
    const wrapper = mount(App)

    expect(wrapper.find('main h1').exists()).toBe(true)
  })
})
