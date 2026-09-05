# Agent Note: english-learning 资料管理管线

Status: implemented

[English](2026-09-05-english-learning-material-management-pipeline.md) | 中文

## 问题

english-learning 仪表盘带着一套设计好但从未接通的资料管线：资料标签页是写死的三条演示数据，上传与 AI 推荐弹窗没有文件输入、也没有对应后端路由，聊天 agent 不挂载任何预设导致四个资料技能不可见，而技能引用的工具名（`parse_material`、`generate_*`）在整个仓库中并不存在。从添加资料到 agent 消化资料的完整链路完全走不通。

## 决策

管线完全运行在既有工具集上，不新增规范线上接口：

- **资料以 Markdown 文件形式存放在启动工作区**：`<cwd>/.english-learning/materials/`，每个资料一个文件（`<时间戳>-<名称>.md`）。仪表盘 bundle 提供 `GET/POST/DELETE /api/materials`，直接读写该目录；该目录已加入 git 忽略。文件位于启动工作区内、即 agent 沙箱根之内，聊天 agent 用现成的 `read` 工具即可读取。
- **四个预设技能不挂载预设组合即可到达聊天 agent**。仪表盘 bundle 在 `ctx.skills` 上注册第二个 `skill-filesystem` provider，作用域仅限预设的 `skills/` 目录（`includeDefaultRoots: false`、关闭监视）；目录路径从 `@deepseek-ai/dsh-agent-presets` 包位置解析，绝不依赖进程 cwd。四个技能已改写为只用现有工具：`read` 读资料文件、`material-search` 用 `web_search`、练习直接在回复中输出，替换不存在的 `generate_*` 与 `parse_material`。
- **分析就是一条聊天消息**。界面的分析操作发送一条指明资料名称与文件路径的提示；agent 先加载 `material-digest`、再加载 `knowledge-extractor`，读取文件后在回复中输出结构化报告。分析状态徽标是客户端会话状态，不做持久化。
- **首页能力维度是 agent 学习记录的聚合**。消化与练习技能以记录步骤收尾：agent 用现成的 `write` 工具把每次活动写成一个小 JSON 文件，落在 `.english-learning/progress/`（`{time, kind: 'digest'|'exercise', skill, material?, level?, vocabulary?, count?, correct?}`）。bundle 提供 `GET /api/progress`，把这些文件折叠成各能力维度的活动计数、批改正确率（按轮累计 `correct`/`count`）、XP（消化 40、练习 20、词汇每个 5）、连续学习天数与最近记录；仪表盘据此推导技能卡分数（每次活动 20 分、上限 100）、等级路径、顶栏 XP 条和连续天数，并每 30 秒重新拉取。
- **训练是交互式闭环，词汇跨会话沉淀**。`exercise-generator` 技能按单维度推进：一次只出一组 3-5 题、等作答后批改（正确答案 + 解析 + 得分）、写入带成绩的练习记录，再询问是否继续下一维度；跳过或放弃的题组不写记录。`material-digest` 技能把提取的词汇追加存入 `.english-learning/vocabulary/`（`{time, material, level, words:[{word, definition, example}]}`），由 `GET /api/vocabulary` 提供查询，在仪表盘的 词汇 标签页展示，并配有一键复习按钮（发提示让 agent 从词汇本抽 5 词出题批改）。资料行的动作为 分析 与 训练 两个，正确率显示在能力卡的练习项旁。
- **资料获取是按能力自主完成的**。bundle 的 patch 层覆盖 base 的 `tool-web` 行、置 `fetch: true`（非 insert 补丁会整体替换 config，因此原行的 `searchTimeoutMs` 需在此重复），`web_fetch` 工具由此与 `web_search` 并存。`material-search` 技能承担端到端获取：读取学习记录评估学习者 CEFR 水平与最薄弱维度，搜索匹配资料，`web_fetch` 逐个尝试候选页面直到取得正文，再 `write` 带来源行存入资料目录——仪表盘资料列表在下一次轮询即可见。仪表盘的 ✨ AI 找资料 弹窗发送获取提示，可附主题偏好。

## 已考虑的替代方案

**挂载预设组合（`agentPreset` + `agent-presets` 行）。** 暂不采纳：该预设组合带着未验证的接线（`inject: ['skills']` 挂在 standard 预设不使用的行上；`config.skills.roots` 不是 `skill-filesystem` 定义的配置键），且会把本部署依赖模型设置运转的模型/搜索栈（exa 搜索、预设 LLM 配置）整体替换掉。若日后需要按预设组合会话，挂载仍是正路，但必须先修组合缺陷。

**把 `parse_material`、`generate_*` 实现为工具包。** 之所以落选：文本资料不需要解析工具，练习生成是模型在回复中即可完成的提示任务；为此类内容增加四个工具包，并不会带来现有工具不具备的能力。

**把资料存进 `settings.yaml` 或 JSON KV 存储。** 之所以落选：settings 存配置而非内容块，且 KV 里的资料文本会落在 agent 沙箱根之外，其文件工具无法读取。

## 后果

从仪表盘添加、列出、删除资料均可用；分析资料会跑通 消化 → 知识提取 并沉淀词汇本；自动获取按能力选材、抓取正文并入库；练习以交互式轮次进行并带批改正确率（已在临时实例上端到端验证，包括一条由 agent 自主写入的学习记录）。能力维度只反映 agent 真实记录的内容：全新部署在分析、批改、沉淀词汇之前各处都是零；记录与词汇文件是唯一数据源，手改文件即改仪表盘。批改节奏依赖模型遵守交互式指令——一次性倾倒所有维度的模型会破坏训练节奏，但不会写入虚假记录（跳过的题组不落盘）。后端与 patch 改动仍需重启服务器；web 前端重建后刷新浏览器即生效。资料仅限文本（TXT/MD/SRT/VTT 与粘贴文本）；PDF/音频/视频提取仍未实现，口语训练为文本跟读、无语音工具。每日任务页仍未接线。预设组合保持休眠，其接线缺陷如上所述。
