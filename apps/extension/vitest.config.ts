import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __ELEVATE_APP_URL__: JSON.stringify("http://localhost:3000"),
    __ELEVATE_VERSION__: JSON.stringify("0.0.0-test"),
    __ELEVATE_SENTRY_DSN__: JSON.stringify(""),
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
