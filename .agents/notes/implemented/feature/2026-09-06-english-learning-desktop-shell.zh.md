# Agent Note:english-learning 桌面壳与补齐落地的分发修复

Status: implemented

[English](2026-09-06-english-learning-desktop-shell.md) | 中文

## 问题

桌面应用的工作暴露出[分发就绪](2026-09-06-english-learning-distribution-readiness.zh.md)一篇记录的决策从未落到代码:profile 模板仍以无 `@deepseek-ai/dsh-base` 的单 bundle 初始化 `english-learning`(installation-owned 元组表也没有条目),web 仪表盘保持 `private: true` 且版本偏离家族线,`build:web` 跳过仪表盘、client-build 记录的 artifact 模式也未绑定其 dist,两个家族成员停在 `0.1.0`,而 `verify-packed-install` 以 `--omit=optional` 安装——koffi 3.2 起这会剥掉承载其预编译产物的平台包,迫使源码编译并链接失败。全新安装无法引导 profile,桌面形态则完全不存在。

## 决策

**把搁置的分发代码补落地,再增加一个拉起 dsh profile 并展示其仪表盘的 Electron 壳——壳不持有任何产品逻辑,SPA 零改动。**

- profile 模板改为 `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-english-learning']`,退役的单 bundle 元组用于归一化既有 profile 目录;web 包按家族版本可发布;`build:web` 构建两个前端,artifact 摘要纳入仪表盘 dist;`verify-packed-install` 保留可选依赖(npm 会跳过安装失败的可选项,Landlock 包保持无害,而 koffi ≥3.2 必须依赖其自身平台可选项)。
- `apps/desktop` 以子进程运行后端(`pnpm run dsh --profile english-learning --no-open --port 0`,或由 `DSH_DESKTOP_SIDECAR` 指名的 SEA 可执行),把 `DSH_HOME` 与后端 cwd 指进 OS 应用数据目录,从 stdout 解析公告的 `http://127.0.0.1:<port>/?token=…` 行并装入 `BrowserWindow`。端口 0 消除固定端口冲突一类的问题;`--no-open` 不再唤起浏览器;已含单实例锁、就绪超时错误对话框与 SIGTERM 清理;托盘、自动重启与自动更新推迟。
- 打包(electron-builder + 复用 SEA sidecar)留作后续:先需要签名与更新渠道的决策。

## 已考虑的替代方案

**把 harness 内嵌进 Electron 主进程。** 拒绝:Electron 自带 Node 低于 harness 引擎下限,且 node-pty 需按每个 Electron ABI 重编。

**Tauri 加 SEA sidecar。** 以后为更小安装体积可行,但今天为此引入 Rust 工具链没有功能收益。

**经 home 级 `cordis.patch.yml` 实现端口 0。** 不必要:webStartup 服务本就拥有 `--port` 与 `--no-open`。

## 后果

全新打包安装现在可以端到端引导 english-learning profile,桌面壳今天即可从仓库以开发模式运行应用;打包形态只需 sidecar 路径。verify 脚本自此演练真实消费者所见的依赖形态。冷机器上首次源码启动要花数分钟编译,因此壳的就绪超时为十分钟——打包后的 sidecar 数秒内公告。

## 测试

`build:official` → `release:pack`(245 个 dsh + 9 个 vendor tarball)→ `verify-packed-install`(254 个 tarball;安装后的 CLI 报告家族版本)→ 对打包安装做启动冒烟直至收到公告 URL;桌面壳实机运行显示 OS 分配端口的公告、`--no-open` 生效、窗口连接建立、SIGTERM 干净退出;聚焦 oxlint 全绿。app-boot 单测因已知的独立运行 OOM 跳过。
