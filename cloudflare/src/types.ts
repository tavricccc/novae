export interface Env {
  ACTION_IP_RATE_LIMITER: RateLimitBinding;
  ADMIN_WRITE_RATE_LIMITER: RateLimitBinding;
  ALLOWED_ORIGINS: string;
  CLOUDINARY_WEBHOOK_SECRET: string;
  EDGE_FUNCTION_NAMESPACE: string;
  EDGE_ORIGIN_SECRET: string;
  FIREBASE_PROJECT_ID: string;
  READ_RATE_LIMITER: RateLimitBinding;
  SENSITIVE_WRITE_RATE_LIMITER: RateLimitBinding;
  SUPABASE_FUNCTIONS_BASE_URL: string;
  SYNC_IP_RATE_LIMITER: RateLimitBinding;
  SYNC_USER_RATE_LIMITER: RateLimitBinding;
  UPLOAD_RESOLVE_RATE_LIMITER: RateLimitBinding;
  UPLOAD_WRITE_RATE_LIMITER: RateLimitBinding;
  WEBHOOK_GLOBAL_RATE_LIMITER: RateLimitBinding;
  WEBHOOK_IP_RATE_LIMITER: RateLimitBinding;
  WRITE_RATE_LIMITER: RateLimitBinding;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface JsonRecord {
  [key: string]: unknown;
}
