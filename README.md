# Readium-player

Ljudboksspelare och EPUB-läsare för Bläddra web, byggd på [Readium ts-toolkit](https://github.com/readium/ts-toolkit) (`@readium/navigator`) med eget gränssnitt.

Målet är att spelaren ska kunna integreras i samma app som resten av Bläddra, med navigering och ett minimerat läge medan man fortsätter bläddra bland böcker.

## Principer

- Semantisk HTML först, ARIA bara när det behövs.
- Tillgänglighet enligt WCAG 2.2 nivå AA.
- Varje komponent testas innan vi går vidare.

## Kom igång

Kräver Node 24.

```sh
npm install
npm run dev        # utvecklingsserver
npm run test:unit  # tester i watch-läge
npm run build      # typkontroll och bygge
npm run lint
```

## Testbok

Under utveckling används ljudboken *Flatland* från Readiums exempel:
<https://readium.org/webpub-manifest/examples/Flatland/manifest.json>
