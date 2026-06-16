# Rivo 优化待办清单

评估日期：2026-06-14

本文是当前项目优化工作的唯一保留文档。所有条目均以 checkbox 形式记录，方便后续直接按优先级执行。

---

## P0：执行路径收敛

- [ ] 抽出共享的生成执行核心，例如 `executeGenerationCore()`，统一以下逻辑：
  - [x] `convertToCoreMessagesWithResolvedImages`
  - [x] `selectTools` / `buildToolContext`
  - [x] `resolveModelRequestConfig`
  - [x] `systemPrompt`
  - [x] `streamText`
  - [ ] `consumeUIMessageStream`
  - [ ] citation metrics
  - [ ] assistant message persistence
- [x] 让 `RunExecutor` 调用共享生成核心，避免和 `/api/chat` 重复维护生成逻辑。
- [x] 让 `/api/chat` 匿名直连路径调用共享生成核心。
- [ ] 评估匿名聊天是否也应进入 Run 模式。
- [ ] 如果匿名聊天进入 Run 模式，设计匿名 run owner/scope，解决 `GenerationRun.userId` 当前非空的问题。
- [x] 为共享生成核心补充单元测试，覆盖模型参数、工具选择、provider options 和错误映射。
- [ ] 为登录 Run 路径补充集成测试，确保 SSE、持久化、恢复、取消行为不回退。
- [x] 为匿名直连路径补充测试，确保共享核心接入后仍能正常流式响应。

---

## P1：匿名停止语义

- [x] 调整 `/api/chat`，让服务端感知 `request.signal` 中断。
- [x] 客户端断开或用户停止时，停止 `/api/chat` 的 observer 分支继续 `consumeUIMessageStream`。
- [x] 客户端断开或用户停止时，避免保存用户已取消的 assistant 消息。
- [x] 匿名路径停止后，如果已有部分可见输出，明确是否保留在前端状态中。
- [x] 增加匿名聊天停止测试：
  - [x] 用户点击停止后不继续 upsert assistant 消息。
  - [x] 客户端断开后服务端监督分支退出。
  - [x] 部分输出和无输出两种情况行为一致。

---

## P1：注册表索引化

- [x] 在 `src/lib/ai/model-registry.ts` 中建立 `modelRegistryById`。
- [x] 将 `getModelRegistryItem()` 从 `MODEL_REGISTRY.find()` 改为 Map 查询。
- [x] 将 `src/lib/server/ai/models.ts` 中的模型查找改为复用 `getModelRegistryItem()`。
- [x] 将 `src/lib/server/ai/utils.ts` 中的模型查找改为复用 `getModelRegistryItem()`。
- [x] 在 `src/lib/server/ai/tools/registry.ts` 中建立 `toolByName`。
- [x] 不建立 `toolConfigByName`，因为本轮已删除空壳工具配置。
- [x] 将 `ToolRegistry.get()` 从 `records.find()` 改为 Map 查询。
- [x] 补充测试，覆盖未知 model id、未知 tool name、已知 tool name 查询。

---

## P1：清理或真实启用工具管理配置

- [x] 决定 `managerConfig` 的最终方向：删除空壳，或接入真实配置。
- [x] 如果删除空壳：
  - [x] 删除 `ToolManagerConfigItem`。
  - [x] 删除 `managerConfig`。
  - [x] 删除 `findConfig()`。
  - [x] 简化 `isToolEnabledForModel()`。
- [x] 本轮不接入真实配置；如后续需要，再单独设计环境变量和模型级 allowlist/blocklist。
- [x] 确保工具列表、模型工具能力、实验工具过滤逻辑保持一致。

---

## P1：localStorage key 规范化

- [x] 新增统一 storage key helper，例如 `src/lib/utils/storage-keys.ts`。
- [x] 统一 key 格式为 `rivo:v1:<domain>:<id>`。
- [x] 迁移聊天分支路径 key：
  - [x] 从 `chat_path_${chat.id}` 读取旧值。
  - [x] 写入新 key。
  - [x] 成功迁移后清理旧 key。
- [x] 迁移 run cursor key：
  - [x] 从 `run_cursor_${runId}` 读取旧值。
  - [x] 写入新 key。
  - [x] 成功迁移后清理旧 key。
- [x] 迁移草稿 key：
  - [x] 从 `chat_input_draft:${id}` 读取旧值。
  - [x] 写入新 key。
  - [x] 成功迁移后清理旧 key。
- [x] 统一 `Resizable.PaneGroup` 的 `autoSaveId` 命名。
- [x] 为 storage key helper 增加单元测试。
- [ ] 手动验证已有草稿、聊天分支选择、run 恢复 cursor 不丢失。

---

## P2：可操作错误内联展示

- [ ] 设计 assistant 消息内联错误状态。
- [ ] 定义错误展示数据结构，至少包含：
  - [ ] error key
  - [ ] 本地化文案
  - [ ] 是否可重试
  - [ ] 可选操作按钮
- [ ] 将 RunExecutor 推送的 `{ type: 'error', errorText }` 转成消息内联错误。
- [ ] 对缺少 API key 的错误提供“打开设置”入口。
- [ ] 对 vision 不支持的错误提供“切换模型”入口。
- [ ] 对临时模型请求失败提供“重试”入口。
- [ ] 保留 toast 作为辅助提示，但不再作为可操作错误的唯一反馈。
- [ ] 补充测试，覆盖：
  - [ ] `models.missing_api_key`
  - [ ] `models.vision_not_supported`
  - [ ] `chat.model_request_failed`
  - [ ] `run.failed`
- [ ] 手动验证错误气泡在长对话和流式中断场景下不会丢失。

---

## P2：拖拽上传 overlay 兜底

- [ ] 为聊天页面增加 window/document 级 `dragleave` 监听。
- [ ] 当 `event.relatedTarget === null` 时重置 `dragCounter` 和 `isDragging`。
- [ ] 为 window/document 级 `drop` 增加兜底重置。
- [ ] 页面失焦或拖出浏览器窗口时重置 overlay 状态。
- [ ] 手动验证：
  - [ ] 拖入文件后 overlay 显示。
  - [ ] 拖出窗口后 overlay 隐藏。
  - [ ] 子元素之间移动不会导致 overlay 闪烁。
  - [ ] drop 后 overlay 一定隐藏。

---

## P2：cursor 和流刷新阈值常量化

- [x] 将 `process-stream.ts` 中 cursor 持久化的 `250ms` 抽成命名常量。
- [x] 将 cursor 持久化的 `25` 条事件阈值抽成命名常量。
- [x] 为这些常量添加简短说明，解释慢模型和高频流之间的取舍。
- [x] 保持现有默认行为不变。
- [x] 补充最小测试，确保 cursor 持久化触发条件不变。

---

## P3：附件解析保护

- [ ] 为 docx/xlsx 解析增加耗时日志，记录文件大小、类型、解析耗时、输出字符数。
- [ ] 为 xlsx 解析增加 sheet 数限制。
- [ ] 为 xlsx 解析增加每个 sheet 行数限制。
- [ ] 为 xlsx 解析增加总输出字符数提前截断。
- [ ] 为 docx 解析增加大文件提示或更严格保护。
- [ ] 确认当前 25MB 上传上限是否适合 docx/xlsx 文本抽取。
- [ ] 增加测试：
  - [ ] 多 sheet xlsx 被正确截断。
  - [ ] 超长 xlsx 不会输出超过限制。
  - [ ] docx 输出保持现有行为。
  - [ ] 截断提示文本存在。
- [ ] 根据日志结果再决定是否引入 worker 或更复杂的流式解析。

---

## P3：消息列表完整虚拟滚动评估

- [ ] 保留当前轻量窗口化渲染作为基线。
- [ ] 构造 100、500、1000 条消息的性能测试数据。
- [ ] 测量当前实现的首屏渲染、滚动、流式更新表现。
- [ ] 如果当前窗口化不足，再评估完整虚拟滚动方案。
- [ ] 虚拟滚动方案必须验证：
  - [ ] hash 定位。
  - [ ] 分支切换。
  - [ ] 自动滚底。
  - [ ] 消息 outline 导航。
  - [ ] 动态高度消息。
  - [ ] tool call 展开收起。
  - [ ] reasoning 展开收起。
- [ ] 未出现明确性能瓶颈前，不优先替换当前实现。

---

## P3：欢迎页 composer CSS 化实验

- [ ] 单独开实验分支，不与其它优化混做。
- [ ] 尝试用 CSS 布局替代 `composerBaselineHeight` 测量逻辑。
- [ ] 尝试减少或移除 welcome anchor height。
- [ ] 尝试减少 ResizeObserver 数量。
- [ ] 验证以下场景：
  - [ ] 空对话欢迎页。
  - [ ] 输入单行。
  - [ ] 输入多行。
  - [ ] 附件上传中。
  - [ ] 已添加附件。
  - [ ] thinking mode badge。
  - [ ] 移动端布局。
  - [ ] 移动端键盘弹起。
  - [ ] 深色模式。
  - [ ] 浅色模式。
- [ ] 如果视觉稳定性不如当前实现，放弃替换。

---

## P3：`runSerializedWrite` 并发评估

- [ ] 保持当前本地 libsql 全局写队列不变。
- [ ] 增加 run event 写入耗时日志或调试指标。
- [ ] 构造多 chat 并发 run 压测。
- [ ] 对比以下指标：
  - [ ] run event append 延迟。
  - [ ] SQLite busy/retry 情况。
  - [ ] SSE 推送延迟。
  - [ ] 消息最终持久化耗时。
- [ ] 只有确认全局写队列成为瓶颈后，再评估 per-run 串行或批处理增强。
- [ ] 如果改 per-run 串行，必须同时设计 SQLite busy retry 策略。

---

## P3：RunExecutor 队列结构评估

- [ ] 保持当前 `queue.findIndex()` 实现不变。
- [ ] 增加 queued run 数量的调试日志或指标。
- [ ] 当出现长队列或后台任务需求时，再设计按 chatId 分桶的队列。
- [ ] 分桶队列需要保持同一 chat 不并发执行。
- [ ] 分桶队列需要保持跨 chat 的公平性。
- [ ] 分桶队列需要覆盖取消 queued run 的行为。

---

## 建议 PR 拆分

- [x] PR 1：低风险清理
  - [x] 模型注册表 Map。
  - [x] ToolRegistry Map。
  - [x] 清理或启用 `managerConfig`。
  - [x] cursor 阈值抽常量。
- [x] PR 2：本地存储 key 规范化
  - [x] 新增 storage key helper。
  - [x] 新旧 key 兼容迁移。
  - [x] 覆盖 chat path、run cursor、draft key、layout autoSaveId。
- [x] PR 3：匿名停止语义
  - [x] `/api/chat` 感知 request abort。
  - [x] observer 分支停止 upsert。
  - [x] 增加匿名流中断测试。
- [ ] PR 4：执行路径收敛
  - [x] 抽共享 generation core。
  - [x] 登录 RunExecutor 接入。
  - [x] 匿名 `/api/chat` 接入共享核心。
  - [ ] 再评估是否让匿名也进入 Run 模型。
- [ ] PR 5：错误反馈体验
  - [ ] 定义 assistant inline error 状态。
  - [ ] 消息气泡展示错误。
  - [ ] 可操作错误加按钮。
  - [ ] toast 降级为辅助提示。

---

## 当前不作为优先优化项

- [ ] 不优先重写消息列表为完整虚拟滚动，除非现有窗口化在性能测试中不足。
- [ ] 不优先将 `runSerializedWrite` 改成 per-run 串行，除非压测证明全局写队列成为瓶颈。
- [ ] 不优先重写 composer 布局，除非 CSS 实验能稳定覆盖现有边界。
- [ ] 不机械替换所有 `get(t)`，事件回调和异步逻辑中可保留命令式取值。
- [ ] 不把 `chat-composer-*` 与 `input-group-chat` 的自定义 class 当作独立问题处理；当前主要样式已集中在 `src/styles/components/ui.css`。
