// Browser download helpers used by export.

// Strip characters that are invalid or awkward in file names.
export function sanitizeFilename(name: string): string {
	const cleaned = name.replace(/[/\\?%*:|"<>]/g, '').trim();
	return cleaned || 'export';
}

export function downloadBlob(
	filename: string,
	data: BlobPart,
	type = 'application/octet-stream'
): void {
	const blob = data instanceof Blob ? data : new Blob([data], { type });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = sanitizeFilename(filename);
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Delay revocation so the download has time to start.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
