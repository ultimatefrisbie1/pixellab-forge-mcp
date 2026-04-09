import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { rgbaToPng, extractAndSaveImages } from "../src/save-images.js";

const OUTPUT_DIR = join(process.cwd(), "pixellab-forge-output");

// isImageObj requires base64.length > 100, so we need images large enough
// 8x8 RGBA = 256 bytes → ~344 base64 chars
const TEST_SIZE = 8;

describe("rgbaToPng", () => {
  it("produces valid PNG from RGBA buffer", () => {
    // 2x2 red pixels
    const rgba = Buffer.alloc(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      rgba[i * 4] = 255;     // R
      rgba[i * 4 + 1] = 0;   // G
      rgba[i * 4 + 2] = 0;   // B
      rgba[i * 4 + 3] = 255; // A
    }

    const png = rgbaToPng(rgba, 2, 2);

    // Check PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it("encodes correct dimensions in IHDR", () => {
    const rgba = Buffer.alloc(4 * 3 * 4); // 4x3
    const png = rgbaToPng(rgba, 4, 3);

    // IHDR starts at byte 8 (after signature), chunk length (4) + "IHDR" (4) = byte 16
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(4);
    expect(height).toBe(3);
  });

  it("produces different output for different pixels", () => {
    const black = Buffer.alloc(1 * 1 * 4, 0);
    const white = Buffer.alloc(1 * 1 * 4, 255);

    const pngBlack = rgbaToPng(black, 1, 1);
    const pngWhite = rgbaToPng(white, 1, 1);

    expect(pngBlack.equals(pngWhite)).toBe(false);
  });

  it("handles transparent pixels", () => {
    // Fully transparent 1x1
    const rgba = Buffer.from([0, 0, 0, 0]);
    const png = rgbaToPng(rgba, 1, 1);
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("extractAndSaveImages", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const f of cleanup) {
      try { rmSync(f); } catch {}
    }
    cleanup.length = 0;
  });

  it("converts rgba_bytes images to PNG", () => {
    const rgba = Buffer.alloc(TEST_SIZE * TEST_SIZE * 4);
    for (let i = 0; i < TEST_SIZE * TEST_SIZE; i++) {
      rgba[i * 4] = 255;     // R
      rgba[i * 4 + 3] = 255; // A
    }
    const b64 = rgba.toString("base64");

    const result = {
      images: [{ type: "rgba_bytes", base64: b64, width: TEST_SIZE, height: TEST_SIZE }],
    };

    const { images } = extractAndSaveImages(result, "test_rgba");

    expect(images).toHaveLength(1);
    expect(images[0].base64.length).toBeGreaterThan(0);
    expect(images[0].mimeType).toBe("image/png");

    // Verify the inline base64 is valid PNG
    const decoded = Buffer.from(images[0].base64, "base64");
    expect(decoded[0]).toBe(0x89);
    expect(decoded[1]).toBe(0x50);

    cleanup.push(images[0].filePath);
  });

  it("handles regular base64 PNG images unchanged", () => {
    // Use random data so the PNG doesn't compress below 100 chars
    const rgba = Buffer.alloc(TEST_SIZE * TEST_SIZE * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = Math.floor(Math.random() * 256);
    const pngBuf = rgbaToPng(rgba, TEST_SIZE, TEST_SIZE);
    const b64 = pngBuf.toString("base64");

    const result = {
      image: { type: "base64", base64: b64, format: "png" },
    };

    const { images } = extractAndSaveImages(result, "test_png");

    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe("image/png");

    cleanup.push(images[0].filePath);
  });

  it("saves images to disk with correct filenames", () => {
    const rgba = Buffer.alloc(TEST_SIZE * TEST_SIZE * 4);
    const b64 = rgba.toString("base64");

    const result = {
      images: [{ type: "rgba_bytes", base64: b64, width: TEST_SIZE, height: TEST_SIZE }],
    };

    const { images } = extractAndSaveImages(result, "my_cool_prompt");

    expect(images[0].filePath).toContain("my_cool_prompt");
    expect(images[0].filePath).toMatch(/\.png$/);

    cleanup.push(images[0].filePath);
  });

  it("strips base64 from result after extraction", () => {
    const rgba = Buffer.alloc(TEST_SIZE * TEST_SIZE * 4, 128);
    const b64 = rgba.toString("base64");

    const result = {
      images: [{ type: "rgba_bytes", base64: b64, width: TEST_SIZE, height: TEST_SIZE }],
    };

    const { result: stripped } = extractAndSaveImages(result, "test_strip");
    const img = (stripped as any).images[0];
    expect(img.base64).toBe("[stripped]");

    cleanup.push(...extractAndSaveImages({ images: [{ type: "rgba_bytes", base64: b64, width: TEST_SIZE, height: TEST_SIZE }] }, "test_strip2").images.map((i) => i.filePath));
  });

  it("handles nested last_response from job polling", () => {
    const rgba = Buffer.alloc(TEST_SIZE * TEST_SIZE * 4);
    const b64 = rgba.toString("base64");

    const result = {
      status: "completed",
      last_response: {
        images: [{ type: "rgba_bytes", base64: b64, width: TEST_SIZE, height: TEST_SIZE }],
      },
    };

    const { images } = extractAndSaveImages(result, "test_nested");
    expect(images.length).toBeGreaterThanOrEqual(1);

    cleanup.push(...images.map((i) => i.filePath));
  });
});
