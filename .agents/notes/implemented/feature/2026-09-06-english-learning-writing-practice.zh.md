# Agent Note: 英语学习写作练习页面

Status: implemented

[English](2026-09-06-english-learning-writing-practice.md) | 中文

## 问题

写作是最后一个没有练习页面的维度：技能的写作模板把题目、要求和提示打印成聊天文本，学习者把作文敲回聊天，每一轮练习都生灭在聊天记录里。仪表盘的写作卡片统计的东西学习者无处对应。

## 决策

**写作练习保留练习页管线，但改变了分数的来源：写作没有客户端可验证的答案键，所以由 LLM 批改——会话文件携带两个阶段，页面收集作文而非勾选选项。**

- **一个文件，两个阶段。** 带「来自写作练习页」标记的请求让技能把写作任务（`kind: 'writing-exercise'`——题目、要求、提示、`targetWords`）写入 `.english-learning/writing-session.json`；bundle 分类 write 并广播 `writingExercise`。学习者经聊天提交作文后，技能批改语法、词汇和逻辑，并**重写同一文件**为结果（`kind: 'writing-result'`——score 0-100、总结、优点、问题、可选参考修改），触发 `writingResult`。`writing.ts` 的容错解析按 kind 区分阶段；`writing-session.json` 加单份待处理文档让生命周期与兄弟页面保持对称。
- **页面是编辑器，不是测验。** 任务渲染为带要求清单的任务卡，提供对 `targetWords` 实时计数的文本域，并经既有聊天提交（`onSubmitEssay` 组装批改 prompt，详细批改与其他导师对话一样出现在聊天里）。`writingResult` 到达后页面展示结构化结果——分数、总结、优点、问题、参考修改——并把分数恰好一次地 POST 到 `/api/writing/result`，同时提示逐条批改在聊天里。
- **记录保持标准形态。** 一篇作文算一题：`POST /api/writing/result` 写入 `{kind: 'exercise', skill: 'writing', count: 1, correct: score >= 60}`（带会话的 material/level），然后删除会话文档，XP、连续天数和正确率聚合零改动。提交失败时会话保持待处理，页面提供重试按钮。
- **共享外壳，定制正文。** 页面与兄弟页一样消费 `PracticeShared.tsx`（头部、来源选择、生成中面板），但保留定制结果面板——0-100 的分数没有 n/m 语义。

## 备选方案

**客户端语法评分。** 否决：浏览器里没有任何东西能批改语法、词汇和逻辑；拿词数冒充分数只会败坏记录的含义。

**独立的结果文件（任务与结果并排）。** 否决：两个文件让 write 分类和恢复逻辑翻倍，而信息从不同时存在；重写一个文档与 placement progress 模式一致且干净退场。

**绕过聊天批改（页面隐藏 prompt）。** 否决：聊天记录是学习者所有批改的持久档案——Model-visible ⟺ logged——结构化结果文档会重复聊天已有的批改。

## 后果

批改依赖模型遵循重写指令：跳过结果写入会让页面停在可取消的批改等待，聊天回复仍携带批改内容。作文经聊天传输，学习者自己的文本是会话记录的一部分——这是有意为之，不是泄露。分数对每份批改文档恰好提交一次（身份是 kind+time；POST 删除会话，批改后刷新回到首页而完整批改留在聊天里）。早于新端点启动的旧实例从磁盘伺服新页面，但重启前新端点 404。

## 测试

`writing.ts` 由 `packages/bundle/english-learning/tests/writing.spec.ts` 与兄弟规格并列做单元测试：阶段区分（任务与结果）、分数边界、要求与列表校验、路径匹配、write 分类。完整流程——写作、提交、批改结果到达、分数落账、XP 更新——经真实端点人工验证。
