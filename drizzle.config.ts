import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/push-schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.PUSH_DB_PATH ?? "./data/push-notifications.sqlite",
  },
});
