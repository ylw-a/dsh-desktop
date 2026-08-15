# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 界面封装成自包含的 Windows 桌面应用（`exe`）。

## 工作原理

- **Electron 外壳**：提供桌面窗口、单实例锁、菜单/系统集成。
- **独立 Node 运行时**：`runtime/node.exe`（Node 22）被打包进应用，Electron 主进程用它启动 `dsh web` 后端，绕开 Electron 自带 Node 与原生模块 ABI 不匹配的问题。
- **浏览器窗口**加载 `http://127.0.0.1:<随机空闲端口>/`，即 DSH 原生 Web UI。
- 数据目录沿用 `~/.dsh`（Windows 下 `C:\Users\<你>\.dsh`），因此 API Key、会话、设置都与命令行/浏览器版本共享。

## 目录结构

| 路径 | 作用 |
|---|---|
| `main.js` | Electron 主进程：启动/停止后端、创建窗口 |
| `package.json` | Electron 壳的依赖与构建脚本（`dependencies` 为空） |
| `electron-builder.yml` | 打包配置（portable 单文件 + NSIS 安装包） |
| `runtime/node.exe` | 打包进应用的独立 Node 运行时（**不入库**，见下） |
| `runtime/node_modules` | **完整**的 dsh 生产依赖树（含 peer deps），随应用打包 |
| `runtime/package.json` | 声明 `@deepseek-ai/dsh` 依赖，用于生成上面的 node_modules |
| `build/` | 图标等构建资源（`icon.ico` / `icon.png`） |
| `scripts/make-icon.cjs` | 从 DSH favicon 生成鲸鱼图标 |

> 为什么 `runtime/` 单独装依赖：electron-builder 收集依赖时用 `npm list --include prod --omit dev`，会**漏掉 peerDependencies**；而 DSH 的 cordis 插件体系大量依赖 peer deps，漏了会在运行时报 `Cannot find package '@deepseek-ai/...'`。所以这里自己 `npm install` 出一份完整生产依赖（npm 会自动安装 peer deps），通过 `extraResources` 原样打包，绕开 electron-builder 的依赖收集。

## 构建

```powershell
# 0. 准备独立 Node 运行时（node.exe 不入库，先复制一份到 runtime/）
Copy-Item (Get-Command node).Source runtime/node.exe

npm install                 # 安装 electron / electron-builder（Electron 壳本身）
cd runtime; npm install     # 安装 dsh 完整生产依赖（含 peer deps）
cd ..
npm run dist                # 产出 dist/ 下的 portable exe 与 NSIS 安装包
npm run dist:portable       # 只出单文件 exe
npm run dist:nsis           # 只出安装包
```

## 开发调试

```powershell
npm start                   # 直接以 Electron 运行（不打包）
```

> 若 Electron 二进制下载失败，先设置镜像：
> `$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`
