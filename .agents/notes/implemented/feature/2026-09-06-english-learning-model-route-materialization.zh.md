# Agent Note:仪表盘模型设置同时物化 pi-ai 路由与凭据

Status: implemented

[English](2026-09-06-english-learning-model-route-materialization.md) | 中文

## 问题

仪表盘的模型设置页只写自己的展示列表和激活选择。pi-ai LLM 适配器挂载时休眠,只为 `llm-pi-ai.providers.*` 设置段中声明的路由注册适配器,而被引用的凭据存放在凭据缝里——因此在全新的 harness home(桌面壳私有的 `DSH_HOME`,或任何新安装)中,用户可以添加并激活一个模型,随后每轮对话都以 `no adapter registered for provider …` 失败。页面既没有密钥输入,也没有任何弥合差距的途径。

## 决策

**添加或激活模型现在同时物化其路由并存储其密钥,设置流程自身即告完整。**

- `POST /api/models/added` 接受可选 `apiKey`;新增 `POST /api/models/key` 在不动模型列表的情况下存储某提供方的密钥;激活模型(`POST /api/settings/model`)也确保其路由存在,让本修复之前的激活选择在下次激活时自愈。
- 单一辅助函数 `ensurePiAiRoute` 推导约定引用名(`OPENCODE_API_KEY` 风格,与 core Models 页同一推导),读取已存储的 `llm-pi-ai` 段并写出最小路径操作:缺失的配置创建为 `{}`——仅在附带密钥时写入 `apiKeyEnv`;已存在但未命名引用的配置只在那之后补 `apiKeyEnv`;已自行命名引用的配置保持原样,密钥存到那个引用名下。操作计算是纯导出(`piAiRouteOps`),合并纪律无需启动即可单测。
- 提供方卡片增加密钥字段与独立保存动作;添加与保存都携带已输入的草稿,一次操作即可完成配置。写入失败会把服务端原因(包括 pi-ai 对不可服务路由的拒绝)内联呈现。

## 已考虑的替代方案

**保存时整体重写 `llm-pi-ai` 段。** 损失:会清掉用户经 core Models 页写下的自定义配置(自定义 User-Agent、收窄的模型目录);最小路径操作是扩展而非替换。

**把仪表盘指向 core Models 页。** 损失:仪表盘拥有自己的流程,而同进程的 settings 与 credentials 缝已提供页面所需的一切。

**配置留给 `settings.yaml` 手工编辑。** 拒绝:桌面壳引入私有 harness home 正是为了让用户永远不必编辑 Application Support 下的文件。

## 后果

全新的 home 仅凭仪表盘即可到达可用的对话:选择提供方、粘贴密钥、添加模型。既有 home 在下次激活或保存密钥时获得路由;手工写的配置保持原状,因为写入按字段定界。pi-ai 拒绝某路由时写失败即报错,拼错的提供方 id 会带着适配器自己的原因浮出。

## 测试

聚焦 `tsc -b tsconfig.host.json` 通过;路由操作的合并行为由直接断言与单测(`tests/model-route.spec.ts`)覆盖;所有触及文件 oxlint 全绿;仪表盘构建成功。端到端:经运行中的应用存储密钥后适配器即时注册(settings 热加载),此前失败的提供方上一轮对话真实成功。
