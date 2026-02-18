import type { ImageResizerSettings } from "./settings";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

export function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

interface ResizeResult {
  data: ArrayBuffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  newExtension: string | null; // non-null if the file extension changed (e.g. png -> jpg)
}

/**
 * Loads image bytes into an HTMLImageElement via a blob URL.
 */
function loadImage(data: ArrayBuffer, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${err}`));
    };
    img.src = url;
  });
}

function getMimeType(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

/**
 * Calculate new dimensions maintaining aspect ratio.
 * Returns null if no resize is needed.
 */
function calculateDimensions(
  origWidth: number,
  origHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } | null {
  let scale = 1;

  if (maxWidth > 0 && origWidth > maxWidth) {
    scale = Math.min(scale, maxWidth / origWidth);
  }

  if (maxHeight > 0 && origHeight > maxHeight) {
    scale = Math.min(scale, maxHeight / origHeight);
  }

  // No resize needed
  if (scale >= 1) {
    return null;
  }

  return {
    width: Math.round(origWidth * scale),
    height: Math.round(origHeight * scale),
  };
}

/**
 * Resize an image if it exceeds the configured maximum dimensions.
 * Returns null if no resize was needed.
 */
export async function resizeImage(
  data: ArrayBuffer,
  filename: string,
  settings: ImageResizerSettings
): Promise<ResizeResult | null> {
  const ext = getExtension(filename);
  const mimeType = getMimeType(ext);
  const img = await loadImage(data, mimeType);

  const newDims = calculateDimensions(
    img.naturalWidth,
    img.naturalHeight,
    settings.maxWidth,
    settings.maxHeight
  );

  // Image is within bounds — no resize needed
  if (!newDims) {
    return null;
  }

  // Draw resized image to canvas
  const canvas = document.createElement("canvas");
  canvas.width = newDims.width;
  canvas.height = newDims.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2D context");
  }

  // Use high-quality downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, newDims.width, newDims.height);

  // Determine output format
  let outputMime = mimeType;
  let newExtension: string | null = null;

  if (settings.convertToJpeg && ext === "png") {
    outputMime = "image/jpeg";
    newExtension = "jpg";
  }

  // Export from canvas
  const quality = outputMime === "image/png" ? undefined : settings.jpegQuality / 100;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob returned null"));
      },
      outputMime,
      quality
    );
  });

  const resizedBuffer = await blob.arrayBuffer();

  return {
    data: resizedBuffer,
    width: newDims.width,
    height: newDims.height,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    newExtension,
  };
}
