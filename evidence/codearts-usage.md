# CodeArts 使用记录

以下为实验 7-2 中 CodeArts Agent 的主要开发记录，不包含 API Key 或认证信息。

## 无规格对照

- 输入模糊收藏需求并要求“不写规格文档”。
- CodeArts 没有直接生成代码，而是自行补全需求要点并要求确认。
- 该版本未实现，作为 Vibe Coding 语义不稳定的对照记录。
- 截图：`evidence/screenshots/01-vibe-vague-spec.png`。

## 餐厅收藏 SDD

- 创建 `.codeartsdoer/specs/restaurant-favorites/spec.md`。
- 使用 `spec-design-agent` 生成 `design.md`。
- 使用 `spec-task-agent` 生成 `tasks.md`。
- CodeArts 在任务执行阶段实现收藏图标、收藏列表、localStorage、20 家上限和地图联动。
- 修改文件：`index.html`、`styles.css`、`app.js`。

## 最近搜索 SDD

- CodeArts 检查到收藏任务不包含最近搜索，主动要求补规格。
- 创建 `.codeartsdoer/specs/recent-search/spec.md`、`design.md`、`tasks.md`。
- 实现最多 8 项、最近优先、去重提位、点击复用、清空和持久化。

## 规范约束增强

- 更新两份 `spec.md`、`design.md` 和 `tasks.md`。
- 增加 `validateRestaurantId` 和 `xssFilter`。
- 将 `app.js` 重构为 ES6 + JSDoc + camelCase。
- 移除内联事件属性，统一使用 `addEventListener`。
- 约束后的代码通过语法、功能、XSS 和响应式验收。

## 交互证据

- `evidence/screenshots/02-codearts-sdd-complete.png`
- `evidence/screenshots/03-favorites-recent-search.png`

## 备注

CodeArts 在规范驱动模式下会依次等待规格、设计和任务确认。为避免重复确认影响进度，后两项功能合并到同一份任务执行中；规范约束阶段使用明确的“直接执行”提示词完成代码落地。

