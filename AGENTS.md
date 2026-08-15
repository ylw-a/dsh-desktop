# DeepSeek Harness Desktop

本文件是 DeepSeek Harness Desktop 项目的记忆文件，供在此仓库工作的 AI agent 参考。

## 项目概览

`dsh-desktop`（v0.1.0）：把 DeepSeek Harness 的 Web UI 封装成自包含的 Windows 桌面应用。
它**不是**重新实现或改动 DSH 本身，而是：

- 用 Electron 提供一个桌面窗口；
- 用打包进来的独立 Node（`runtime/node.exe`）启动 `@deepseek-ai/dsh` 的 `dsh web` 后端；
- 用 BrowserWindow 加载该后端的 `http://127.0.0.1:<随机端口>/`。

数据目录沿用 `~/.dsh`（Windows：`C:\Users\<你>\.dsh`），与 CLI / 浏览器版共享。

## 目录与关键文件

| 路径 | 作用 |
|---|---|
| `main.js` | Electron 主进程（唯一手写源码）：启动/停止 dsh 后端、创建窗口、快捷键 |
| `package.json` | Electron 壳；`dependencies` 为空，electron / electron-builder 在 devDependencies |
| `electron-builder.yml` | 打包配置（portable + NSIS），`asar: false`，用 extraResources 原样拷贝 `runtime/` |
| `runtime/` | 打包的独立 Node 运行时 + 完整 DSH 生产依赖树 |
| `runtime/node.exe` | Node 22 独立运行时（**不入库**，构建前从系统 Node 复制） |
| `runtime/package.json` | 只声明 `@deepseek-ai/dsh`（当前 `0.1.0-rc.6`） |
| `build/` | 图标 `icon.ico` / `icon.png` |
| `scripts/make-icon.cjs` | 从 DSH favicon 生成鲸鱼图标 |
| `dist/` | electron-builder 产物（已被 .gitignore 忽略） |

## 命令

```powershell
# 0. 准备独立 Node 运行时（node.exe 不入库，先复制一份到 runtime/）
Copy-Item (Get-Command node).Source runtime/node.exe

npm install                 # 安装 Electron 壳依赖
cd runtime; npm install     # 安装 DSH 完整生产依赖（含 peer deps）
cd ..
npm start                   # 开发运行（不打包）
npm run dist                # 构建 portable + NSIS
npm run dist:portable       # 只出单文件 exe
npm run dist:nsis           # 只出安装包
```

Electron 二进制下载失败时先设镜像：
`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`

## 约束与坑

1. **`asar: false` 不能改回 true**：主进程要 spawn `runtime/node.exe` 并从文件系统读取 `node_modules`，asar 归档会破坏这些路径。
2. **`runtime/` 必须单独 `npm install`**：electron-builder 的依赖收集会漏掉 peerDependencies，而 DSH 的 cordis 插件体系大量依赖 peer deps。所以生产依赖要在 `runtime/` 里单独装出一份完整树再原样打包，不要依赖根目录的依赖收集。
3. **运行时路径解析**：`resolveNodeExecutable()` / `resolveDshBin()` 依次尝试 `process.resourcesPath/runtime/...`（打包后）→ `app.getAppPath()/runtime/...`（开发）。新增可执行文件或入口时保持这种两段式解析。
4. **退出时要清理后端**：`killTree()` 用 `taskkill /PID <pid> /T /F` 杀掉 dsh 进程树，并挂在 `before-quit` / `will-quit`。改生命周期逻辑时不要丢掉这个清理。

## 升级 DSH 版本

1. 改 `runtime/package.json` 里 `@deepseek-ai/dsh` 的版本；
2. `cd runtime; npm install` 重新生成依赖树；
3. `cd ..; npm run dist` 重新打包。

## 代码风格

- `main.js` 使用 CommonJS（`require`），顶部 `'use strict'`。
- 面向用户的报错文案是中文（如启动失败弹窗、后端超时提示）。
- 保持单文件主进程即可；新功能优先放进 `main.js`，除非确实需要拆模块。

## 本仓库不做的事

- 不修改 DSH 本身——那是 `runtime/node_modules/@deepseek-ai/*` 之外的另一个仓库。需要改 DSH 行为时去改 DeepSeek Harness 源仓库，而不是在运行时目录里打补丁。
