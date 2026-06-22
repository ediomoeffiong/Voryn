import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return defineConfig({
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL ?? process.env.VITE_API_URL ?? "")
    },
    server: {
      proxy: {
        "/api": env.VITE_API_URL ?? "http://localhost:4000"
      }
    }
  });
};
