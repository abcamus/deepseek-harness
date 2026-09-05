# Agent Note: 轨迹面板会话标题

Status: implemented

[English](2026-09-05-trajectory-panel-session-titles.md) | 中文

## 问题

english-learning 轨迹面板的列表行用会话 ID 的前八个字符做标签，`english-learning-chat-<时间戳>` 与 `session-<uuid>` 会话因此坍缩成无法区分的 `english-` / `session-` 行。持久标题确实存在——`session/title` 事件折叠进 `title` 投影——但 `session/list` 摘要不携带标题字段。

## 决策

面板从两个规范来源在客户端组装标题。每条连接一条 `session/control` 流：先送达活跃会话的 `title` 投影基线，之后持续送达实时 `projection` 更新。基线之外的会话（冷持久会话）各用一条短连接 follow 快照（`maxMessages: 1`）探测一次——其开场帧携带冷投影基线——并发上限为三；探测结果按连接缓存。列表行渲染 `title ?? sessionId.slice(0, 8)`，无标题会话保留 ID 前缀回退。

规范 `SessionSummary` 列表线上类型保持不变；面板消费既有线上词汇，不分叉协议。

## 已考虑的替代方案

**给 `SessionSummary` 与列表处理加 `title`。** 暂不采纳：为一个面板标签改动规范 session-controller 线上类型、生成描述符和所有消费方，而客户端已经拥有两个投影来源。

**全部行都用 follow 探测、跳过控制流。** 之所以落选：控制流是唯一的实时更新路径——重命名与新生成的标题在连接期间即可到达面板，且其基线省去活跃会话的探测。

**只为选中会话从其 follow 快照取标题。** 之所以落选：用户抱怨的是列表行无法区分，而这种做法只会命名一行。

## 后果

有标题的会话显示持久标题（验证运行中为 40 个中的 34 个），连接期间标题变更实时可见；无持久标题的会话保留 ID 前缀。每次连接或刷新对未取到标题的持久会话至多发一次冷 follow，并发上限三。将来若出现批量冷投影 RPC，即可删除逐行探测。
