# 项目审查建议落地说明

更新时间：2026-03-19

## 已完成

- 上传资源访问隔离
  - 已为匿名会话增加独立 `anonymousSessionId`，文件上传、列表、预览、重命名、删除均按登录用户或匿名会话隔离。
  - 已补接口级测试，覆盖跨会话访问阻断。

- 历史上传元数据迁移能力
  - 已新增脚本 `pnpm uploads:migrate-metadata`。
  - 脚本会尝试从已持久化聊天消息中回填历史 `metadata.json` 的 `userId`，并输出无法自动归属或存在歧义的文件列表。

- 聊天搜索结构优化
  - `Message` 表已新增 `searchText` 字段。
  - 保存消息和更新消息时会同步维护搜索文本。
  - 查询搜索结果时不再直接对 `parts` JSON 做 `LIKE`，而是走 `searchText`。
  - 已补运行时兼容逻辑，旧库会自动补列并回填历史消息的搜索文本。

- 本地 SQLite 初始化脚本补齐
  - `scripts/sqlite-init.ts` 已同步更新到当前真实 schema，补齐了 `parentId`、`searchText`、`GenerationRun`、`RunEvent`。

- 工具输入输出契约
  - 工具层已增加运行时 `inputSchema` / `outputSchema` 校验。
  - 已为 `calculator`、`tavily_search`、`tavily_extract`、`wolfram_alpha`、`bilibili_music`、`ui_card` 补齐契约。
  - 已补测试，覆盖输入非法和输出漂移场景。

- ChatState 流式恢复治理
  - 已抽出 `src/lib/hooks/chat-state/run-stream.ts` 作为流式恢复辅助模块。
  - 已给 run 恢复增加有上限的自动重试窗口，避免无限续传。
  - 已把 run 游标持久化和错误解析从 `ChatState` 主类中拆出。
  - 匿名聊天已改为直接走 `/api/chat`，不再错误依赖需要登录的 `/api/runs`。

- 接口级测试
  - 已新增文件接口测试：
    - `/api/files`
    - `/api/files/preview`
    - `/api/files/rename`
    - `/api/files/delete`
  - 已新增 runs 边界测试：
    - `/api/runs`
    - `/api/runs/[runId]/stream`
    - `/api/runs/[runId]/cancel`

## 仍需执行的手工动作

- 如果线上或本地已有历史上传数据，需要执行一次：

```bash
pnpm uploads:migrate-metadata
```

- 如果存在脚本输出的 `ambiguous` 或 `unresolved` 文件，需要按业务实际做人工认领或清理。

## 说明

- 这轮已优先完成“明确可实现且低风险”的建议项。
- 当前匿名聊天仍然是“会话级临时对话”语义，不会像登录聊天那样写入正式历史记录。
