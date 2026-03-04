import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TOMTOM_API_KEY: z.string().trim().min(1).optional(),
  TOMTOM_SERVER_API_KEY: z.string().trim().min(1).optional(),
  TOMTOM_BASE_URL: z.string().url().default("https://api.tomtom.com"),
  VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
  VAPID_SUBJECT: z.string().trim().min(1).optional(),
  GTFS_PREPROCESSED_DIR: z.string().trim().min(1).optional(),
  GOOGLE_ROUTES_API_KEY: z.string().trim().min(1).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.issues.map((issue) => issue.path.join(".") + " " + issue.message).join("; ")}`);
}

export const env = parsedEnv.data;
