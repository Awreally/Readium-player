import { HttpFetcher, Manifest, Publication } from '@readium/shared'

export type PublicationLoadErrorKind = 'network' | 'http' | 'invalid-json' | 'invalid-manifest'

export class PublicationLoadError extends Error {
  readonly kind: PublicationLoadErrorKind
  readonly status?: number

  constructor(
    kind: PublicationLoadErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'PublicationLoadError'
    this.kind = kind
    this.status = options?.status
  }
}

export interface LoadPublicationOptions {
  signal?: AbortSignal
  fetch?: typeof globalThis.fetch
}

export async function loadPublication(
  manifestUrl: string,
  options: LoadPublicationOptions = {},
): Promise<Publication> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  let response: Response
  try {
    response = await fetchImpl(manifestUrl, { signal: options.signal })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new PublicationLoadError('network', `Kunde inte hämta manifestet: ${manifestUrl}`, {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new PublicationLoadError(
      'http',
      `Servern svarade ${response.status} för manifestet: ${manifestUrl}`,
      { status: response.status },
    )
  }

  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    throw new PublicationLoadError('invalid-json', 'Manifestet är inte giltig JSON', {
      cause: error,
    })
  }

  const manifest = Manifest.deserialize(json)
  if (!manifest || manifest.readingOrder.items.length === 0) {
    throw new PublicationLoadError('invalid-manifest', 'Manifestet saknar en giltig readingOrder')
  }

  // Relative hrefs resolve against the self link, so it must point at where the manifest
  // was actually fetched from, regardless of what the backend wrote in it.
  manifest.setSelfLink(response.url || manifestUrl)

  return new Publication({
    manifest,
    fetcher: new HttpFetcher(fetchImpl, manifest.baseURL),
  })
}
