import cloudflare from '@sveltejs/adapter-cloudflare';
import node from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const buildTarget = process.env.BUILD_TARGET ?? 'local';

function resolveAdapter(target) {
	if (target === 'vercel') {
		return vercel();
	}

	if (target === 'cloudflare') {
		return cloudflare();
	}

	return node();
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: resolveAdapter(buildTarget)
	}
};

export default config;
