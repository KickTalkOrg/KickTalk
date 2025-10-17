import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

// Custom plugin to copy telemetry files
const copyTelemetryPlugin = () => ({
  name: 'copy-telemetry',
  writeBundle() {
    const srcTelemetry = resolve('src/telemetry');
    const outTelemetry = resolve('out/telemetry');
    
    // Create telemetry directory in output
    if (!existsSync(outTelemetry)) {
      mkdirSync(outTelemetry, { recursive: true });
    }
    
    // Copy telemetry files
    const files = ['index.js', 'metrics.js', 'tracing.js', 'instrumentation.js', 'prometheus-server.js'];
    files.forEach(file => {
      const src = join(srcTelemetry, file);
      const dest = join(outTelemetry, file);
      if (existsSync(src)) {
        try {
          copyFileSync(src, dest);
          console.log(`[Telemetry]: Copied ${file} to build output`);
        } catch (error) {
          console.warn(`[Telemetry]: Failed to copy ${file}:`, error.message);
        }
      }
    });
  }
});

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ["electron-store", "electron-util"] }),
      copyTelemetryPlugin()
    ],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-store", "electron-util"] })],
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          userDialog: resolve("src/renderer/user.html"),
          authDialog: resolve("src/renderer/auth.html"),
          chattersDialog: resolve("src/renderer/chatters.html"),
          searchDialog: resolve("src/renderer/search.html"),
          settings: resolve("src/renderer/settings.html"),
          replyThread: resolve("src/renderer/replyThread.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@components": resolve("src/renderer/src/components"),
        "@assets": resolve("src/renderer/src/assets"),
      },
    },
    plugins: [react()],
  },
});
