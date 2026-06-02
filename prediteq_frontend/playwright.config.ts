import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:8080",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 8080",
    port: 8080,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
