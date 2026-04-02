import type { LanguageFn } from 'lowlight';
import { getMarkdownHighlightPlan } from '$lib/utils/markdown';

type HighlightOptions = {
	aliases?: Record<string, string[]>;
	detect: boolean;
	languages: Record<string, LanguageFn>;
	subset?: string[];
};

type HighlightLanguageLoader = () => Promise<{ default: LanguageFn } | LanguageFn>;

const HIGHLIGHT_LANGUAGE_LOADERS: Record<string, HighlightLanguageLoader> = {
	arduino: () => import('highlight.js/lib/languages/arduino'),
	bash: () => import('highlight.js/lib/languages/bash'),
	c: () => import('highlight.js/lib/languages/c'),
	cpp: () => import('highlight.js/lib/languages/cpp'),
	csharp: () => import('highlight.js/lib/languages/csharp'),
	css: () => import('highlight.js/lib/languages/css'),
	diff: () => import('highlight.js/lib/languages/diff'),
	dos: () => import('highlight.js/lib/languages/dos'),
	go: () => import('highlight.js/lib/languages/go'),
	graphql: () => import('highlight.js/lib/languages/graphql'),
	ini: () => import('highlight.js/lib/languages/ini'),
	java: () => import('highlight.js/lib/languages/java'),
	javascript: () => import('highlight.js/lib/languages/javascript'),
	json: () => import('highlight.js/lib/languages/json'),
	kotlin: () => import('highlight.js/lib/languages/kotlin'),
	less: () => import('highlight.js/lib/languages/less'),
	lua: () => import('highlight.js/lib/languages/lua'),
	makefile: () => import('highlight.js/lib/languages/makefile'),
	markdown: () => import('highlight.js/lib/languages/markdown'),
	objectivec: () => import('highlight.js/lib/languages/objectivec'),
	perl: () => import('highlight.js/lib/languages/perl'),
	php: () => import('highlight.js/lib/languages/php'),
	'php-template': () => import('highlight.js/lib/languages/php-template'),
	plaintext: () => import('highlight.js/lib/languages/plaintext'),
	powershell: () => import('highlight.js/lib/languages/powershell'),
	python: () => import('highlight.js/lib/languages/python'),
	'python-repl': () => import('highlight.js/lib/languages/python-repl'),
	r: () => import('highlight.js/lib/languages/r'),
	ruby: () => import('highlight.js/lib/languages/ruby'),
	rust: () => import('highlight.js/lib/languages/rust'),
	scss: () => import('highlight.js/lib/languages/scss'),
	shell: () => import('highlight.js/lib/languages/shell'),
	sql: () => import('highlight.js/lib/languages/sql'),
	swift: () => import('highlight.js/lib/languages/swift'),
	typescript: () => import('highlight.js/lib/languages/typescript'),
	vbnet: () => import('highlight.js/lib/languages/vbnet'),
	wasm: () => import('highlight.js/lib/languages/wasm'),
	xml: () => import('highlight.js/lib/languages/xml'),
	yaml: () => import('highlight.js/lib/languages/yaml')
};

const HIGHLIGHT_LANGUAGE_ALIASES: Record<string, string[]> = {
	bash: ['console', 'shell', 'shellsession', 'sh', 'zsh'],
	cpp: ['c++', 'cc', 'cxx', 'hpp'],
	csharp: ['c#', 'cs'],
	dos: ['bat', 'cmd'],
	ini: ['toml'],
	javascript: ['js', 'jsx'],
	markdown: ['md', 'mdown', 'mkd', 'mkdn', 'mdwn'],
	mermaid: ['diagram', 'mmd'],
	objectivec: ['objective-c'],
	plaintext: ['plain', 'text', 'txt'],
	powershell: ['ps1', 'psm1'],
	python: ['py'],
	ruby: ['rb'],
	rust: ['rs'],
	typescript: ['ts', 'tsx'],
	xml: ['html', 'htm', 'svg', 'vue', 'xhtml'],
	yaml: ['yml']
};

const HIGHLIGHT_AUTO_DETECT_SUBSET = [
	'bash',
	'javascript',
	'typescript',
	'json',
	'yaml',
	'python',
	'sql',
	'css',
	'xml'
] as const;

const languageCache = new Map<string, Promise<LanguageFn | null>>();

async function resolveLanguageModule(loader: HighlightLanguageLoader): Promise<LanguageFn> {
	const loaded = await loader();
	return 'default' in loaded ? loaded.default : loaded;
}

function getLanguageAliases(language: string): string[] | undefined {
	const aliases = HIGHLIGHT_LANGUAGE_ALIASES[language];
	return aliases?.length ? aliases : undefined;
}

async function loadHighlightLanguage(language: string): Promise<LanguageFn | null> {
	if (languageCache.has(language)) {
		return languageCache.get(language)!;
	}

	const promise = (async () => {
		if (language === 'mermaid') {
			const mod = await import('$lib/utils/highlight-mermaid');
			return mod.mermaid as LanguageFn;
		}

		const loader = HIGHLIGHT_LANGUAGE_LOADERS[language];
		if (!loader) return null;
		return resolveLanguageModule(loader);
	})();

	languageCache.set(language, promise);
	return promise;
}

export async function getMarkdownHighlightOptions(md: string): Promise<HighlightOptions | null> {
	const plan = getMarkdownHighlightPlan(md);
	const requiredLanguages = new Set(plan.languages);

	if (plan.hasUnlabeledCodeBlocks) {
		for (const language of HIGHLIGHT_AUTO_DETECT_SUBSET) {
			requiredLanguages.add(language);
		}
	}

	if (requiredLanguages.size === 0) {
		return null;
	}

	const entries = await Promise.all(
		[...requiredLanguages].map(async (language) => {
			const grammar = await loadHighlightLanguage(language);
			return grammar ? ([language, grammar] as const) : null;
		})
	);

	const languages = Object.fromEntries(entries.filter((entry) => entry !== null));
	const aliases = Object.fromEntries(
		Object.keys(languages)
			.map((language) => {
				const aliasList = getLanguageAliases(language);
				return aliasList ? ([language, aliasList] as const) : null;
			})
			.filter((entry) => entry !== null)
	);

	if (Object.keys(languages).length === 0) {
		return null;
	}

	const detect = plan.hasUnlabeledCodeBlocks;

	return {
		aliases: Object.keys(aliases).length > 0 ? aliases : undefined,
		detect,
		languages,
		subset: detect
			? HIGHLIGHT_AUTO_DETECT_SUBSET.filter((language) => language in languages)
			: undefined
	};
}
