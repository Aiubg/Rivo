export function markdownNeedsHighlight(md: string): boolean {
	return /```/.test(md);
}

export function markdownNeedsMath(md: string): boolean {
	return /(\$\$[\s\S]*\$\$)|(?<!\\)\$(?!\s)([\s\S]*?)(?<!\\)\$/m.test(md);
}

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string> = {
	bat: 'dos',
	'c#': 'csharp',
	'c++': 'cpp',
	cc: 'cpp',
	cmd: 'dos',
	console: 'bash',
	cs: 'csharp',
	cxx: 'cpp',
	diagram: 'mermaid',
	dos: 'dos',
	html: 'xml',
	htm: 'xml',
	hpp: 'cpp',
	js: 'javascript',
	json5: 'json',
	jsx: 'javascript',
	md: 'markdown',
	mdown: 'markdown',
	mkd: 'markdown',
	mkdn: 'markdown',
	mdwn: 'markdown',
	mmd: 'mermaid',
	'objective-c': 'objectivec',
	objectivec: 'objectivec',
	plain: 'plaintext',
	ps1: 'powershell',
	psm1: 'powershell',
	py: 'python',
	rb: 'ruby',
	rs: 'rust',
	sh: 'bash',
	shell: 'bash',
	shellsession: 'bash',
	svg: 'xml',
	text: 'plaintext',
	toml: 'ini',
	ts: 'typescript',
	tsx: 'typescript',
	txt: 'plaintext',
	vue: 'xml',
	xhtml: 'xml',
	xml: 'xml',
	yml: 'yaml',
	zsh: 'bash'
};

const SUPPORTED_HIGHLIGHT_LANGUAGES = new Set([
	'arduino',
	'bash',
	'c',
	'cpp',
	'csharp',
	'css',
	'diff',
	'dos',
	'go',
	'graphql',
	'ini',
	'java',
	'javascript',
	'json',
	'kotlin',
	'less',
	'lua',
	'makefile',
	'markdown',
	'mermaid',
	'objectivec',
	'perl',
	'php',
	'php-template',
	'plaintext',
	'powershell',
	'python',
	'python-repl',
	'r',
	'ruby',
	'rust',
	'scss',
	'shell',
	'sql',
	'swift',
	'typescript',
	'vbnet',
	'wasm',
	'xml',
	'yaml'
]);

export function normalizeMarkdownCodeLanguage(info: string): string | null {
	const [firstToken = ''] = info.trim().split(/\s+/);
	if (!firstToken) return null;

	const normalized = firstToken
		.replace(/^\{+/, '')
		.replace(/\}+$/, '')
		.replace(/^\./, '')
		.replace(/^language-/, '')
		.replace(/[;,]+$/, '')
		.toLowerCase();

	if (!normalized) return null;

	const resolved = HIGHLIGHT_LANGUAGE_ALIASES[normalized] ?? normalized;
	return SUPPORTED_HIGHLIGHT_LANGUAGES.has(resolved) ? resolved : null;
}

export function getMarkdownHighlightPlan(md: string): {
	languages: string[];
	hasUnlabeledCodeBlocks: boolean;
} {
	const languages = new Set<string>();
	let hasUnlabeledCodeBlocks = false;
	let insideFence = false;

	for (const line of md.split(/\r?\n/)) {
		const match = /^```(.*)$/.exec(line);
		if (!match) continue;

		if (!insideFence) {
			insideFence = true;
			const language = normalizeMarkdownCodeLanguage(match[1] ?? '');
			if (language) {
				languages.add(language);
			} else {
				hasUnlabeledCodeBlocks = true;
			}
		} else {
			insideFence = false;
		}
	}

	return {
		languages: [...languages],
		hasUnlabeledCodeBlocks
	};
}
