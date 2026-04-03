# Rivo

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

An open-source AI chatbot template built with SvelteKit and the AI SDK.

## ✨ Features

- **Multi-Provider LLM Integration**: Support for OpenAI, Anthropic, Google, Groq, DeepSeek, xAI, and OpenRouter via AI SDK
- **Modern Frontend Stack**: SvelteKit + Svelte 5 + Tailwind CSS with responsive design
- **File Upload Support**: Upload and process `.txt`, `.md`, `.docx`, `.xlsx` files
- **Persistent Chat Data**: Drizzle ORM with libsql (SQLite/Turso) for data persistence
- **Internationalization**: Built-in English and Chinese (zh-CN) support
- **Real-time Streaming**: Streaming responses with proper UI updates
- **Theme Support**: Light/dark mode with system preference detection
- **Code Highlighting**: Syntax highlighting for code blocks with highlight.js
- **Math Rendering**: KaTeX support for mathematical expressions
- **Mermaid Diagrams**: Render Mermaid diagrams in chat
- **File Management**: Upload management with metadata migration
- **Authentication**: User authentication with secure session management
- **Multi-platform Deployment**: Support for Vercel, Cloudflare, and self-hosted deployments

## 🛠 Tech Stack

### Frontend

- **Framework**: SvelteKit 2.x with Svelte 5
- **Styling**: Tailwind CSS 4.x
- **UI Components**: Bits UI, Lucide Icons
- **Internationalization**: svelte-i18n
- **Charts**: Custom chart components

### Backend

- **Runtime**: Node.js >= 20.19.0
- **AI Integration**: Vercel AI SDK
- **Database**: libsql (SQLite/Turso) with Drizzle ORM
- **Authentication**: Custom auth with bcrypt-ts
- **File Storage**: AWS S3 compatible storage

### Development

- **Build Tool**: Vite
- **Type Checking**: TypeScript
- **Linting**: ESLint + Prettier
- **Testing**: Vitest
- **Package Manager**: pnpm >= 10

## 🏗 Architecture

Rivo follows a modern full-stack architecture:

- **Frontend**: SvelteKit handles routing, SSR, and client-side interactivity
- **API Routes**: Server-side endpoints for AI interactions and data management
- **Database**: libsql provides SQLite-compatible database with optional Turso hosting
- **File Storage**: S3-compatible object storage for uploads
- **Authentication**: Session-based auth with secure cookie management

For detailed architecture notes, see [docs/multi-platform-architecture.md](./docs/multi-platform-architecture.md).

## 🚀 Getting Started

### Prerequisites

- Node.js `>= 20.19.0`
- pnpm `>= 10`

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Aiubg/rivo.git
   cd rivo
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in your API keys:

   ```bash
   # macOS / Linux
   cp .env.example .env.local

   # Windows PowerShell
   Copy-Item .env.example .env.local
   ```

   Minimum configuration for local development:

   ```bash
   LIBSQL_URL=file:./data/app.db
   LIBSQL_AUTH_TOKEN=

   # AI Provider API Keys (choose your preferred provider)
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   # ... other provider keys
   ```

4. **Set up the database**

   ```bash
   # Generate database schema
   pnpm db:generate

   # Optional: Initialize local SQLite
   pnpm db:init-sqlite
   ```

5. **Start development server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📜 Available Scripts

Run commands with `pnpm <script>`:

| Script             | Description                                 |
| ------------------ | ------------------------------------------- |
| `dev`              | Start local development server              |
| `build:local`      | Build for local/self-hosted deployment      |
| `build:vercel`     | Build for Vercel deployment                 |
| `build:cloudflare` | Build for Cloudflare deployment             |
| `preview`          | Preview production build locally            |
| `check`            | Run Svelte and TypeScript checks            |
| `lint`             | Run Prettier and ESLint                     |
| `test`             | Run Vitest test suite                       |
| `test:watch`       | Run tests in watch mode                     |
| `db:generate`      | Generate Drizzle migration files            |
| `db:push`          | Push schema changes to database             |
| `db:studio`        | Open Drizzle Studio for database management |
| `db:check`         | Check database schema                       |
| `format`           | Format code with Prettier                   |

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy!

### Cloudflare Pages

```bash
pnpm build:cloudflare
# Deploy the `build` directory to Cloudflare Pages
```

### Self-Hosted

```bash
pnpm build:local
pnpm preview
```

For production, configure:

- Remote libsql URL (e.g., `libsql://...`)
- S3-compatible object storage
- Proper environment variables

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and add tests
4. Run `pnpm check && pnpm test`
5. Submit a pull request

## 📄 License

Licensed under the [Apache License 2.0](LICENSE.md).

## ❓ FAQ

**Q: Which AI providers are supported?**

A: Rivo supports OpenAI, Anthropic, Google, Groq, DeepSeek, xAI, and OpenRouter through the AI SDK.

**Q: Can I use it without a database?**

A: The app requires a database for chat persistence. Use local SQLite for development or Turso for production.

**Q: How do I add a new language?**

A: Add translation files to `src/lib/i18n/locales/` and update the language selector in the UI.

**Q: What's the difference between build targets?**

A: `build:local` uses Node adapter for self-hosting, `build:vercel` optimizes for Vercel, `build:cloudflare` for Cloudflare Pages.

## 📞 Support

- 📖 [Documentation](./docs/)
- 🐛 [Issues](https://github.com/Aiubg/rivo/issues)
- 💬 [Discussions](https://github.com/Aiubg/rivo/discussions)

## 🙏 Acknowledgments

- [Vercel AI SDK](https://github.com/vercel/ai) for AI integration
- [SvelteKit](https://kit.svelte.dev/) for the framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Drizzle ORM](https://orm.drizzle.team/) for database management
- [libsql](https://github.com/tursodatabase/libsql) for the database

---

Built with ❤️ using SvelteKit and AI SDK.
