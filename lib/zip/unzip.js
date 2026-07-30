// lib/zip/unzip.js
//
// Minimal, dependency-free ZIP reader for the one thing we need it for:
// pulling the individual CSV reports out of a Morgan Stanley At Work
// "Activity Report" export, which downloads as a .zip. Handles the two
// compression methods any normal export tool uses - 0 (stored) and 8
// (deflate) - via the ZIP spec's central directory, so we don't need to
// bundle a third-party unzip library. Deflate decompression uses the
// browser's native DecompressionStream('deflate-raw').
//
// This only implements enough of APPNOTE.TXT (the public ZIP format spec)
// to read simple, single-disk archives without a zip64 central directory -
// which covers every export tool we care about here. It intentionally does
// not attempt to write ZIPs, handle encryption, or handle multi-disk/zip64
// archives.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(view) {
  // The EOCD record is at least 22 bytes and sits at the end of the file,
  // possibly preceded by a comment (rare for tool-generated exports) - scan
  // backwards for its signature rather than assuming it's the last 22 bytes.
  const maxCommentLength = 65535;
  const start = Math.max(0, view.byteLength - 22 - maxCommentLength);
  for (let i = view.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new Error("Not a valid ZIP file (end-of-central-directory record not found).");
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Map<string, Uint8Array>>} filename -> file contents
 */
export async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(view);

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder("utf-8");
  const files = new Map();

  let offset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Corrupt ZIP: expected central directory entry at offset ${offset}.`);
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const fileName = decoder.decode(bytes.subarray(nameStart, nameStart + fileNameLength));

    if (!fileName.endsWith("/")) {
      // Not a directory entry - read the actual bytes from its local file header.
      const lfSig = view.getUint32(localHeaderOffset, true);
      if (lfSig !== LOCAL_FILE_SIGNATURE) {
        throw new Error(`Corrupt ZIP: expected local file header for "${fileName}".`);
      }
      const lfNameLength = view.getUint16(localHeaderOffset + 26, true);
      const lfExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lfNameLength + lfExtraLength;
      const raw = bytes.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        files.set(fileName, raw);
      } else if (compressionMethod === 8) {
        files.set(fileName, await inflateRaw(raw));
      } else {
        throw new Error(`Unsupported ZIP compression method (${compressionMethod}) for "${fileName}".`);
      }
    }

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return files;
}

export function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}
