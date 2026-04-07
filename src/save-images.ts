import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(process.cwd(), "pixellab-forge-output");

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

/** Generate a filename from the tool name and a short ID */
function makeFilename(toolName: string, index: number, id?: string): string {
  const timestamp = Date.now();
  const suffix = id ? `_${id.slice(0, 8)}` : "";
  const indexStr = index > 0 ? `_${index}` : "";
  return `${toolName}${suffix}${indexStr}_${timestamp}.png`;
}

/** Decode a base64 image string, handling data URI prefix if present */
function decodeBase64(data: string): Buffer {
  const raw = data.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(raw, "base64");
}

/** Save a single base64 image and return the file path */
function saveImage(base64: string, toolName: string, index: number, id?: string): string {
  ensureOutputDir();
  const filename = makeFilename(toolName, index, id);
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, decodeBase64(base64));
  return filepath;
}

/** Strip data URI prefix and any whitespace from base64 string so it's clean for the Claude API */
function cleanBase64(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, "").replace(/\s/g, "");
}

/** Validate that a base64 string decodes to a non-empty buffer with a valid image header */
function isValidImageBase64(b64: string): boolean {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 8) return false;
    // Check for PNG magic bytes (89 50 4E 47)
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    // Check for JPEG magic bytes (FF D8 FF)
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    // Check for WebP (RIFF....WEBP)
    const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
    // Check for GIF (GIF8)
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
    return isPng || isJpeg || isWebp || isGif;
  } catch {
    return false;
  }
}

/** Detect MIME type from base64 data */
function detectMimeType(b64: string): string {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length >= 4) {
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
    }
  } catch {}
  return "image/png";
}

export interface ExtractedImage {
  base64: string;
  filePath: string;
  mimeType: string;
}

/**
 * Walk through an API response, find all base64 image data,
 * save them to disk, and return the file paths + raw base64 for MCP image blocks.
 * Also strips base64 data from the result to keep the JSON response small.
 */
export function extractAndSaveImages(
  result: unknown,
  toolName: string,
): { images: ExtractedImage[]; result: unknown } {
  const images: ExtractedImage[] = [];

  /** Save image to disk and add to inline list only if it has valid image headers */
  function addImage(b64: string, toolLabel: string, index: number) {
    const path = saveImage(b64, toolLabel, index);
    if (isValidImageBase64(b64)) {
      images.push({ base64: b64, filePath: path, mimeType: detectMimeType(b64) });
    } else {
      process.stderr.write(`[pixellab-forge-mcp] Warning: saved ${path} but base64 has no valid image header, skipping inline display\n`);
      images.push({ base64: "", filePath: path, mimeType: "image/png" });
    }
  }

  if (!result || typeof result !== "object") {
    return { images, result };
  }

  const data = result as Record<string, unknown>;

  // Single image response: { image: { type: "base64", base64: "...", format: "png" } }
  if (isImageObj(data.image)) {
    const b64 = cleanBase64((data.image as any).base64);
    addImage(b64, toolName, 0);
    stripBase64(data.image);
  }

  // Single image as direct base64 string: { image: "base64..." }
  if (typeof data.image === "string" && data.image.length > 100) {
    const b64 = cleanBase64(data.image);
    addImage(b64, toolName, 0);
    data.image = "[base64 image data stripped]";
  }

  // Multiple images: { images: [{ type: "base64", base64: "..." }, ...] }
  if (Array.isArray(data.images)) {
    data.images.forEach((img: unknown, i: number) => {
      if (isImageObj(img)) {
        const b64 = cleanBase64((img as any).base64);
        addImage(b64, toolName, i);
        stripBase64(img);
      } else if (typeof img === "string" && img.length > 100) {
        const b64 = cleanBase64(img);
        addImage(b64, toolName, i);
        (data.images as any[])[i] = "[base64 image data stripped]";
      }
    });
  }

  // Frames response: { frames: [{ type: "base64", base64: "..." }, ...] }
  if (Array.isArray(data.frames)) {
    data.frames.forEach((frame: unknown, i: number) => {
      if (isImageObj(frame)) {
        const b64 = cleanBase64((frame as any).base64);
        addImage(b64, toolName, i);
        stripBase64(frame);
      }
    });
  }

  // Character directions: { directions: { south: { image: {...} }, ... } }
  if (data.directions && typeof data.directions === "object") {
    const dirs = data.directions as Record<string, unknown>;
    let i = 0;
    for (const [dir, value] of Object.entries(dirs)) {
      if (value && typeof value === "object") {
        const dirData = value as Record<string, unknown>;
        if (isImageObj(dirData.image)) {
          const b64 = cleanBase64((dirData.image as any).base64);
          addImage(b64, `${toolName}_${dir}`, i);
          stripBase64(dirData.image);
          i++;
        }
      }
    }
  }

  // Tileset tiles: { tiles: [{ image: {...} }, ...] }
  if (Array.isArray(data.tiles)) {
    data.tiles.forEach((tile: unknown, i: number) => {
      if (tile && typeof tile === "object") {
        const t = tile as Record<string, unknown>;
        if (isImageObj(t.image)) {
          const b64 = cleanBase64((t.image as any).base64);
          addImage(b64, toolName, i);
          stripBase64(t.image);
        }
      }
    });
  }

  // Nested in last_response (from job polling)
  if (data.last_response && typeof data.last_response === "object") {
    const nested = extractAndSaveImages(data.last_response, toolName);
    images.push(...nested.images);
  }

  return { images, result };
}

function isImageObj(val: unknown): boolean {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof (val as any).base64 === "string" &&
    (val as any).base64.length > 100
  );
}

/** Replace base64 data in-place with a placeholder to keep JSON responses small */
function stripBase64(obj: unknown): void {
  if (obj && typeof obj === "object") {
    (obj as any).base64 = "[stripped]";
  }
}
