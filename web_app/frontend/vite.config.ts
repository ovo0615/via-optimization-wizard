// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 固定埠；strictPort 確保埠被佔用時直接報錯，不會偷偷跳到別的埠。
// 5181 / 8020 避開其他專案的 5173 / 5180 / 8000 / 8010。
export default defineConfig({
  plugins: [react()],
  // 建置時間戳：畫面上看得到「現在載入的是哪一版」。
  // 沒有它，前端改了卻沒生效時無法分辨是程式沒改到還是瀏覽器快取。
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString("zh-TW", { hour12: false }),
    ),
  },
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8020", changeOrigin: true },
    },
  },
});
