// Minimal ZIP writer (store method, no compression). Notes are mostly small
// markdown files, so uncompressed archives are fine and keep this
// dependency-free. Produces a spec-compliant archive: local headers, central
// directory, end-of-central-directory record, UTF-8 name flag set.

export interface ZipEntry {
	// Path inside the archive, forward slashes. Leading slashes and '..'
	// segments are stripped.
	name: string;
	data: Uint8Array;
	modified?: Date;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

export function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeName(name: string): string {
	return name
		.replace(/\\/g, '/')
		.split('/')
		.filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
		.join('/');
}

function dosDateTime(date: Date): { time: number; date: number } {
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		date:
			(Math.max(0, date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
	};
}

export function createZip(entries: ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const usedNames = new Set<string>();

	// Deduplicate names so a zip never contains two identical paths.
	const prepared = entries.map((entry) => {
		let name = sanitizeName(entry.name) || 'untitled';
		if (usedNames.has(name)) {
			const dot = name.lastIndexOf('.');
			const stem = dot > 0 ? name.slice(0, dot) : name;
			const ext = dot > 0 ? name.slice(dot) : '';
			let i = 1;
			while (usedNames.has(`${stem} (${i})${ext}`)) i++;
			name = `${stem} (${i})${ext}`;
		}
		usedNames.add(name);
		return {
			nameBytes: encoder.encode(name),
			data: entry.data,
			crc: crc32(entry.data),
			mtime: dosDateTime(entry.modified ?? new Date())
		};
	});

	let size = 0;
	for (const e of prepared) size += 30 + e.nameBytes.length + e.data.length;
	const centralSize = prepared.reduce((sum, e) => sum + 46 + e.nameBytes.length, 0);
	const total = size + centralSize + 22;

	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	let offset = 0;
	const centralOffsets: number[] = [];

	const write16 = (v: number) => {
		view.setUint16(offset, v, true);
		offset += 2;
	};
	const write32 = (v: number) => {
		view.setUint32(offset, v >>> 0, true);
		offset += 4;
	};

	// Local file headers + data
	for (const e of prepared) {
		centralOffsets.push(offset);
		write32(0x04034b50);
		write16(20); // version needed
		write16(0x0800); // UTF-8 names
		write16(0); // store
		write16(e.mtime.time);
		write16(e.mtime.date);
		write32(e.crc);
		write32(e.data.length);
		write32(e.data.length);
		write16(e.nameBytes.length);
		write16(0); // extra length
		out.set(e.nameBytes, offset);
		offset += e.nameBytes.length;
		out.set(e.data, offset);
		offset += e.data.length;
	}

	// Central directory
	const centralStart = offset;
	prepared.forEach((e, i) => {
		write32(0x02014b50);
		write16(20); // version made by
		write16(20); // version needed
		write16(0x0800);
		write16(0);
		write16(e.mtime.time);
		write16(e.mtime.date);
		write32(e.crc);
		write32(e.data.length);
		write32(e.data.length);
		write16(e.nameBytes.length);
		write16(0); // extra
		write16(0); // comment
		write16(0); // disk number
		write16(0); // internal attrs
		write32(0); // external attrs
		write32(centralOffsets[i]);
		out.set(e.nameBytes, offset);
		offset += e.nameBytes.length;
	});

	// End of central directory
	write32(0x06054b50);
	write16(0);
	write16(0);
	write16(prepared.length);
	write16(prepared.length);
	write32(offset - centralStart);
	write32(centralStart);
	write16(0);

	return out.subarray(0, offset);
}
