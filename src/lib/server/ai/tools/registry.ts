import type { ToolRecord } from '$lib/server/ai/tools/types';
import { getModelRegistryItem } from '$lib/ai/model-registry';
import { calculatorTool } from '$lib/server/ai/tools/builtin/calculator';
import { wolframAlphaTool } from '$lib/server/ai/tools/builtin/wolfram';
import { tavilySearchTool } from '$lib/server/ai/tools/builtin/tavily-search';
import { tavilyExtractTool } from '$lib/server/ai/tools/builtin/tavily-extract';
import { bilibiliMusicTool } from '$lib/server/ai/tools/builtin/bilibili-music';
import { uiCardTool } from '$lib/server/ai/tools/builtin/ui-card';

const records: ToolRecord[] = [
	calculatorTool,
	wolframAlphaTool,
	tavilySearchTool,
	tavilyExtractTool,
	bilibiliMusicTool,
	uiCardTool
];

const toolByName = new Map(records.map((tool) => [tool.definition.name, tool]));

function isToolEnabledForModel(tool: ToolRecord, modelId: string): boolean {
	return !!getModelRegistryItem(modelId) && toolByName.get(tool.definition.name) === tool;
}

export const ToolRegistry = {
	list(): ToolRecord[] {
		return records;
	},

	get(name: string): ToolRecord | undefined {
		return toolByName.get(name);
	},

	listForModel(modelId: string): ToolRecord[] {
		return records.filter((t) => isToolEnabledForModel(t, modelId));
	},

	isEnabledForModel(toolName: string, modelId: string): boolean {
		const tool = this.get(toolName);
		if (!tool) return false;
		return isToolEnabledForModel(tool, modelId);
	}
};
