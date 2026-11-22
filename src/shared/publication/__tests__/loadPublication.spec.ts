import { describe, expect, it, vi } from 'vitest'
import { loadPublication, PublicationLoadError } from '../loadPublication'

const MANIFEST_URL = 'https://cdn.example.org/books/42/manifest.json'

const audiobookManifest = {
  '@context': 'https://readium.org/webpub-manifest/context.jsonld',
  metadata: {
    '@type': 'http://schema.org/Audiobook',
    conformsTo: 'https://readium.org/webpub-manifest/profiles/audiobook',
    title: 'Testbok',
    duration: 300,
  },
  links: [
    {
      rel: 'self',
      href: 'https://wrong-host.example.org/old/manifest.json',
      type: 'application/audiobook+json',
    },
  ],
  readingOrder: [
    { href: 'audio/chapter1.mp3', type: 'audio/mpeg', duration: 120, title: 'Kapitel 1' },
    { href: 'audio/chapter2.mp3', type: 'audio/mpeg', duration: 180, title: 'Kapitel 2' },
  ],
  toc: [{ href: 'audio/chapter1.mp3', title: 'Kapitel 1' }],
}

function jsonResponse(body: unknown, init: ResponseInit & { url?: string } = {}): Response {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (init.url) Object.defineProperty(response, 'url', { value: init.url })
  return response
}

function fetchReturning(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response)
}

async function expectLoadError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(PublicationLoadError)
  return error as PublicationLoadError
}

describe('loadPublication', () => {
  it('builds a publication from an audiobook manifest', async () => {
    const pub = await loadPublication(MANIFEST_URL, {
      fetch: fetchReturning(jsonResponse(audiobookManifest)),
    })

    expect(pub.metadata.title.getTranslation()).toBe('Testbok')
    expect(pub.readingOrder.items).toHaveLength(2)
    expect(pub.readingOrder.items[1]?.duration).toBe(180)
    expect(pub.toc?.items).toHaveLength(1)
  })

  it('resolves relative hrefs against the fetched URL, not the self link in the manifest', async () => {
    const pub = await loadPublication(MANIFEST_URL, {
      fetch: fetchReturning(jsonResponse(audiobookManifest)),
    })

    const firstTrack = pub.readingOrder.items[0]!
    expect(pub.baseURL).toBe('https://cdn.example.org/books/42/')
    expect(firstTrack.toURL(pub.baseURL)).toBe(
      'https://cdn.example.org/books/42/audio/chapter1.mp3',
    )
  })

  it('resolves relative hrefs against the final URL after a redirect', async () => {
    const pub = await loadPublication(MANIFEST_URL, {
      fetch: fetchReturning(
        jsonResponse(audiobookManifest, { url: 'https://storage.example.org/x/manifest.json' }),
      ),
    })

    expect(pub.baseURL).toBe('https://storage.example.org/x/')
  })

  it('passes the abort signal to fetch', async () => {
    const fetchMock = fetchReturning(jsonResponse(audiobookManifest))
    const controller = new AbortController()

    await loadPublication(MANIFEST_URL, { fetch: fetchMock, signal: controller.signal })

    expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL, { signal: controller.signal })
  })

  it('rethrows the abort error unchanged when the load is cancelled', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort()
      throw abortError
    })

    await expect(
      loadPublication(MANIFEST_URL, { fetch: fetchMock, signal: controller.signal }),
    ).rejects.toBe(abortError)
  })

  it('reports a network error when fetch rejects', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await expectLoadError(loadPublication(MANIFEST_URL, { fetch: fetchMock }))

    expect(error.kind).toBe('network')
    expect(error.cause).toBeInstanceOf(TypeError)
  })

  it('reports the HTTP status when the server responds with an error', async () => {
    const error = await expectLoadError(
      loadPublication(MANIFEST_URL, {
        fetch: fetchReturning(new Response('Not found', { status: 404 })),
      }),
    )

    expect(error.kind).toBe('http')
    expect(error.status).toBe(404)
  })

  it('reports invalid JSON', async () => {
    const error = await expectLoadError(
      loadPublication(MANIFEST_URL, {
        fetch: fetchReturning(new Response('<html>login page</html>', { status: 200 })),
      }),
    )

    expect(error.kind).toBe('invalid-json')
  })

  it('reports an invalid manifest when metadata is missing', async () => {
    const { metadata: _metadata, ...withoutMetadata } = audiobookManifest

    const error = await expectLoadError(
      loadPublication(MANIFEST_URL, { fetch: fetchReturning(jsonResponse(withoutMetadata)) }),
    )

    expect(error.kind).toBe('invalid-manifest')
  })

  it('reports an invalid manifest when the reading order is empty', async () => {
    const error = await expectLoadError(
      loadPublication(MANIFEST_URL, {
        fetch: fetchReturning(jsonResponse({ ...audiobookManifest, readingOrder: [] })),
      }),
    )

    expect(error.kind).toBe('invalid-manifest')
  })
})
