import { streamText, stepCountIs } from 'ai';
import { resolveModelRequestConfig } from '$lib/ai/model-registry';
import type { ModelRequestOptions } from '$lib/ai/model-options';
import { myProvider } from '$lib/server/ai/models';
import { systemPrompt } from '$lib/server/ai/prompts';
import {
	convertToCoreMessagesWithResolvedImages,
	mapModelProviderErrorToErrorKey
} from '$lib/server/ai/utils';
import { selectTools, buildToolContext } from '$lib/server/ai/tools/selection';
import { toAiTools } from '$lib/server/ai/tools/ai-adapter';

export type GenerationMessages = Parameters<typeof convertToCoreMessagesWithResolvedImages>[0];
export type GenerationPersonalization = Parameters<typeof systemPrompt>[0]['personalization'];
export type GenerationContext = Parameters<typeof systemPrompt>[0]['context'];

export type ExecuteGenerationCoreOptions = {
	selectedChatModel: string;
	messages: GenerationMessages;
	chatId?: string;
	userId?: string;
	modelOptions?: ModelRequestOptions | null;
	personalization?: GenerationPersonalization;
	context?: GenerationContext;
	abortSignal?: AbortSignal | null;
};

export async function executeGenerationCore(options: ExecuteGenerationCoreOptions) {
	const coreMessages = await convertToCoreMessagesWithResolvedImages(options.messages);
	let nextSearchResultId = 1;
	const allocateSearchResultId = () => nextSearchResultId++;
	const selectionCtx = {
		modelId: options.selectedChatModel,
		userId: options.userId,
		chatId: options.chatId,
		allocateSearchResultId
	};
	const selectedToolRecords = selectTools(selectionCtx);
	const tools =
		selectedToolRecords.length > 0
			? toAiTools(selectedToolRecords, () => buildToolContext(selectionCtx))
			: undefined;
	const modelRequestConfig = resolveModelRequestConfig({
		modelId: options.selectedChatModel,
		modelOptions: options.modelOptions
	});

	const result = streamText({
		model: myProvider.languageModel(options.selectedChatModel),
		system: systemPrompt({
			selectedChatModel: options.selectedChatModel,
			personalization: options.personalization,
			context: options.context
		}),
		messages: coreMessages,
		...(tools ? { tools, stopWhen: stepCountIs(30) } : {}),
		...(modelRequestConfig.providerOptions
			? { providerOptions: modelRequestConfig.providerOptions }
			: {}),
		...(options.abortSignal ? { abortSignal: options.abortSignal } : {})
	});

	return {
		result,
		modelRequestConfig,
		selectedToolRecords
	};
}

export function mapGenerationProviderErrorToErrorKey(e: unknown): string | null {
	return mapModelProviderErrorToErrorKey(e);
}
