import { z } from "zod";

const serverSchema = z.object({ SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), RATE_LIMIT_SECRET: z.string().min(32) });
const publicSchema = z.object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1) });
const anthropicSchema = z.object({ ANTHROPIC_API_KEY: z.string().min(1), ANTHROPIC_WORKSPACE_ID: z.string().trim().min(1).optional() });
const adminSchema = z.object({ ADMIN_PASSWORD: z.string().min(12) });
const emailSchema = z.object({ RESEND_API_KEY: z.string().min(1) });
export function getServerEnv() { return serverSchema.parse({ SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET }); }
export function getPublicEnv() { return publicSchema.parse({ NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }); }
export function getAnthropicEnv() { return anthropicSchema.parse({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID: process.env.ANTHROPIC_WORKSPACE_ID || undefined }); }
export function getAdminEnv() { return adminSchema.parse({ ADMIN_PASSWORD: process.env.ADMIN_PASSWORD }); }
export function getEmailEnv() { return emailSchema.parse({ RESEND_API_KEY: process.env.RESEND_API_KEY }); }
