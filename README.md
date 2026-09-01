# They-Cant-Be-Regenerated

They-Cant-Be-Regenerated is a local desktop application for creating, editing, customizing, and preparing Magic: The Gathering proxy cards for printing.

The project combines card data, print selection, artwork replacement, layer-based card editing, and print/PDF preparation into a single desktop workflow.

## Overview

The application supports two primary workflows:

**Original Print**

Use a selected card printing and language as provided by the available card data and export it without customization.

**Custom Card**

Select **"Personalizar com a minha própria arte"** to open the card in the layer-based editor and customize its visual composition.

Customizations are non-destructive and independent from the original card print.

## Core Features

* Decklist import and card resolution
* Card and printing selection
* Language selection
* Original artwork support
* Custom artwork replacement
* Artwork crop, zoom, pan, and transform
* Layer-based card editor
* Frame and template system
* Masks and compositing
* Text and mana symbol rendering
* Individual and batch customization
* Local project and asset management
* Print workspace
* PDF generation
* Bleed, crop marks, margins, gap, scale, and watermark controls
* Double-sided card support

## Architecture

The project is designed as a local-first desktop application.

```text
Card Data
    |
    v
CardDefinition
    |
    v
CardDocument
    |
    v
Scene Graph / Layers
    |
    v
CardRenderingEngine
    |
    +----> Editor Preview
    +----> PNG Export
    +----> Print Rendering
              |
              v
        PDFExportEngine
```

The card itself is represented as a structured document rather than a single flattened image. This allows individual elements such as artwork, frames, text, masks, symbols, and custom layers to be edited independently.

## Rodar localmente

```bash
pnpm install --no-frozen-lockfile
pnpm dev
```

Para validar antes de empacotar:

```bash
./node_modules/.bin/tsc -b --pretty false
./node_modules/.bin/vitest run --reporter=dot
./node_modules/.bin/vite build
```

## Technology

* Tauri
* React
* TypeScript
* Vite
* Rust for native operations where appropriate

External services are used primarily for card data and print information. Project data, assets, rendering, and export are designed to operate locally.

## References

The project takes functional and architectural inspiration from:

* Card Conjurer source
  https://github.com/joshbirnholz/cardconjurer

* MTG Art Swap source
  https://github.com/alwynhawk/MTG-Art-Swap

These projects are references for functionality and workflow. They are not intended to be copied, and third-party code, assets, fonts, and templates must be used in accordance with their respective licenses.

## Project Status

The project is under active development.

Current development focuses on establishing the card document model, layer system, rendering engine, artwork editor, template system, and integration with the print/export pipeline.

