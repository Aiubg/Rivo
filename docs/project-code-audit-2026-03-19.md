# 项目代码审查建议

审查日期：2026-03-19

本文件只记录“建议性意见”和后续排期方向；本轮已经确认且可低风险落地的问题，已直接在代码中修复。

## 审查范围

- 覆盖 `src`、`tests`、`scripts` 目录。
- 结合 `pnpm lint`、`pnpm check`、`pnpm test` 与手工代码审阅进行评估。

## 建议优先处理

### 1. 为旧上传数据补一份迁移脚本

当前上传资源已经按 `userId` 做了访问隔离，但历史上已经写入的 `metadata.json` 记录可能没有 `userId`。这类旧数据在已登录场景下会被安全地隐藏，而不是继续暴露给所有用户。

建议：

- 提供一次性迁移脚本，把可识别的历史上传记录补齐 `userId`。
- 如果历史数据无法可靠归属，至少提供后台清理或人工认领方案。

相关文件：

- `src/lib/server/files/upload-store.ts`
- `src/routes/(chat)/api/files/upload/+server.ts`

### 2. 匿名模式的文件隔离策略需要明确

当前匿名模式仍然是“共享上传目录”的语义，因为匿名访问天然没有稳定的用户标识。这意味着如果产品预期是“不同匿名会话之间也要彼此隔离”，现有架构还不满足。

建议：

- 明确产品语义：匿名模式到底是共享临时空间，还是按浏览器会话隔离。
- 如果要隔离，增加会话级命名空间或临时存储桶，而不是继续使用全局 `static/uploads`。

相关文件：

- `src/lib/utils/constants.ts`
- `src/lib/server/files/upload-store.ts`
- `src/routes/(chat)/api/files/*`

### 3. `ChatState` 体量过大，建议拆分

`src/lib/hooks/chat-state.svelte.ts` 当前约 1172 行，已经同时承担了消息提交、文件上传、流式解析、断线续传、分支切换、历史同步等多种职责。继续在这个文件上迭代，变更风险会越来越高。

建议：

- 拆成至少 3 个模块：提交/草稿、流式处理、分支与选择状态。
- 把流式解析和恢复逻辑提成纯函数或独立服务，便于单测。
- 让 `ChatState` 只保留组合与状态协调职责。

相关文件：

- `src/lib/hooks/chat-state.svelte.ts`

### 4. 断线续传建议增加“有上限的重试策略”

目前 `resumeActiveRun` 失败后会继续递归调度重试，这虽然提高了恢复概率，但在长时间网络抖动或后端持续异常时，可能导致客户端长期后台重连、用户无感知地消耗资源。

建议：

- 增加最大重试次数或最大恢复时长。
- 超过阈值后把状态切到“可手动恢复”，并给用户明确提示。
- 把重试次数、最后一次错误、最后游标位置纳入调试日志。

相关文件：

- `src/lib/hooks/chat-state.svelte.ts`

### 5. 聊天搜索建议改为可索引文本，而不是直接 `LIKE` JSON

当前 `searchChats` 对 `chat.title` 和 `message.parts` 做 `LIKE` 查询，其中 `message.parts` 是结构化 JSON。随着消息量增长，这个方案在性能和结果质量上都会吃亏。

建议：

- 为消息额外维护一列纯文本 `searchText`。
- 条件允许时切到 SQLite FTS5。
- 将搜索结果的摘要生成从“运行时现拼”改为“写入时预处理”。

相关文件：

- `src/lib/server/db/queries.ts`

### 6. 为工具输出建立明确的契约层

这轮暴露出来的两个工具回归，本质上都是“工具返回结构漂移，但没有在实现层做统一约束”。虽然现在已经补了测试，但后续工具一多，仍然容易再发生类似问题。

建议：

- 给每个工具的输入和输出都补上明确 schema。
- 在工具执行结果出站前做一次结构校验。
- 为工具渲染层和工具执行层共享同一份结果类型定义，减少双边各自假设。

相关文件：

- `src/lib/server/ai/tools/builtin/ui-card.ts`
- `src/lib/server/ai/tools/builtin/bilibili-music.ts`
- `src/lib/components/messages/tool-call.svelte`

### 7. 补齐接口级测试

当前测试以工具函数和工具链单测为主，已经有不错基础，但对文件接口、鉴权边界、上传所有权、流式恢复等关键路径，仍然缺少更贴近真实请求的接口级覆盖。

建议：

- 为 `/api/files`、`/api/files/preview`、`/api/files/delete`、`/api/files/rename` 增加接口测试。
- 为 runs 创建/取消/续传链路增加最小集成测试。
- 至少覆盖“无权限用户”“跨用户访问”“旧元数据缺失”“流中断恢复失败”这几类场景。

相关文件：

- `src/routes/(chat)/api/files/*`
- `src/routes/(chat)/api/runs/*`
- `tests/*`
