import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY } from '$lib/ai/model-registry';
import { systemPrompt } from '$lib/server/ai/prompts';
import { selectTools } from '$lib/server/ai/tools/selection';

describe('system prompt', () => {
	it('adds code-block language guidance', () => {
		const prompt = systemPrompt({ selectedChatModel: MODEL_REGISTRY[0]!.id });

		expect(prompt).toContain('## Code Blocks');
		expect(prompt).toContain(
			'When you provide a fenced code block, include the most specific correct language identifier after the opening triple backticks whenever you can determine it.'
		);
		expect(prompt).toContain(
			'Use plain triple backticks without a language tag only when the language genuinely cannot be determined.'
		);
	});

	it('adds tool-use guardrails when tools are available', () => {
		const modelId = MODEL_REGISTRY.find(
			(model) => selectTools({ modelId: model.id }).length > 0
		)?.id;

		expect(modelId).toBeTruthy();

		const prompt = systemPrompt({ selectedChatModel: modelId! });

		expect(prompt).toContain('## Tool Use');
		expect(prompt).toContain(
			'A tool counts as used only after the runtime actually executes it and returns a result in the current turn.'
		);
		expect(prompt).toContain(
			'Do not treat tool results from earlier turns as fresh results for the current turn unless the user explicitly asks to reuse them and they are still clearly applicable.'
		);
		expect(prompt).toContain(
			'Do not narrate tool use before it happens. Either call the tool or answer without claiming tool usage.'
		);
	});

	it('adds fresh-search guidance when search tools are available', () => {
		const modelId = MODEL_REGISTRY.find((model) =>
			selectTools({ modelId: model.id }).some((tool) => tool.definition.name === 'tavily_search')
		)?.id;

		expect(modelId).toBeTruthy();

		const prompt = systemPrompt({ selectedChatModel: modelId! });

		expect(prompt).toContain(
			'If the user asks for the latest, current, live, or a fresh re-check, do not rely on old search results from earlier turns; use search again.'
		);
		expect(prompt).toContain(
			'If you use `tavily_search` results in your final answer, place inline citation markers immediately after the specific sentence, bullet, or paragraph they support, using this exact format: `[@id]`.'
		);
		expect(prompt).toContain(
			'For multi-sentence answers, cite each sourced sentence or sourced bullet separately. Do not collect all citations only at the end of the entire reply or only in one final trailing line.'
		);
	});
});
