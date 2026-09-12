import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from './zip';

// Minimal zip reader used to verify createZip output round-trips.
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const files = new Map<string, Uint8Array>();
	let offset = 0;
	while (offset < bytes.length) {
		const sig = view.getUint32(offset, true);
		if (sig !== 0x04034b50) break;
		const nameLen = view.getUint16(offset + 26, true);
		const extraLen = view.getUint16(offset + 28, true);
		const compressed = view.getUint32(offset + 18, true);
		const method = view.getUint16(offset + 8, true);
		const crc = view.getUint32(offset + 14, true);
		const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
		const dataStart = offset + 30 + nameLen + extraLen;
		const data = bytes.slice(dataStart, dataStart + compressed);
		expect(method).toBe(0);
		expect(crc32(data)).toBe(crc);
		files.set(name, data);
		offset = dataStart + compressed;
	}
	// Central directory must follow the local headers.
	expect(view.getUint32(offset, true)).toBe(0x02014b50);
	return files;
}

describe('createZip', () => {
	it('round-trips entries', () => {
		const bytes = createZip([
			{ name: 'a.md', data: new TextEncoder().encode('hello') },
			{ name: 'sub/b.md', data: new TextEncoder().encode('world') }
		]);
		const files = readZip(bytes);
		expect(new TextDecoder().decode(files.get('a.md'))).toBe('hello');
		expect(new TextDecoder().decode(files.get('sub/b.md'))).toBe('world');
	});

	it('sanitizes traversal and leading slashes', () => {
		const bytes = createZip([{ name: '/abs/../evil.md', data: new TextEncoder().encode('x') }]);
		const files = readZip(bytes);
		expect([...files.keys()]).toEqual(['abs/evil.md']);
	});

	it('deduplicates repeated names', () => {
		const bytes = createZip([
			{ name: 'a.md', data: new TextEncoder().encode('1') },
			{ name: 'a.md', data: new TextEncoder().encode('2') }
		]);
		const files = readZip(bytes);
		expect(files.size).toBe(2);
		expect([...files.keys()].sort()).toEqual(['a (1).md', 'a.md']);
	});

	it('produces an empty but valid archive for no entries', () => {
		const bytes = createZip([]);
		const view = new DataView(bytes.buffer);
		expect(view.getUint32(0, true)).toBe(0x06054b50);
	});
});
