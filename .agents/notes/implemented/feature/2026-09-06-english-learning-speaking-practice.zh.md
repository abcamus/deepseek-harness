# Agent Note: 英语学习口语练习页面

Status: implemented

[English](2026-09-06-english-learning-speaking-practice.md) | 中文

## 问题

exercise-generator 技能的口语维度完全住在聊天里：模板把跟读句和对话骨架打印成纯文本，「口语」意味着打字回答，应用里没有任何录音或发音评分能力。听力页面上线后落差更明显——一个维度有了真正的练习页面，另一个还是文本模板。

## 决策

**口语练习端到端复用听力管线：技能写 `speaking-exercise` 文档，bundle 分类 write 并经 SSE 广播，`/speaking` 页面客户端录音、转写并对每一句评分。**

- **文档是带角色的句列表。** 带「来自口语练习页」标记的请求触发技能的页面驱动分支：5–8 句适合朗读的英文——普通跟读句，或 A/B 情景对话（`role: "A"` 是对方的话，`role: "B"` 是用户读的话）——写入 `.english-learning/speaking-session.json`。聊天只收到一句确认（exercise-generator/SKILL.md）。
- **录音和识别都在客户端。** 页面通过共享的 Edge TTS 端点播放示范句，用 `MediaRecorder` 录音，用浏览器语音识别（en-US）转写。每条转写与目标句做词级编辑距离评分（`similarityScore`，≥60 通过），用户可以逐句回放自己的录音；浏览器不支持识别或麦克风被拒时提供自评路径。
- **成绩落为标准记录。** 提交把 `{count, correct}` POST 到 `/api/speaking/result`，由服务端合成与聊天批改轮次相同的 `{kind: 'exercise', skill: 'speaking'}` progress 记录并删除会话文档；`GET /api/speaking` 恢复刷新后的轮次。「请 AI 点评」把目标句/转写/得分三元组交给聊天做发音反馈。
- **一个 TTS 端点，两个页面。** 听力播放器的合成端点从 `/api/listening/audio` 泛化为 `/api/tts`，两个练习页共享 Edge 语音和磁盘缓存。

## 备选方案

**用 LLM 批改开放式对话回答。** v1 否决：自由口语回答没有客户端可验证的答案键，每句都要一次 LLM 往返；页面改为确定性评分跟读还原度，表达层面的反馈走既有聊天。

**上传录音做服务端评分。** 否决：音频存储加服务端识别对单用户本地应用是多余的复杂度；转写加用户自己回放已携带同样信息。

**打字作答。** 否决：那会把口语练习退回页面要替代的聊天模板。

## 后果

识别质量取决于浏览器：该 API 仅 Chromium 支持且需要麦克风权限，因此缺失时页面提供自评路径，合成失败也绝不阻塞轮次——示范句回退浏览器语音。录音永不出本机；发到聊天做点评的转写是唯一产物。早于口语端点启动的实例会从磁盘伺服新页面，但提交会失败并提示未计入，需要重启实例——静态 dist 按请求读取，而插件代码在启动时加载。

## 测试

`speaking.ts` 由 `packages/bundle/english-learning/tests/speaking.spec.ts` 与听力、placement 规格并列做单元测试：容错解析矩阵（角色、提示、可选字段）、含相似目录的路径匹配、含 listening-session 相似文件的 write 分类。录音、识别与评分经页面人工对真实服务验证。
