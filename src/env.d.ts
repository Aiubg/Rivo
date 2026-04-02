declare module '$env/static/private' {
	export const XAI_API_KEY: string;
	export const GROQ_API_KEY: string;
	export const ANTHROPIC_API_KEY: string;
	export const OPENAI_API_KEY: string;
	export const SILICONFLOW_API_KEY: string;
	export const GOOGLE_GENERATIVE_AI_API_KEY: string;
	export const DEEPSEEK_API_KEY: string;
	export const OPENROUTER_API_KEY: string;
	export const OPENROUTER_SITE_URL: string;
	export const OPENROUTER_APP_NAME: string;
	export const WOLFRAM_ALPHA_APP_ID: string;
	export const DEPLOY_TARGET: string;
	export const BUILD_TARGET: string;
	export const DB_DRIVER: string;
	export const STORAGE_DRIVER: string;
	export const LIBSQL_URL: string;
	export const LIBSQL_AUTH_TOKEN: string;
	export const LOCAL_UPLOAD_PUBLIC_PATH: string;
	export const LOCAL_UPLOAD_STORAGE_ROOT: string;
	export const S3_BUCKET: string;
	export const S3_REGION: string;
	export const S3_ENDPOINT: string;
	export const S3_ACCESS_KEY_ID: string;
	export const S3_SECRET_ACCESS_KEY: string;
	export const ASSET_PUBLIC_BASE_URL: string;
}

declare module '$env/static/public' {
	export const PUBLIC_ALLOW_ANONYMOUS_CHATS: string;
}
