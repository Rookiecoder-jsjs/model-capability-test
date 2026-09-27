import { defineConfig } from 'vite'

// 纯前端单页站点：无路由、无后端、无原生依赖。
// dev 直接可用（esbuild 平台二进制），build 产出纯静态资源。
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          fonts: ['@fontsource-variable/noto-sans-sc/wght.css', '@fontsource-variable/inter/wght.css'],
        },
      },
    },
  },
})
