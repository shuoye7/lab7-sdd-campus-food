# 规范约束增强提示词

```text
第 3 轮规范约束增强，直接执行，不再重复展示四阶段确认。请更新两份 spec.md 的约束与验收章节，并直接修改 app.js、index.html、styles.css。

必须完成：
1. 新增 validateRestaurantId(value)：餐厅 ID 必须为 string 且 trim 后非空；无效时不收藏/取消并 console.warn。
2. 新增 xssFilter(value)：收藏数据和最近搜索在写入 localStorage 前过滤危险内容；读取 localStorage 时也清洗数据。
3. 全面改为 ES6：const/let、箭头函数、模板字符串。
4. 每个函数有 JSDoc，包含功能、@param、@returns。
5. 保持 camelCase，全部事件使用 addEventListener，禁止 onclick。
6. 保持收藏 20 家、刷新持久化、最近搜索 8 项、去重、清空、地图联动和移动端布局不变。
7. 更新两份 tasks.md，加入 Validator、XSSFilter、ES6/JSDoc 重构和回归验收任务。
```

