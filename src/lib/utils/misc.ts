/**
 * Generates a UUID. Falls back to getRandomValues outside secure contexts,
 * where crypto.randomUUID is unavailable (e.g. self-hosting over plain HTTP).
 */
export function randomId() {
	if (typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20)
	].join('-');
}

/**
 * Detects whether the current browser runs on macOS, preferring the modern
 * userAgentData.platform and falling back to the userAgent string.
 */
export function isMacPlatform() {
	if (typeof navigator === 'undefined') return false;
	const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
		.userAgentData?.platform;
	return (
		platform?.toUpperCase().includes('MAC') ?? navigator.userAgent.toUpperCase().includes('MAC')
	);
}

/**
 * Copies text to the clipboard using the modern API or a fallback.
 */
export async function copyToClipboard(text: string) {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		} else {
			const textArea = document.createElement('textarea');
			textArea.value = text;
			textArea.style.position = 'fixed';
			textArea.style.left = '-9999px';
			textArea.style.top = '0';
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			const successful = document.execCommand('copy');
			document.body.removeChild(textArea);
			return successful;
		}
	} catch {
		return false;
	}
}
