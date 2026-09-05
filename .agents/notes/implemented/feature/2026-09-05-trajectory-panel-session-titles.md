# Agent Note: Trajectory panel session titles

Status: implemented

English | [中文](2026-09-05-trajectory-panel-session-titles.zh.md)

## Problem

The english-learning trajectory panel labeled every list row with the first eight characters of the session ID, so `english-learning-chat-<timestamp>` and `session-<uuid>` sessions collapsed into indistinguishable `english-` / `session-` rows. Durable titles exist as `session/title` events folded into the `title` projection, but `session/list` summaries carry no title field.

## Decision

The panel assembles titles client-side from the two canonical sources. One `session/control` stream per connection delivers the `title` projection baseline for live sessions and live `projection` updates afterwards. Sessions absent from that baseline (cold persisted sessions) are probed once each with a short-lived follow snapshot (`maxMessages: 1`), whose opening frame carries the cold projection baseline, at concurrency three; probe results are cached per connection. Rows render `title ?? sessionId.slice(0, 8)`, so untitled sessions keep the ID-prefix fallback.

The canonical `SessionSummary` list wire type stays unchanged; the panel consumes the existing wire vocabulary without forking it.

## Alternatives considered

**Add `title` to `SessionSummary` and the list handler.** Lost for now: it changes the canonical session-controller wire type, its generated descriptor, and every consumer for one panel's label, while the client already has both projection sources.

**Probe every row with follows and skip the control stream.** Lost: the control stream is the only live update path — renames and freshly generated titles reach the panel while connected, and its baseline removes probes for live sessions.

**Title only the selected session from its follow snapshot.** Lost: the complaint was indistinguishable rows, and only one row would be named.

## Consequences

Titled sessions display their durable title (34 of 40 in the verification run), and title changes appear live while connected; sessions without a durable title keep the ID prefix. Each connect or refresh performs at most one cold follow per until-titled persisted session, bounded to three concurrent streams. A future batch cold-projection RPC would delete the per-row probing.
