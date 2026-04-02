# Multi-Platform Architecture

This project now separates deployment concerns into four layers:

- `src/lib/server/ports`
  Defines platform-neutral contracts for configuration, database access, and object storage.
- `src/lib/server/infra`
  Implements those contracts for local filesystem storage, S3-compatible object storage, and local or remote libsql.
- `src/lib/server/app`
  Hosts application services such as file uploads and avatar storage.
- `src/lib/server/composition`
  Wires the active drivers and services together from environment configuration.

## Build Targets

The SvelteKit adapter is selected through `BUILD_TARGET` in [svelte.config.js](/C:/Users/35554/Projects/VSCode/Web/Rivo/svelte.config.js):

- `local` -> `@sveltejs/adapter-node`
- `vercel` -> `@sveltejs/adapter-vercel`
- `cloudflare` -> `@sveltejs/adapter-cloudflare`

Build scripts:

- `pnpm build:local`
- `pnpm build:vercel`
- `pnpm build:cloudflare`

## Runtime Drivers

The active drivers are chosen with environment variables:

- `DEPLOY_TARGET`
- `DB_DRIVER`
- `STORAGE_DRIVER`

Supported combinations:

- Local development: `libsql-local` + `local-fs`
- Vercel: `libsql-remote` + `s3`
- Cloudflare: `libsql-remote` + `s3`

Using one S3-compatible storage driver for cloud environments keeps Vercel and Cloudflare on the same storage abstraction and avoids platform-specific branching in business code.

## Uploads

Uploads are no longer coupled directly to `fs` calls inside routes.

- Binary data goes through `StoragePort`
- Upload metadata goes through `StoredUpload` records in libsql
- Route handlers call composed services instead of touching platform APIs directly

Backward compatibility is preserved through [upload-store.ts](/C:/Users/35554/Projects/VSCode/Web/Rivo/src/lib/server/files/upload-store.ts), which now delegates to the new services.

## Migration

Existing `data/uploads/metadata.json` data can be imported into the new `StoredUpload` table with:

```bash
pnpm uploads:migrate-metadata
```

The script keeps the original JSON file in place and copies metadata into the database-backed store.
