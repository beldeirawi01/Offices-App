import fs from "fs";

// Reads just enough of the file to check its magic bytes — cheap even for a
// 25MB upload, since this stops after `length` bytes instead of reading the
// whole file.
function readHeader(filePath: string, length: number): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function matchesBytes(buffer: Buffer, offset: number, bytes: number[]): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
}

function asciiAt(buffer: Buffer, offset: number, text: string): boolean {
  return buffer.length >= offset + text.length && buffer.toString("ascii", offset, offset + text.length) === text;
}

/**
 * Multer's fileFilter can only see the declared Content-Type of a multipart
 * field, which the uploader fully controls — nothing stops a request from
 * claiming "audio/mpeg" while actually sending something else entirely.
 * These check the file's real magic bytes on disk after multer has written
 * it, covering the formats Jobscribe's own clients (Expo's audio recorder,
 * camera/image picker) actually produce. Not a general-purpose format
 * sniffer — just enough to catch "this obviously isn't what it claims to be"
 * before it's handed to Whisper/S3/disk as if it were.
 */
export function looksLikeAudio(filePath: string): boolean {
  const header = readHeader(filePath, 12);
  if (asciiAt(header, 0, "RIFF") && asciiAt(header, 8, "WAVE")) return true; // WAV
  if (asciiAt(header, 0, "OggS")) return true; // OGG/Opus
  if (asciiAt(header, 0, "fLaC")) return true; // FLAC
  if (asciiAt(header, 0, "ID3")) return true; // MP3 with an ID3 tag
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) return true; // MPEG audio frame sync (MP3/AAC)
  if (asciiAt(header, 4, "ftyp")) return true; // M4A/MP4 audio container (Expo's default recording format)
  if (matchesBytes(header, 0, [0x1a, 0x45, 0xdf, 0xa3])) return true; // WebM/Matroska (EBML header)
  return false;
}

export function looksLikeImage(filePath: string): boolean {
  const header = readHeader(filePath, 12);
  if (matchesBytes(header, 0, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (matchesBytes(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // PNG
  if (asciiAt(header, 0, "RIFF") && asciiAt(header, 8, "WEBP")) return true; // WEBP
  if (asciiAt(header, 4, "ftyp")) return true; // HEIC/HEIF (iPhone camera photos)
  if (asciiAt(header, 0, "GIF8")) return true; // GIF87a/GIF89a
  return false;
}
