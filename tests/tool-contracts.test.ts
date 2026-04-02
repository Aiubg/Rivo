import { describe, expect, it } from 'vitest';
import type { ToolRecord } from '$lib/server/ai/tools/types';
import { toAiTools } from '$lib/server/ai/tools/ai-adapter';
import { toolErrorSchema, z } from '$lib/server/ai/tools/schemas';

describe('tool runtime contracts', () => {
	it('returns a validation error when tool input does not match its schema', async () => {
		const tool: ToolRecord = {
			definition: {
				name: 'contract_input_tool',
				description: 'Test tool',
				parameters: {
					type: 'object',
					properties: {
						value: { type: 'string' }
					},
					required: ['value']
				}
			},
			metadata: {},
			inputSchema: z.object({
				value: z.string().min(1)
			}),
			outputSchema: z.union([
				toolErrorSchema,
				z.object({
					echo: z.string()
				})
			]),
			executor: async (args) => ({
				echo: String((args as { value: string }).value)
			})
		};

		const aiTools = toAiTools([tool], () => ({ env: 'dev' }));
		const runtimeTool = aiTools.contract_input_tool;
		expect(runtimeTool?.execute).toBeTypeOf('function');
		const result = await runtimeTool!.execute!(
			{ value: 123 as never },
			{ toolCallId: 'tool-1', messages: [] }
		);

		expect(result).toEqual({
			error: 'Tool "contract_input_tool" received invalid input.'
		});
	});

	it('returns a validation error when tool output does not match its schema', async () => {
		const tool: ToolRecord = {
			definition: {
				name: 'contract_output_tool',
				description: 'Test tool',
				parameters: {
					type: 'object',
					properties: {}
				}
			},
			metadata: {},
			inputSchema: z.object({}),
			outputSchema: z.union([
				toolErrorSchema,
				z.object({
					ok: z.literal(true)
				})
			]),
			executor: async () => ({
				ok: false
			})
		};

		const aiTools = toAiTools([tool], () => ({ env: 'dev' }));
		const runtimeTool = aiTools.contract_output_tool;
		expect(runtimeTool?.execute).toBeTypeOf('function');
		const result = await runtimeTool!.execute!({}, { toolCallId: 'tool-2', messages: [] });

		expect(result).toEqual({
			error: 'Tool "contract_output_tool" returned invalid output.'
		});
	});
});
