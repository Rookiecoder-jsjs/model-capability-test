# 归档说明

本目录是 `space-bunny-free` 测评中「从芯片到 Agent 的连续装配网页」这一次测评的**完整可运行项目**。

## 目录

- `src/`      应用源码（TypeScript + CSS，入口 `src/main.ts`）
- `tools/`    开发期验证脚本（Playwright），不进入构建产物
- `index.html` `package.json` `package-lock.json` `tsconfig.json` `vite.config.ts`  `README.md`

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build      # 类型检查 + 产出 dist/
npm run preview    # 预览构建产物 http://127.0.0.1:4173/
```

验证脚本需要先起服务（默认 `http://127.0.0.1:5173/`，可用 `URL=` 覆盖）：

```bash
npm run typecheck
npm run verify              # 16 项：对象身份 / 落位 / 可逆 / 路径 / 导航 / Agent / 窗口 / 布局 / 无障碍
npm run verify:responsive   # 22 项：三档桌面 / 小屏 / 200% 文字 / 减少动态 / 键盘
node tools/perf.mjs         # 性能采样
npm run shots               # 逐章截图到 .shots/
```

**未包含**：`node_modules/`、`dist/`、`.shots/`、`.npmcache/`。前两者由 `npm install` 与 `npm run build` 重建；
截图在同条结果的 `evidence/shots/` 下。

设计说明、验证结论、性能采样条件与已知限制见 `README.md`。
