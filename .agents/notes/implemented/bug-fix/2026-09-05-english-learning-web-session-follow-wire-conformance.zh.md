# Agent Note: english-learning 网页会话跟随的线上协议一致性

Status: implemented

[English](2026-09-05-english-learning-web-session-follow-wire-conformance.md) | 中文

## 问题

在 english-learning 网页的轨迹面板中点击任意会话始终失败，报错 `Stream session/follow failed: typert gateway: session/follow: wire field "request" failed boundary validation`，面板钩子随后每 3 秒重新发起跟随。`session/list` 正常返回，因此面板显示已连接并列出会话，而每次 follow 都在网关处被拒绝。

原因是两个问题叠加：服务器提供的 `dist/` 包落后于源码中补上必需 `kind: 'session'` 地址判别值的修复；根 `.gitignore` 的裸 `lib/` 模式把 `apps/english-learning-web/src/lib/` 整个忽略，内联网关客户端源码未被 git 跟踪，源码与构建产物的差异因此不可见。重新构建后 follow 能打开，但每条轨迹都渲染 `0 turns · 0 events`：follow 开场快照携带的历史记录包装为 `{ type: 'event' | 'chunks', event }`，而内联客户端把它们当作裸事件交给轨迹构建器。

## 决策

`apps/english-learning-web/src/lib/dsh-client.ts` 遵循[会话历史、控制状态与 Remote 事件传输](../architecture/2026-08-18-session-history-and-event-transport.zh.md)拥有的规范会话线上协议：`session/follow` 与 `session/page` 的地址携带 `kind: 'session'` 判别值；follow 开场快照与 `session/page` 结果在事件进入轨迹构建器前先解包 `SessionHistoryRecord.event`；`session/page` 发送描述符强制的 `throughSeq` 切点。根 `.gitignore` 取消忽略 `apps/english-learning-web/src/lib/`，客户端源码与消费它们的组件一起纳入跟踪。

webserver 每次请求都从磁盘读取 `dist/`，因此部署客户端改动的完整步骤是 `vite build` 加浏览器刷新，无需重启服务器。3 秒 follow 重试循环保持不变；follow 成功后循环自然结束。

## 已考虑的替代方案

**只重新构建。** 只部署判别值修复而不解包记录之所以落选：follow 能打开，但所有轨迹保持空白——同样的用户可见失败，只是推迟一步。

**为该应用在服务端改写记录形态。** 之所以落选：包装记录信封是官方客户端共同消费的规范线上协议；按应用改写会分叉上方传输笔记拥有的协议。

**改为导入规范网关客户端而非内联副本。** 暂缓：用 `@deepseek-ai/dsh-client-web` 替换内联 WebSocket 客户端是一次更大的打包重构；本次改动在不引入该重构的前提下恢复一致性。

## 后果

轨迹跟随对列出的会话都能从开场快照渲染轮次，线上形态漂移导致的 follow 失败从运行期前移到构建期。快照内的 `chunkrow/*` 打包运行仍未渲染：当正文只存在于打包运行中时，助手文本显示 `(empty response)`，打包工具调用显示 `unknown` 名称。在轨迹构建器中消费打包运行是剩余的保真度缺口。`src/lib/` 下的改动必须重新构建才能到达所服务的应用；git 现在跟踪这些源码，使这一要求可见。
