import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(process.cwd(), "pixelforge-output");

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

/**
 * Walk through an API response, find all base64 image data,
 * save them to disk, and return the file paths.
 */
export function extractAndSaveImages(
  result: unknown,
  toolName: string,
): { savedFiles: string[]; result: unknown } {
  const savedFiles: string[] = [];

  if (!result || typeof result !== "object") {
    return { savedFiles, result };
  }

  const data = result as Record<string, unknown>;

  // Single image response: { image: { base64: "..." } }
  if (isImageObj(data.image)) {
    const path = saveImage((data.image as any).base64, toolName, 0);
    savedFiles.push(path);
  }

  // Single image as direct base64 string: { image: "base64..." }
  if (typeof data.image === "string" && data.image.length > 100) {
    const path = saveImage(data.image, toolName, 0);
    savedFiles.push(path);
  }

  // Multiple images: { images: [{ base64: "..." }, ...] }
  if (Array.isArray(data.images)) {
    data.images.forEach((img: unknown, i: number) => {
      if (isImageObj(img)) {
        const path = saveImage((img as any).base64, toolName, i);
        savedFiles.push(path);
      } else if (typeof img === "string" && img.length > 100) {
        const path = saveImage(img, toolName, i);
        savedFiles.push(path);
      }
    });
  }

  // Frames response: { frames: [{ base64: "..." }, ...] }
  if (Array.isArray(data.frames)) {
    data.frames.forEach((frame: unknown, i: number) => {
      if (isImageObj(frame)) {
        const path = saveImage((frame as any).base64, toolName, i);
        savedFiles.push(path);
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
          const path = saveImage((dirData.image as any).base64, `${toolName}_${dir}`, i);
          savedFiles.push(path);
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
          const path = saveImage((t.image as any).base64, toolName, i);
          savedFiles.push(path);
        }
      }
    });
  }

  // Nested in last_response (from job polling)
  if (data.last_response && typeof data.last_response === "object") {
    const nested = extractAndSaveImages(data.last_response, toolName);
    savedFiles.push(...nested.savedFiles);
  }

  return { savedFiles, result };
}

function isImageObj(val: unknown): boolean {
  return (
    val !== null &&
    typeof val === "object" &&
    typeof (val as any).base64 === "string" &&
    (val as any).base64.length > 100
  );
}
