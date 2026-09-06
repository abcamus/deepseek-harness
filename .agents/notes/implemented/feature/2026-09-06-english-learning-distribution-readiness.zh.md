# Agent Note: 英语学习分发就绪

Status: implemented

[English](2026-09-06-english-learning-distribution-readiness.md) | 中文

## 问题

english-learning 应用无法触达仓库外的用户，原因叠了三层。shipped profile 模板初始化全新的 `~/.dsh/profiles/english-learning` 时只写 `@deepseek-ai/dsh-english-learning`——没有 `@deepseek-ai/dsh-base`——新安装会挂载一个八个注入服务（tools、skills、web、webServer、agents、llm、settings、agentDefaultModel）全部无源的 bundle；应用在仓库内能跑，只因开发者手工创建的 profile 早于模板。Web 仪表盘包是 `private: true`，却处于 dsh 发布家族（`apps/*/package.json`）之中，发布要么在其 publish 步骤失败，要么发出一个硬依赖无法解析的 bundle。bundle 清单还导出 `./src/*`，而 `files` 列表从不发布 `src`——承诺了已发布 tarball 无法携带的文件。

## 决策

**english-learning profile 加入标准 npm 分发：修复 profile 模板、让每个家族成员可发布，并直接复用既有发布管线（每次 PR pack、从 `dsh-v*` tag publish、`verify-packed-install` 驱动安装后的二进制）——终端用户装一个 CLI、跑一个 profile。**

- **profile 模板现在写明 base bundle**——`['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-english-learning']`，与其他所有基于 base 的模板（acp、web、headless、sdk）对齐；installation-owned 元组列表记录模板化之前的布局，让既有 profile 目录被规范化而不是漂移。
- **Web 仪表盘成为可发布的家族成员。** 去掉 `private: true`（加 `publishConfig.access: public`）让 pack 与 publish 像对待其他成员一样对待它；其 `files: ["dist", …]` 携带 bundle 伺服的预构建资产。官方构建现在也构建它：`build:web` 跑两个 web 前端，client-build 记录的 artifact 模式包含 `apps/english-learning-web/dist/**/*`——新鲜度摘要把发布的 dist 绑定到构建环境，而不是信任一个 gitignore 的目录。
- **清单卫生对齐家族。** bundle 删除了幽灵 `./src/*` export；三个偏离共享版本线的成员（0.1.0 的 english-learning bundle、0.1.0-alpha.1 的 web 包、0.1.0 的 web-fetch-xiaohongshu 与 hello bundle）移到家族版本——这正是 `release:dsh` 会做的规范化，手工提前做让 `release:verify` 在下一次 bump 前即可通过。
- **`--no-open` 生效。** announce 块读取 `webStartup` 服务的 `openBrowser` 标志，不打开浏览器只打印 URL——无界面与服务器用户需要。

## 备选方案

**让 bundle 的 patch 自插入 base 行。** 否决：base 行是宿主共享核心，带平台门控和由 `dsh-base` 持有的逐行理由；复制它们会分叉核心组合并在每次 base 变更时漂移。

**把 web dist 内联进 bundle 包自己的 `files`。** 否决：这会把 bundle 的发布耦合到兄弟目录里的构建步骤并让资产在磁盘上翻倍；harness 惯例是一个 dist 一个包，经依赖树解析。

**专用的离线 tarball 流程。** 暂缓：`release:pack` 已产出完整 tarball 集合，`verify-packed-install` 证明其可安装；经 `release-publish.yml` 的 npm 发布是本次目标的维护路径，packed 目录仍是无 registry 访问时的分享兜底。

## 后果

全新的 `npm i -g @deepseek-ai/dsh` 加 `dsh --profile english-learning` 现在能启动完整栈：profile 以 base 加 bundle 初始化，仪表盘从已发布 web 包的 dist 伺服，预置技能经 `dsh-agent-presets` 到达，学习数据在启动目录的 `./.english-learning/` 下累积。发布家族的 publish 范围多了一个成员——web 包的 dist 必须在每次 pack 前由官方构建产出，artifact 模式摘要现在强制而非信任这一点。仓库内的既有 profile 不受影响：开发者的元组与模板一致，且规范化它现在是被允许的行为而非漂移。

## 测试

`release:verify --family dsh` 在对齐后的清单上通过（245 个成员、单一版本），验证链对 packed 集合依次运行 `build:official` → `release:pack` → `release:verify-packed-install`；packed 安装随后以 english-learning profile 启动，证明模板修复。`verify-package-readme-limitations` 与 `verify-package-readme-model-experience` 对本包新的双语 README 通过。
