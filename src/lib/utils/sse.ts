export type ParsedSseFrame = {
	id?: string;
	data: string;
};

export function drainSseFrames(buffer: string): {
	frames: string[];
	remaining: string;
} {
	const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const frames = normalized.split('\n\n');
	const remaining = frames.pop() ?? '';

	return {
		frames,
		remaining
	};
}

export function parseSseFrame(frame: string): ParsedSseFrame | null {
	const dataLines: string[] = [];
	let id: string | undefined;

	for (const rawLine of frame.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith(':')) {
			continue;
		}

		if (line.startsWith('id:')) {
			const nextId = line.slice(3).trim();
			id = nextId.length > 0 ? nextId : undefined;
			continue;
		}

		if (line.startsWith('data:')) {
			dataLines.push(line.slice(5).trimStart());
		}
	}

	if (dataLines.length === 0) {
		return null;
	}

	return {
		...(id ? { id } : {}),
		data: dataLines.join('\n')
	};
}
