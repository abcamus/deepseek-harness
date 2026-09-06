# Agent Note: 英语学习定级测评可视化

Status: implemented

[English](2026-09-05-english-learning-placement-visualization.md) | 中文

## 问题

定级测评完全运行在浮动聊天框里。技能的多轮流程(背景 → 阅读 → 写作 → 口语 → 评估)以纯文本气泡到达学习者面前,面板没有任何测评阶段概念,完成与否只能等 30 秒的 `/api/profile` 轮询碰巧发现新档案。测评进行中的学习者看不到进度、不知道正在考察哪个维度,除 agent 的聊天文字外也没有任何结果呈现。

## 决策

**阶段进度是一份 agent 写的文件,以结构化 SSE 事件投影到面板。** `placement-assessment` 技能在每次阶段转换时用现有 `write` 工具重写 `.english-learning/placement-progress.json`——`{time, kind: 'placement-progress', stage, round, totalRounds}`,`stage` 取自 `background | reading | writing | speaking | scoring`——复用档案已经确立的 agent 写 JSON 模式。`profile.json` 契约和完成信号(写入档案)保持不变。

- **bundle 分类 write 调用,而不是解析聊天文本。** `classifyPlacementWrite`(`src/placement.ts`)按末段路径匹配 `write` 调用目标(`.english-learning/placement-progress.json` / `profile.json`,相对或绝对均可)并容错解析内容。广播发生在 `tool/result` 而非 `tool/call`,事件只在写入落盘后触发:每条进度写入广播 `placement {stage, round, totalRounds, time}`;测评进行中一条 placement 来源的档案写入落盘时广播 `placementComplete {profile}`。`manual` 来源的档案文档永远不会触发完成,因此在聊天里要求手改档案无法伪造测评。完成时同时删除进度文件。
- **`GET /api/placement` 提供进度文档**(或 null),让刚刷新的面板无需等待下一次写入即可恢复进行中的测评。
- **面板的全屏 `/assessment` 视图**渲染五段步进条(背景了解 → 阅读理解 → 写作表达 → 口语表达 → 评估报告)、分维度指示灯,以及驱动测评的同一套嵌入式聊天——消息流和输入行是抽出的共享组件(`ChatTranscript`、`ChatInput`),浮动聊天同样使用。挂载时通过 `GET /api/placement` 恢复进度;完成时展示结果面板并返回仪表盘。`startPlacement` 导航到该路由,浮动聊天在该路由隐藏;测评在视图之外进行时,聊天顶部显示进入全屏视图的入口条。
- **一份结果卡,三个使用点。** `PlacementResult` 渲染总体 CEFR 徽章、各维度 A1–C2 刻度条、薄弱徽章、评语和听力/口语估算脚注。它出现在测评视图的结果面板、聊天消息流(`placementComplete` 事件向消息流追加一条结果消息)和设置页档案区块(替换原先的纯文本分项行)。完成事件立即重新拉取档案和进度,不再等待轮询。

## 已考虑的替代方案

**结构化测评表单(agent 输出题目 JSON,面板渲染全屏表单)。** 维持原判:测评交互保持聊天驱动——只有进度和结果呈现是结构化的。聊天保留流式输出、历史和逐轮难度自适应;可视化不引入新的交互协议。

**解析助手文本中的阶段标记,或在 bundle 里数轮次。** 双重落败:文本标记污染学习者可见的聊天内容,且措辞一变即失效;数轮次无法在共享的持久 agent 上区分测评轮次与普通聊天轮次。进度文件显式携带阶段标识。

**结果用雷达图。** 落败:CEFR 等级是序数而非数值——四条共享 A1–C2 刻度的条形表达同样的事实,而不暗示半径可度量。

## 后果

阶段保真度取决于模型遵循进度写入指令:漏写一次只会让步进条停在前一阶段,不会破坏测评或存储,解析器拒绝格式不合的文档。被放弃的测评会留下进度文件;消费方把超过 15 分钟的文档视为失效,下一次测评在首个转换时覆盖它。`placementComplete` 在 `tool/result` 上广播,前端随后的档案重取不会与写入竞态。实时入口条和聊天内结果卡只存在于 SSE 流上;测评中途刷新的页面通过 `GET /api/placement` 恢复阶段,但不重放结果卡。

## 测试

`placement.ts` 由 `packages/bundle/english-learning/tests/placement.spec.ts` 单测覆盖:两份文档的容错解析矩阵、包含形似目录的路径匹配,以及 write 分类(含 manual 来源与损坏内容守卫)。
