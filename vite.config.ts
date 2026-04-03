import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		watch: {
			ignored: ['**/data/**', '**/static/uploads/**', '**/*.db', '**/*.db-shm', '**/*.db-wal']
		}
	},
	build: {
		rollupOptions: {
			output: {
				hashCharacters: 'hex',
				manualChunks(id) {
					const normalizedId = id.replaceAll('\\', '/');
					if (!normalizedId.includes('/node_modules/')) return;
					if (normalizedId.includes('/node_modules/zod/')) return 'zod';
					if (normalizedId.includes('/node_modules/date-fns/')) return 'date-fns';
					if (normalizedId.includes('/node_modules/@lucide/')) return 'icons';
					if (
						normalizedId.includes('/node_modules/bits-ui/') ||
						normalizedId.includes('/node_modules/paneforge/') ||
						normalizedId.includes('/node_modules/svelte-sonner/')
					) {
						return 'ui';
					}
				}
			}
		}
	}
});
