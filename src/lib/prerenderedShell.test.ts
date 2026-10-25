import { afterEach, describe, expect, it } from 'vitest'

import {
  prerenderedMarkupFor,
  recapturePrerenderedMarkup,
  releasePrerenderedMarkup,
} from './prerenderedShell'

const mountRoot = (attributes: string, html: string) => {
  document.body.innerHTML = `<div id="root" ${attributes}>${html}</div>`
  recapturePrerenderedMarkup()
}

afterEach(() => {
  document.body.innerHTML = ''
  recapturePrerenderedMarkup()
})

describe('prerenderedShell', () => {
  it('returns the prerendered markup only for the page it was rendered for', () => {
    mountRoot('data-prerendered="/platform"', '<main><h1>Agencies</h1></main>')
    expect(prerenderedMarkupFor('/platform')).toBe('<main><h1>Agencies</h1></main>')
    expect(prerenderedMarkupFor('/platform/')).toBe('<main><h1>Agencies</h1></main>')
    expect(prerenderedMarkupFor('/clips')).toBeNull()
  })

  it('never resurfaces once released', () => {
    mountRoot('data-prerendered="/clips"', '<main>Clips</main>')
    releasePrerenderedMarkup()
    expect(prerenderedMarkupFor('/clips')).toBeNull()
  })

  it('ignores a root the build did not prerender', () => {
    mountRoot('', '<p>Something else</p>')
    expect(prerenderedMarkupFor('/')).toBeNull()
    mountRoot('data-prerendered="/"', '   ')
    expect(prerenderedMarkupFor('/')).toBeNull()
  })
})
