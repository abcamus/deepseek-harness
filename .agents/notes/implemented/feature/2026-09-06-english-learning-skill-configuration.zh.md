# Agent Note: 英语学习可配置的 agent 技能

Status: implemented

[English](2026-09-06-english-learning-skill-configuration.md) | 中文

## 问题

五个预置技能（exercise-generator、material-digest、knowledge-extractor、material-search、placement-assessment）是硬编码的：bundle 把预置技能目录注册为一个技能根，导师的目录里永远能看到全部技能。不想让 AI 找资料、觉得定级提醒吵的学习者没有办法关掉某个能力，而技能系统没有任何按技能的运行时控制——仅有静态 frontmatter 标志和组合行的插件级开关。

## 决策

**设置页新增「技能配置」标签逐个切换预置技能，选择持久化到 english-learning 设置命名空间，并由一层过滤 provider 包装让导师目录在下一轮对话生效。**

- **在 provider 边界过滤。** bundle 的 `FileSystemSkillProvider` 注册现在保留注册的 `SkillProviderControl`，返回一个薄包装 provider，其 `list()` 丢弃名字出现在 `disabledSkills` 设置里的候选（`get` 直接委托）。`FileSystemSkillProvider.list()` 在注册表缓存未命中时重新扫描目录，所以包装是唯一需要的过滤点。设置变更时 watch 处理器调用 `control.invalidate()`，注册表提升版本号并清空 collect 缓存，`tool-skill` 的逐轮快照重新发布目录摘要——导师在下一轮对话看到新集合，无需重启。
- **选择是持久化的拒绝列表。** `disabledSkills: string[]` 加入既有的 english-learning 设置 schema（默认为空——新技能默认可用），settings.yaml 记录的是关掉的技能名而非开着的。`POST /api/skills {name, enabled}` 切换一条；`GET /api/skills` 从预置目录列出目录清单，带 frontmatter 路由元数据（`skill-catalog.ts` 解析的 `name`/`description`/`whenToUse`，已单测）和启用标志。
- **设置页持有交互。** 新的「技能配置」标签列出每个技能的描述、触发条件和开关；切换立即生效（乐观翻转，落定后从服务器重载）。停用影响超出目录的行带有明确的后果提示——停用 exercise-generator 会关掉四个练习页面的生成，停用 placement-assessment 会阻断定级测评。

## 备选方案

**修改磁盘上的 frontmatter 标志（`disable-model-invocation`）。** 否决：它们是每个文件的静态内容，随预置发布，做成设置等于把仪表盘变成文本编辑器；拒绝列表是数据，预置更新后依然有效，也不需要写文件。

**启用技能的白名单。** 否决：拒绝列表让新增的预置技能默认可用，添加第六个技能不会对从未打开过设置的学习者静默隐藏。

**在技能注册表内部过滤。** 否决：按技能启停是这个产品的产品决策，不是 harness 原语——注册表的边界是 provider，而 bundle 本就拥有这个 provider。

## 后果

目录变更在下一轮对模型可见，但默认配置与之前逐字节相同——不碰这个标签的学习者什么都不会变。导师已在当前对话上下文里加载的技能会留在上下文中——开关治理的是发现和未来的轮次，正如它扩展的 model-invocable 策略。停用某个练习页面依赖的技能会让该页面在生成时退化（生成等待只能靠取消结束），后果提示行对此有警告。包装给技能加载加了一层间接；`get` 原样委托，所以被禁用的名字若被过期候选直接寻址仍可解析——门在目录，不在加载器。

## 测试

`skill-catalog.ts` 由 `packages/bundle/english-learning/tests/skill-catalog.spec.ts` 做单元测试：frontmatter 解析（引号、缺失键）、kebab-case 名字守卫、目录合并与启用标志、切换的增删幂等。端点往返与设置持久化经真实服务器人工验证；目录重发路径是 harness 自身已测试的机制。
