# Agent Note:桌面壳经 packed-install sidecar 完成 Windows 打包

Status: implemented

[English](2026-09-06-english-learning-desktop-windows-packaging.md) | 中文

## 问题

桌面壳的打包形态需要一个环境变量指名的单文件 sidecar,但没有任何流程为 english-learning profile 产出它;而且该 profile 的运行载荷——仪表盘 dist、预设 skills、原生插件——不存在于任何打包产物中。Windows 可执行程序因此无从谈起,而打包路线必须保住 profile 依赖的一个性质:bundle 必须像正常安装一样解析,因为 profile 模板点名了 `@deepseek-ai/dsh-base`,且 loader 在运行时按裸名导入插件包。

## 决策

**sidecar = 真实 Node 二进制 + 由 release tarball 经 npm 安装出的闭包树;electron-builder 在 macOS 上交叉构建 Windows 目标。**

- `scripts/package-desktop-sidecar.ts` 组装一个把每份 `release:pack` tarball 作为 `file:` 依赖安装的消费者——正是 `verify-packed-install` 证明过的布局——再补上宿主侧安装给不了的 Windows 专属件:`@koromix/koffi-win32-x64`(有 os 门控,必须显式强装)与 `node.exe`(镜像优先下载,带缓存)。node-pty 的 Windows ConPTY prebuild 与 vendored landlock 可选项随各自 npm 包分发,无需处理。
- `apps/desktop` 增加 electron-builder 配置(NSIS 一键 + portable,x64),经 `extraResources` 拷入组装好的 sidecar;打包后的壳解析 `resources/sidecar/node.exe` 对准 `node_modules/@deepseek-ai/dsh/lib/bin.js`,`DSH_DESKTOP_SIDECAR` 仍可覆盖为 SEA 式单文件。
- `desktop-closure` 作为 workspace 成员保留依赖事实的文档化,但 npm tarball 路线取代它成为装载机制:`pnpm deploy --legacy` 的替代实现会从目标目录重新进入 workspace,其内部 install 尝试一次无 TTY 时无法安全应答(且可能具有破坏性)的根 node_modules 清空。

## 已考虑的替代方案

**`build-exe-for-python-sdk.ts` 的 pkg SEA 路线。** 暂时拒绝:其 whole-tree 资产闭包按 Python 部署根调校,而那里既没有 english-learning 的 bundle 也没有其仪表盘 dist;重新调校意味着第二份闭包,以及 loader 运行时导入的新静态分析盲区。

**`pnpm deploy` 装载。** 先实现后放弃:deploy 的内部 `pnpm install` 会重新进入 workspace,把仓库根解析为它的项目,并尝试一次目标含糊、极端情况下有破坏性的 node_modules 清空。

**签名。** 推迟:未配置证书,Windows 产物未签名,SmartScreen 会警告;构建产出未签名产物而不是阻塞。

## 后果

在 `pnpm run build` 与 `release:pack` 产物就绪后,Windows 打包只需两条命令(`sidecar:win`、`dist:win`),同一流程也产出 macOS 验证载体。安装包载荷较大(数百 MB),因为闭包带上了整个家族树;裁剪是后续工作。Windows 可执行程序未在本地执行——其内含的打包布局已在 macOS 上实机验证(后端拉起、OS 分配端口公告、窗口连接建立),Windows 上的运行证明留给真实机器或 CI Windows 冒烟。

## 测试

`electron-builder --mac dir` 产出的应用被实机启动:打包分支以 sidecar node 对准 CLI 入口拉起后端,后端在 OS 分配端口上公告,窗口保持已建立连接。Windows 产物经检查载荷完整(CLI 入口、仪表盘 dist、预设 skills、koffi win32、node-pty win32 prebuilds、node.exe)。所有触及文件聚焦 typecheck 与 oxlint 全绿。
