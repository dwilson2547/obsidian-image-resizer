# Image Resizer — Obsidian Plugin

Automatically downsizes images added to your vault to configurable maximum dimensions. Images that are already smaller than the limits pass through untouched.

## Features

- **Automatic resizing** — images are resized when pasted, dragged, or imported into the vault
- **Aspect ratio preserved** — images are scaled proportionally, never stretched
- **High-quality downscaling** — uses the browser's best interpolation
- **Configurable limits** — set max width, max height, or both
- **JPEG quality control** — adjustable quality slider for JPEG/WebP output
- **Optional PNG → JPEG conversion** — shrink PNGs by converting to JPEG on resize
- **Batch commands** — resize all images in the vault or current folder on demand
- **Non-destructive for small images** — images within limits are never touched

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Maximum width | 1920 px | Max width in pixels. Set to 0 to ignore. |
| Maximum height | 1080 px | Max height in pixels. Set to 0 to ignore. |
| JPEG quality | 85 | Output quality for JPEG/WebP (1–100) |
| Convert PNG to JPEG | Off | Convert PNGs to JPEG when resizing (loses transparency) |
| Resize on paste | On | Auto-resize images pasted into notes |
| Resize on drop/import | On | Auto-resize images dragged/imported into vault |
| Show notification | On | Display a notice with before/after dimensions |

## Commands

- **Resize all images in vault** — scans every image and resizes any that exceed limits
- **Resize images in current folder** — only processes images in the active note's folder

## Installation

### From source

1. Clone this repo into your vault's `.obsidian/plugins/` directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone <repo-url> image-resizer
   cd image-resizer
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Restart Obsidian and enable **Image Resizer** in Settings → Community plugins.

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` (if present) from the latest release.
2. Create a folder at `<vault>/.obsidian/plugins/image-resizer/`.
3. Copy the files into that folder.
4. Restart Obsidian and enable the plugin.

## How it works

The plugin listens for `create` and `modify` events on the vault. When an image file is detected:

1. The image bytes are read from the vault.
2. The image is loaded into an `<img>` element to get its natural dimensions.
3. A scale factor is computed from the max width/height settings.
4. If the image is already within limits (scale ≥ 1), nothing happens.
5. Otherwise, the image is drawn at the new size onto an HTML canvas with high-quality smoothing.
6. The canvas is exported as a blob and written back to the vault.

A 500ms debounce prevents processing files that are still being written, and a processing guard prevents infinite loops from the write-back triggering another modify event.

## Supported formats

PNG, JPEG, WebP, BMP — anything the browser's `<img>` element can decode.
