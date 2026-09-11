# Community artwork sources

> **Status:** documento histórico. A API comunitária foi removida da versão final do Customize Art; as fontes abaixo não são mais consultadas pelo aplicativo.

## Integrated source: Universes Within Collection (UWC)

The Stage 2 community artwork adapter integrates the public **Universes Within Collection** project by [madelson](https://github.com/madelson/universes-within-collection). UWC is a curated, community-created collection of unofficial “Universes Within” alternatives for Universes Beyond cards. Its published gallery index at `gallery/cardData.json` contains a card `oracleId`, an alternative card name, an optional nickname, and an image URL. The desktop application reads that index through the public [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content), filters it by the selected card’s `oracleId` or exact normalized name/nickname, and displays only contextual results for that card. It does not expose a generic image feed.

Images are fetched from the UWC GitHub Pages gallery and converted to a data URL only after the user explicitly chooses **Preview & apply**. The resulting asset enters the normal custom-art/CardConjurer flow, retaining source URL, repository URL, license URL, attribution metadata, and the original community classification. The adapter caches the small JSON index in `localStorage` for twelve hours, deduplicates in-flight index requests, lazy-loads thumbnails, and fails gracefully to a source link when GitHub is unavailable. It does not embed a GitHub token in the desktop application.

UWC’s [README](https://github.com/madelson/universes-within-collection) describes the project as personal and non-commercial. Its [LICENSE.txt](https://raw.githubusercontent.com/madelson/universes-within-collection/main/LICENSE.txt) permits community proxy/digital-alter use under conditions including **no commercial use**, **no machine-learning/data-mining training use**, and **preservation of artist attribution**. The UI labels these results as unofficial community artwork and links back to the source and license. The project must keep those restrictions visible to users and must not be treated as an official Wizards of the Coast source.

The GitHub REST API is public, but anonymous requests are limited to 60 requests per hour per IP. GitHub documents a 5,000-request-per-hour limit for authenticated user requests, but no credential is bundled because a desktop token would be extractable. GitHub also documents a maximum of 100,000 entries or 7 MB for a recursive tree response; the integration uses the smaller published JSON index rather than enumerating a repository tree. Primary references: [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) and [Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree).

## Existing source: Scryfall

Scryfall remains the project’s source for official card data, printings, languages, and official card images. The adapter now sends an `Accept: application/json` header and serializes card API requests to a conservative 500 ms interval. Existing 30-day cache and in-flight deduplication remain in place. The Stage 2 original-print section is still the first artwork section and continues to show official printings.

Scryfall’s [API documentation](https://scryfall.com/docs/api) requires a `User-Agent` and `Accept` header, documents hard rate limits, and recommends caching. Its image rules prohibit covering/cropping copyright or artist text, distorting, color-shifting, or simply repackaging/proxying Scryfall data. The application therefore treats Scryfall imagery as official-print selection, not community artwork, and does not place it in the community source adapter.

## Researched and rejected sources

| Source | Result | Reason not integrated as a community artwork API |
|---|---|---|
| [MTG Art Swap](https://github.com/alwynhawk/MTG-Art-Swap) | Rejected as backend | A small static client-side tool that uses Scryfall for official printings and accepts user-provided local art. It has no public artwork catalog/API, no declared repository license, and no contextual community-art endpoint. |
| [MTGJSON](https://mtgjson.com/downloads/) | Metadata-only | Public files and an authenticated/beta GraphQL service provide card identifiers and metadata, but MTGJSON does not distribute image bytes or a fan/proxy-art catalog. Its MIT license does not license third-party card images. |
| [Wizards Gatherer](https://gatherer.wizards.com/) | Manual link only | Public HTML pages expose official printings, but there is no documented public API, no supported oracleId lookup contract, no CORS guarantee, and Wizards terms prohibit scraping/data mining and unauthorized reproduction of artwork. |
| [GitHub REST API](https://docs.github.com/en/rest/search/search) as global search | Rejected as discovery mechanism | GitHub is a generic repository API, not an MTG artwork catalog. Global repository/code search does not reliably map images to card oracle IDs, has strict anonymous/search limits, and cannot establish image licensing. The implementation uses GitHub only for one explicitly curated UWC source and its published index. |

## Architectural limitations

The integrated source is intentionally opt-in and conservative. UWC has no SLA, its branch and image files can change or disappear, and its license is non-commercial. The app does not download a high-resolution asset until the user selects it, does not crawl repositories, does not make repeated requests per card, and does not present results as official Magic printings. Offline mode still supports imported local art and bundled CardConjurer assets; community results show an explanatory empty/error state and a manual source link when the remote index is unavailable.

Before a commercial or redistributed build, the UWC license, artist attribution, Wizards fan-content restrictions, CardConjurer asset notices, and any image-specific rights must be reviewed separately. The application does not claim that the combined project is commercially redistributable.
