import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase-auth",
              test: /node_modules\/@firebase\/auth/,
              priority: 30,
            },
            {
              name: "firebase-data",
              test: /node_modules\/@firebase\/(firestore|storage)/,
              priority: 30,
            },
            { name: "firebase-core", test: /node_modules\//, priority: 10 },
          ],
        },
      },
    },
  },
});
