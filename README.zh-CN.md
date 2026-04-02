# Rivo

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

一个基于 SvelteKit 和 AI SDK 构建的开源 AI 聊天机器人模板。

## ✨ 功能特性

- **多模型供应商集成**：通过 AI SDK 支持 OpenAI、Anthropic、Google、Groq、DeepSeek、xAI 和 OpenRouter
- **现代前端技术栈**：SvelteKit + Svelte 5 + Tailwind CSS，响应式设计
- **文件上传支持**：上传并处理 `.txt`、`.md`、`.docx`、`.xlsx` 文件
- **持久化聊天数据**：使用 Drizzle ORM + libsql（SQLite/Turso）进行数据持久化
- **国际化支持**：内置英文和中文（zh-CN）支持
- **实时流式响应**：流式响应配合适当的 UI 更新
- **主题支持**：明暗模式，支持系统偏好检测
- **代码高亮**：使用 highlight.js 为代码块提供语法高亮
- **数学渲染**：KaTeX 支持数学表达式渲染
- **Mermaid 图表**：在聊天中渲染 Mermaid 图表
- **文件管理**：上传管理与元数据迁移
- **用户认证**：安全的会话管理用户认证
- **多平台部署**：支持 Vercel、Cloudflare 和自托管部署

## 🛠 技术栈

### 前端

- **框架**：SvelteKit 2.x + Svelte 5
- **样式**：Tailwind CSS 4.x
- **UI 组件**：Bits UI、Lucide Icons
- **国际化**：svelte-i18n
- **图表**：自定义图表组件

### 后端

- **运行时**：Node.js >= 20.19.0
- **AI 集成**：Vercel AI SDK
- **数据库**：libsql（SQLite/Turso）+ Drizzle ORM
- **认证**：自定义认证 + bcrypt-ts
- **文件存储**：AWS S3 兼容对象存储

### 开发工具

- **构建工具**：Vite
- **类型检查**：TypeScript
- **代码规范**：ESLint + Prettier
- **测试**：Vitest
- **包管理**：pnpm >= 10

## 🏗 架构

Rivo 采用现代全栈架构：

- **前端**：SvelteKit 处理路由、SSR 和客户端交互
- **API 路由**：服务端端点用于 AI 交互和数据管理
- **数据库**：libsql 提供 SQLite 兼容数据库，可选 Turso 托管
- **文件存储**：S3 兼容对象存储用于上传
- **认证**：基于会话的认证，安全 cookie 管理

详细架构说明请参考 [docs/multi-platform-architecture.md](./docs/multi-platform-architecture.md)。

## 🚀 快速开始

### 环境要求

- Node.js `>= 20.19.0`
- pnpm `>= 10`

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-username/rivo.git
   cd rivo
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **配置环境变量**

   复制 `.env.example` 为 `.env.local` 并填写您的 API 密钥：

   ```bash
   # macOS / Linux
   cp .env.example .env.local

   # Windows PowerShell
   Copy-Item .env.example .env.local
   ```

   本地开发最小配置：

   ```bash
   LIBSQL_URL=file:./data/app.db
   LIBSQL_AUTH_TOKEN=

   # AI 供应商 API 密钥（选择您偏好的供应商）
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   # ... 其他供应商密钥
   ```

4. **设置数据库**

   ```bash
   # 生成数据库模式
   pnpm db:generate

   # 可选：初始化本地 SQLite
   pnpm db:init-sqlite
   ```

5. **启动开发服务器**

   ```bash
   pnpm dev
   ```

   在浏览器中打开 [http://localhost:5173](http://localhost:5173)。

## 📜 可用脚本

使用 `pnpm <script>` 运行命令：

| 脚本               | 描述                               |
| ------------------ | ---------------------------------- |
| `dev`              | 启动本地开发服务器                 |
| `build:local`      | 构建用于本地/自托管部署            |
| `build:vercel`     | 构建用于 Vercel 部署               |
| `build:cloudflare` | 构建用于 Cloudflare 部署           |
| `preview`          | 本地预览生产构建                   |
| `check`            | 运行 Svelte 和 TypeScript 检查     |
| `lint`             | 运行 Prettier 和 ESLint            |
| `test`             | 运行 Vitest 测试套件               |
| `test:watch`       | 监视模式运行测试                   |
| `db:generate`      | 生成 Drizzle 迁移文件              |
| `db:push`          | 推送模式更改到数据库               |
| `db:studio`        | 打开 Drizzle Studio 进行数据库管理 |
| `db:check`         | 检查数据库模式                     |
| `format`           | 使用 Prettier 格式化代码           |

## 🚢 部署

### Vercel（推荐）

1. 将代码推送到 GitHub
2. 将仓库连接到 Vercel
3. 在 Vercel 控制台设置环境变量
4. 部署！

### Cloudflare Pages

```bash
pnpm build:cloudflare
# 将 `build` 目录部署到 Cloudflare Pages
```

### 自托管

```bash
pnpm build:local
pnpm preview
```

生产环境配置：

- 远程 libsql URL（例如 `libsql://...`）
- S3 兼容对象存储
- 适当的环境变量

## 🤝 贡献

欢迎贡献！请查看我们的[贡献指南](./CONTRIBUTING.md)了解详情。

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 进行更改并添加测试
4. 运行 `pnpm check && pnpm test`
5. 提交 Pull Request

## 📄 许可证

基于 [Apache License 2.0](LICENSE.md) 许可证开源。

## ❓ 常见问题

**问：支持哪些 AI 供应商？**

答：Rivo 通过 AI SDK 支持 OpenAI、Anthropic、Google、Groq、DeepSeek、xAI 和 OpenRouter。

**问：可以不使用数据库吗？**

答：应用需要数据库来持久化聊天记录。开发时使用本地 SQLite，生产时使用 Turso。

**问：如何添加新语言？**

答：在 `src/lib/i18n/locales/` 中添加翻译文件，并在 UI 中更新语言选择器。

**问：构建目标有什么区别？**

答：`build:local` 使用 Node 适配器用于自托管，`build:vercel` 为 Vercel 优化，`build:cloudflare` 为 Cloudflare Pages 优化。

## 📞 支持

- 📖 [文档](./docs/)
- 🐛 [问题](https://github.com/your-username/rivo/issues)
- 💬 [讨论](https://github.com/your-username/rivo/discussions)

## 🙏 致谢

- [Vercel AI SDK](https://github.com/vercel/ai) - AI 集成
- [SvelteKit](https://kit.svelte.dev/) - 框架
- [Tailwind CSS](https://tailwindcss.com/) - 样式
- [Drizzle ORM](https://orm.drizzle.team/) - 数据库管理
- [libsql](https://github.com/tursodatabase/libsql) - 数据库

---

使用 ❤️ 和 SvelteKit + AI SDK 构建。
