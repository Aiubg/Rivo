import type { ToolRecord, ToolContext } from '$lib/server/ai/tools/types';
import { dynamicTool, jsonSchema } from 'ai';
import type { JSONSchema7, JSONValue, ToolSet } from 'ai';
import { logger } from '$lib/utils/logger';

function buildValidationError(toolName: string, phase: 'input' | 'output'): JSONValue {
	return {
		error:
			phase === 'input'
				? `Tool "${toolName}" received invalid input.`
				: `Tool "${toolName}" returned invalid output.`
	};
}

export function toAiTools(tools: ToolRecord[], buildCtx: () => ToolContext): ToolSet {
	const result: ToolSet = {};

	for (const tool of tools) {
		const { definition, executor } = tool;

		const inputSchema = jsonSchema(definition.parameters as JSONSchema7);

		result[definition.name] = dynamicTool({
			description: definition.description,
			inputSchema,
			execute: async (input) => {
				const validatedInput = tool.inputSchema?.safeParse(input);
				if (validatedInput && !validatedInput.success) {
					logger.warn('[tool] input validation failed', {
						toolName: definition.name,
						issues: validatedInput.error.issues
					});
					return buildValidationError(definition.name, 'input');
				}

				const ctx = buildCtx();
				const data = await executor(
					(validatedInput ? validatedInput.data : (input as JSONValue)) as JSONValue,
					ctx
				);
				const outputSchema = tool.outputSchema;
				if (!outputSchema) {
					return data;
				}
				const validatedOutput = outputSchema.safeParse(data);
				if (validatedOutput.success) {
					return validatedOutput.data;
				}

				logger.error('[tool] output validation failed', {
					toolName: definition.name,
					issues: validatedOutput.error.issues
				});
				const fallback = buildValidationError(definition.name, 'output');
				const fallbackOutput = outputSchema.safeParse(fallback);
				return fallbackOutput.success ? fallbackOutput.data : fallback;
			}
		});
	}

	return result;
}
