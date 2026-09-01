# Validation summary — error correction pass

## Root causes corrected

- The import handler no longer clears the deck textarea after resolving. The original source is kept in `deckText`, persisted in `ProjectFile`, restored from local storage/recovery and reused by retry resolution.
- Resolution results are separate from the source text. Each definition now carries the original input name, an independent status and a resolver message. The UI displays `FOUND`, `NOT_FOUND`, `AMBIGUOUS` and `ERROR` without deleting unresolved lines.
- Stage 2 is now a card art / print selection workspace. Each definition exposes its available printings and available languages, with Select all and bulk language/print operations. A selected print updates only `selectedPrint`, `selectedLanguage` and `selectedImageUri`; original card data remains intact.
- The art editor keeps custom artwork independent and supports non-destructive transform controls plus pointer drag/pan in the preview.
- Stage 3 now uses a three-column default layout and a shared `PrintLayoutEngine` geometry facade. Paper, gap, scale, bleed, crop marks, black corners, skip basic lands, decklist and watermark settings are carried into the PDF generation path.
- The `Custom` paper option now has real width and height values in millimeters. Older projects are migrated with defaults instead of producing `NaN` geometry.

## Automated checks

- TypeScript compilation: passed with `tsc -b --pretty false`.
- Regression tests: **5 passed** in one test file.
- Production bundle: passed with Vite.

The regression suite covers deck parsing, duplicate quantity aggregation, three-cards-per-row A4 geometry, basic-land filtering and custom-paper dimensions.

## Browser verification

The browser smoke tests confirmed the following behaviors:

1. A deck containing `Sol Ring` and `This Card Definitely Does Not Exist` retained the exact textarea contents after resolution.
2. The original-input review showed `Sol Ring` as `FOUND` and the missing card as `NOT_FOUND`, with the original name and warning message still visible.
3. The corrected sample deck resolved four definitions and unlocked Stage 2.
4. Stage 2 showed per-card print selectors with many Scryfall printings, language selectors, Select all and bulk controls.
5. Selecting all and applying a language updated available matching printings and produced an autosave state.
6. Stage 3 showed a physical `3 × 3 grid` at the default A4 dimensions.
7. Changing scale and gap visibly changed the physical preview geometry.
8. Selecting Custom paper initialized finite dimensions and changing them to `100 × 120 mm` recalculated the preview to `1 × 1 grid` and `4 pages`, without `NaN` values.

## Native packaging note

The web bundle is buildable and the Tauri v2 wrapper remains included. Rust/Cargo is not installed in this implementation environment, so native packaging was not executed here.
