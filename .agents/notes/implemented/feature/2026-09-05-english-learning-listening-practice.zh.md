# Agent Note: 英语学习听力练习页面

Status: implemented

[English](2026-09-05-english-learning-listening-practice.md) | 中文

## 问题

exercise-generator 技能的听力维度此前是聊天文本里的阅读理解：模板把原文和选择题作为普通聊天气泡输出，应用没有任何音频能力，批改还要在聊天里手敲 `1A, 2C`。仪表盘的「完成听力练习」任务和听力技能卡没有可以指向的练习页面。

## 决策

**听力练习是一份 agent 写入的文档，在独立的全屏 `/listening` 页面上渲染成互动播放器；由客户端批改，并通过一个 REST 端点上报成标准 progress 记录。**

- **练习文档自带答案键。** 在页面开始一轮练习会发送带「来自听力练习页」标记的固定 prompt，触发 exercise-generator 技能的页面驱动分支：按水平生成一段英文短文和 3–5 道四选一理解题，用 stock `write` 工具把完整练习（原文、题目、`answer` 下标、一句话解析）写入 `.english-learning/listening-session.json`。聊天里只回一句确认，保证原文先听后看（exercise-generator/SKILL.md）。
- **bundle 分类 write 调用，不解析聊天文本**——沿用 placement 管线的模式。`classifyListeningWrite`（`src/listening.ts`）按末段匹配会话文件路径并容错解析内容；`listeningExercise` SSE 事件在 `tool/result` 时广播，绝不在 `tool/call` 时。`GET /api/listening` 返回待完成文档，刷新后的页面据此恢复本轮练习。
- **客户端批改，服务端落账。** 页面通过后端的 Edge 神经语音播放原文——`msedge-tts` 代理 Edge 朗读服务（`POST /api/tts`），音频磁盘缓存在 `.english-learning/tts-cache/`，提供四个可选发音人——合成失败时回退浏览器语音合成。回退路径按音质信号挑选系统里最好的已安装语音（网络 "natural"/Google 语音、Enhanced/Premium 下载语音、Siri 优先）并匹配所选 Edge 发音人的性别，把紧凑型怪声语音（"Bahh"、"Bells"）挡在听力训练之外；回退激活期间播放器显示音质降级提示。播放器提供播放/暂停/继续、重听和 0.75×/1×/1.25×。页面提交前隐藏原文，按答案键即时批改，并把 `{count, correct}` POST 到 `/api/listening/result`。bundle 合成与聊天批改轮次相同的 `{kind: 'exercise', skill: 'listening', count, correct}` 记录，然后删除会话文档，仪表盘的 XP/正确率/连续天数聚合零改动。页面驱动分支自己绝不写 progress 记录，同一轮不会被双记。
- **入口**：顶栏的 🎧 按钮；仪表盘听力技能卡直接跳转 `/listening`（其他维度保留详情弹窗）。浮动聊天在该路由隐藏。「讨论错题」把错题整理成自包含消息交给聊天并返回仪表盘。

## 备选方案

**经聊天由 agent 批改。** 否决：四选一选择题的批改是确定性工作，却要增加一次 LLM 往返和第二份文档/SSE 事件对，而反馈内容答案键里已经有了——解析在出题时一并写入。

**需要密钥的云端 TTS provider（OpenAI/Azure）。** 否决：配密钥和设置页面换来的神经级音质，免密钥的 Edge 朗读服务经 `msedge-tts` 已经能交付。第一版只用了浏览器语音合成并已发布，但其默认语音对听力训练来说太机械，当天就换成了免密钥的 Edge 代理；浏览器合成保留为离线/失败回退。

**解析聊天练习模板。** placement 决策中已两次否决：聊天文本解析在措辞漂移下会碎，而且可阅读的原文会破坏「先听后看」。

## 后果

轮次完整性依赖模型遵循写文档指令：跳过或写坏的文档让页面停在可取消的生成态，不会破坏 UI——解析器拒绝非法文档。放弃的轮次留下会话文档；下次进入页面会再次提供，下次生成会覆盖它。答案键会到达浏览器——单用户本地应用可以接受。没有待处理会话文档时 POST 成绩返回 409；页面仍展示批改结果并提示未记入。Edge 音频经 `playbackRate` 即时变速，切换发音人会重新朗读；只有浏览器合成回退在变速时重读——speechSynthesis 无法在播放中变速。Edge 朗读端点是未公开接口，可能收紧或消失；失败路径把播放器降级到本地回退而不是破坏轮次，且 SSML 模板原样插值内容，所以 bundle 在合成前转义 `&`/`<`/`>`。

## 测试

`listening.ts` 由 `packages/bundle/english-learning/tests/listening.spec.ts` 与 `placement.spec.ts` 并列做单元测试：容错解析矩阵（可选字段、逐题校验、越界答案下标）、含相似目录的路径匹配、write 分类守卫。`tts.ts` 由 `tests/tts.spec.ts` 覆盖 SSML 转义、语音守卫和缓存键推导；真实合成经端点人工对真实服务验证。
