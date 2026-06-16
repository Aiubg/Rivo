# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Rivo is an open-source AI chatbot application built with SvelteKit and the Vercel AI SDK. It supports multiple LLM providers (OpenAI, Anthropic, Google, Groq, DeepSeek, xAI, OpenRouter) with features including file uploads, persistent chat storage, real-time streaming, and multi-platform deployment.

**Tech Stack:**

- Frontend: SvelteKit 2.x + Svelte 5 + Tailwind CSS 4.x
- Backend: Node.js >= 20.19.0, Vercel AI SDK
- Database: libsql (SQLite/Turso) with Drizzle ORM
- Package Manager: pnpm >= 10

## Development Commands

### Setup

```bash
pnpm install                    # Install dependencies
cp .env.example .env.local      # Create environment file
pnpm db:generate                # Generate database schema
pnpm db:init-sqlite             # Initialize local SQLite database
```

### Development

```bash
pnpm dev                        # Start dev server (http://localhost:5173)
pnpm check                      # Run Svelte + TypeScript checks
pnpm check:watch                # Run checks in watch mode
pnpm lint                       # Run Prettier + ESLint
pnpm format                     # Format code with Prettier
pnpm test                       # Run Vitest test suite
pnpm test:watch                 # Run tests in watch mode
```

### Database

```bash
pnpm db:generate                # Generate Drizzle migration files
pnpm db:push                    # Push schema changes to database
pnpm db:studio                  # Open Drizzle Studio
pnpm db:check                   # Check database schema
pnpm uploads:migrate-metadata   # Migrate upload metadata to database
```

### Build & Deploy

```bash
pnpm build:local                # Build for self-hosted (adapter-node)
pnpm build:vercel               # Build for Vercel (adapter-vercel)
pnpm build:cloudflare           # Build for Cloudflare (adapter-cloudflare)
pnpm preview                    # Preview production build
```

Build target is controlled by `BUILD_TARGET` environment variable in `svelte.config.js`.

## Architecture

### Multi-Platform Architecture

The codebase uses a ports-and-adapters pattern for platform independence:

- **`src/lib/server/ports/`** - Platform-neutral contracts for configuration, database, and storage
- **`src/lib/server/infra/`** - Implementations for local filesystem, S3, libsql (local/remote)
- **`src/lib/server/app/`** - Application services (file uploads, avatar storage)
- **`src/lib/server/composition/`** - Wires drivers and services from environment config

Runtime drivers are selected via environment variables:

- `DEPLOY_TARGET`: local, vercel, cloudflare
- `DB_DRIVER`: libsql-local, libsql-remote
- `STORAGE_DRIVER`: local-fs, s3

### Directory Structure

```
src/
├── lib/
│   ├── ai/                     # AI model configuration and options
│   ├── components/             # Svelte components
│   │   ├── markdown/           # Markdown rendering components
│   │   ├── messages/           # Chat message components
│   │   ├── multimodal/         # File upload and multimodal components
│   │   ├── settings/           # Settings UI components
│   │   ├── sidebar-history/    # Chat history sidebar
│   │   └── ui/                 # Reusable UI components (Bits UI)
│   ├── hooks/                  # Svelte hooks
│   │   └── chat-state/         # Chat state management hooks
│   ├── i18n/                   # Internationalization
│   │   └── locales/            # Translation files (en, zh-CN)
│   ├── server/                 # Server-side code
│   │   ├── ai/                 # AI integration layer
│   │   │   ├── tools/          # AI tool definitions
│   │   │   │   └── builtin/    # Built-in tools (calculator, search, etc.)
│   │   │   ├── models.ts       # Model provider configuration
│   │   │   ├── prompts.ts      # System prompts
│   │   │   ├── run-executor.ts # AI execution orchestration
│   │   │   └── run-recovery.ts # Run state recovery
│   │   ├── app/                # Application services
│   │   ├── auth/               # Authentication logic
│   │   ├── composition/        # Dependency injection
│   │   ├── db/                 # Database schema and migrations
│   │   ├── domain/             # Domain models
│   │   ├── errors/             # Error handling
│   │   ├── files/              # File management
│   │   ├── infra/              # Infrastructure implementations
│   │   ├── ports/              # Port interfaces
│   │   └── uploads/            # Upload handling
│   ├── services/               # Client-side services
│   ├── theme/                  # Theme configuration
│   ├── types/                  # TypeScript type definitions
│   └── utils/                  # Utility functions
├── routes/
│   ├── (auth)/                 # Authentication routes (signin, signup)
│   ├── (chat)/                 # Chat routes and API endpoints
│   │   └── api/                # API routes for chat, files, etc.
│   └── +layout.svelte          # Root layout
├── hooks.server.ts             # Server hooks (auth, security headers, run recovery)
└── app.html                    # HTML template
```

### Database Schema

Core tables (see `src/lib/server/db/schema.ts`):

- **User** - User accounts with email/password authentication
- **Session** - User sessions with expiration
- **Chat** - Chat conversations with title, visibility, pinned/unread status
- **Message** - Chat messages with role, parts (content), attachments, parent relationships
- **Vote** - Message upvote/downvote tracking
- **Share** - Shared chat links
- **StoredUpload** - File upload metadata

### AI Integration

The AI layer (`src/lib/server/ai/`) handles:

- **Model providers** - Configured in `models.ts` using AI SDK providers
- **System prompts** - Defined in `prompts.ts`
- **Tool calling** - Registry in `tools/registry.ts`, implementations in `tools/builtin/`
- **Run execution** - Orchestrated by `run-executor.ts` with concurrency control
- **Run recovery** - State recovery on server restart via `run-recovery.ts`
- **Thinking mode** - Extended thinking support for compatible models

Built-in tools include: calculator, Tavily search/extract, Wolfram Alpha, Bilibili music, UI cards.

### Request Flow

1. Client sends message via `/api/chat` endpoint
2. Server hooks authenticate user and ensure run recovery
3. Chat API route validates request and loads chat context
4. `run-executor.ts` orchestrates AI model streaming with tools
5. Response streams back to client with real-time updates
6. Messages and metadata persist to database

### Authentication

Session-based authentication with secure cookies:

- Passwords hashed with bcrypt-ts
- Sessions stored in database with expiration
- Anonymous chats supported via `PUBLIC_ALLOW_ANONYMOUS_CHATS` flag
- Auth handled in `src/lib/server/auth/` and `hooks.server.ts`

### File Uploads

File upload system supports `.txt`, `.md`, `.docx`, `.xlsx`:

- Upload handling in `src/lib/server/uploads/` and `src/lib/server/files/`
- Storage abstracted via `StoragePort` (local-fs or S3)
- Metadata stored in `StoredUpload` table
- Legacy `data/uploads/metadata.json` can be migrated with `pnpm uploads:migrate-metadata`

## Development Guidelines

### TypeScript

- Use strict TypeScript settings
- Avoid `any` types, use proper type definitions
- Types are in `src/lib/types/` and co-located with modules

### Svelte 5

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Keep components focused and reusable
- Follow reactive patterns appropriately

### Styling

- Use Tailwind CSS 4.x utility classes
- Theme tokens in `src/styles/tokens/`
- Component-specific styles in `src/styles/components/`
- Support light/dark mode via `mode-watcher`

### Testing

- Tests in `tests/` directory using Vitest
- Test utilities, components, and API routes
- Run `pnpm test` before committing
- Maintain test coverage for new features

### Commit Messages

Use conventional commit format:

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

### Environment Configuration

Key environment variables (see `.env.example`):

- **Deployment**: `DEPLOY_TARGET`, `DB_DRIVER`, `STORAGE_DRIVER`
- **Database**: `LIBSQL_URL`, `LIBSQL_AUTH_TOKEN`
- **Storage**: `LOCAL_UPLOAD_STORAGE_ROOT` or S3 credentials
- **AI Providers**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
- **Tools**: `TAVILY_API_KEY`, `WOLFRAM_ALPHA_APP_ID`
- **Run Executor**: `RUN_EXECUTOR_MAX_CONCURRENCY`, `RUN_EVENT_MAX_CHARS`

Minimum local development setup:

```bash
LIBSQL_URL=file:./data/app.db
OPENAI_API_KEY=your_key_here
```

### Adding New AI Tools

1. Create tool implementation in `src/lib/server/ai/tools/builtin/`
2. Define tool schema using Zod
3. Register tool in `src/lib/server/ai/tools/registry.ts`
4. Add tests in `tests/`

### Adding New Routes

- Auth routes go in `src/routes/(auth)/`
- Chat-related routes go in `src/routes/(chat)/`
- API endpoints go in `src/routes/(chat)/api/`
- Use `+server.ts` for API routes, `+page.svelte` for pages
- Server-side data loading in `+page.server.ts` or `+layout.server.ts`

### Security

Security headers configured in `hooks.server.ts`:

- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: same-origin`
- Permissions policy restricts geolocation, camera, etc.

## Common Tasks

### Adding a New AI Provider

1. Install AI SDK provider package (e.g., `@ai-sdk/provider-name`)
2. Add API key to `.env.example` and `.env.local`
3. Configure provider in `src/lib/server/ai/models.ts`
4. Update model selection UI in settings components

### Modifying Database Schema

1. Edit `src/lib/server/db/schema.ts`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:push` to apply changes
4. Update TypeScript types as needed

### Adding Translations

1. Add translation keys to `src/lib/i18n/locales/en.json`
2. Add corresponding translations to `src/lib/i18n/locales/zh-CN.json`
3. Use `$t('key')` in Svelte components

### Debugging

- Check browser console for client-side errors
- Check server logs for API errors
- Use `pnpm db:studio` to inspect database
- Run `pnpm check` to catch TypeScript errors
- Use Vitest for unit testing specific modules
