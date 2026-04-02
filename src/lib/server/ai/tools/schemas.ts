import type { JSONValue } from 'ai';
import { z } from 'zod';

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.string(),
		z.number(),
		z.boolean(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema)
	])
);

export const toolErrorSchema = z.object({
	error: z.string(),
	status: z.number().int().optional()
});

export const httpUrlSchema = z
	.string()
	.url()
	.refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
		message: 'Expected an http/https URL'
	});

export { z };
