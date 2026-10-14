import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { root, readExtension } from "./extension-files.mjs";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  for (let bit = 0; bit < 8; bit++) index = (index >>> 1) ^ ((index & 1) ? 0xedb88320 : 0);
  return index >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// Standard ZIP with raw DEFLATE, UTF-8 names and a fixed timestamp for reproducibility.
function buildZip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const filename = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12); // 1980-01-01, the earliest ZIP date.
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    header.copy(record, 6, 4, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function verifyZip(archive, entries) {
  const endOffset = archive.length - 22;
  assert.ok(endOffset >= 0, "Invalid ZIP length");
  assert.equal(archive.readUInt32LE(endOffset), 0x06054b50, "Missing ZIP directory");
  assert.equal(archive.readUInt16LE(endOffset + 10), entries.length, "Unexpected file count");
  const directoryOffset = archive.readUInt32LE(endOffset + 16);
  const directorySize = archive.readUInt32LE(endOffset + 12);
  assert.equal(directoryOffset + directorySize, endOffset, "Invalid ZIP directory size");
  let position = directoryOffset;
  const names = new Set();
  for (const expected of entries) {
    assert.equal(archive.readUInt32LE(position), 0x02014b50, "Invalid ZIP entry");
    assert.equal(archive.readUInt16LE(position + 8), 0x800, "Expected UTF-8 file names");
    assert.equal(archive.readUInt16LE(position + 10), 8, "Expected DEFLATE compression");
    const checksum = archive.readUInt32LE(position + 16);
    const size = archive.readUInt32LE(position + 20);
    assert.equal(archive.readUInt32LE(position + 24), expected.data.length, "Invalid uncompressed size");
    const nameSize = archive.readUInt16LE(position + 28);
    const extraSize = archive.readUInt16LE(position + 30);
    const commentSize = archive.readUInt16LE(position + 32);
    const localOffset = archive.readUInt32LE(position + 42);
    const name = archive.subarray(position + 46, position + 46 + nameSize).toString("utf8");
    assert.equal(name, expected.name, "Release contains an unexpected file");
    assert.ok(!names.has(name), `Duplicate ZIP entry: ${name}`);
    names.add(name);
    assert.equal(archive.readUInt32LE(localOffset), 0x04034b50, `Invalid local entry: ${name}`);
    assert.equal(archive.readUInt16LE(localOffset + 6), 0x800, `Invalid local flags: ${name}`);
    assert.equal(archive.readUInt16LE(localOffset + 8), 8, `Invalid local method: ${name}`);
    assert.equal(archive.readUInt32LE(localOffset + 14), checksum, `Invalid local CRC: ${name}`);
    assert.equal(archive.readUInt32LE(localOffset + 18), size, `Invalid local compressed size: ${name}`);
    assert.equal(archive.readUInt32LE(localOffset + 22), expected.data.length, `Invalid local uncompressed size: ${name}`);
    const localNameSize = archive.readUInt16LE(localOffset + 26);
    const localExtraSize = archive.readUInt16LE(localOffset + 28);
    assert.equal(archive.subarray(localOffset + 30, localOffset + 30 + localNameSize).toString("utf8"), name);
    const dataOffset = localOffset + 30 + localNameSize + localExtraSize;
    assert.ok(dataOffset + size <= directoryOffset, `Invalid data size: ${name}`);
    const data = inflateRawSync(archive.subarray(dataOffset, dataOffset + size));
    assert.equal(crc32(data), checksum, `CRC mismatch: ${name}`);
    assert.ok(data.equals(expected.data), `Release differs from source: ${name}`);
    position += 46 + nameSize + extraSize + commentSize;
  }
  assert.equal(position, endOffset, "Unexpected ZIP directory entries");
}

try {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--check"), "Usage: node scripts/package.mjs [--check]");
  const { metadata, entries } = readExtension();
  const filename = path.join(root, "dist", `${metadata.name}-${metadata.version}.zip`);
  if (args[0] === "--check") {
    assert.ok(fs.existsSync(filename), "Release package not found. Run npm run package first.");
    verifyZip(fs.readFileSync(filename), entries);
    console.log(`Verified ${entries.length} release files against current source: ${path.relative(root, filename)}`);
  } else {
    const archive = buildZip(entries);
    verifyZip(archive, entries);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, archive);
    console.log(`Created ${path.relative(root, filename)} (${entries.length} files, ${archive.length} bytes).`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
