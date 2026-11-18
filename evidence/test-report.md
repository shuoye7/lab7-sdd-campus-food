# SDD 验收报告

## 环境

- Windows
- Node.js 24.18.0
- Python 静态服务器：`http://127.0.0.1:8768/`
- Playwright + Google Chrome
- AMap 请求在自动化测试中主动中止，以稳定验证 Mock 降级和本地功能

## 收藏功能

| 验收项 | 结果 |
|---|---|
| 12 家餐厅均显示收藏按钮 | 通过 |
| 点击添加收藏 | 图标变为实心，toast 显示“已添加收藏” |
| 刷新页面 | 收藏图标、面板和计数保持 |
| 再次点击取消 | 状态和面板同步移除 |
| 收藏 20 家后继续收藏 | 阻止操作并提示“收藏夹已满（最多20家）” |
| 点击收藏列表项 | 对应卡片高亮，本地地图信息窗打开 |
| 收藏空态 | 没有收藏时显示空态 |

## 最近搜索

| 验收项 | 结果 |
|---|---|
| 提交“川菜” | 保存到 localStorage 并显示标签 |
| 刷新页面 | 标签和 localStorage 保持 |
| 点击最近搜索 | 回填搜索框并执行搜索 |
| 清空最近搜索 | 区域隐藏，localStorage 清空，toast 显示“已清空最近搜索” |
| 超过 8 个关键词 | 只显示最近 8 项 |
| 重复关键词 | 去重并移动到最前 |

## 安全与代码规范

| 约束 | 结果 |
|---|---|
| 餐厅 ID 类型/非空校验 | 通过，无效 ID 产生 `console.warn` 且不改动收藏 |
| XSS 过滤 | 注入的 `<img onerror>` 未执行，收藏和最近搜索中没有注入节点 |
| ES6 | `app.js` 中 `var` 数量为 0，使用 `const`/`let`、箭头函数和模板字符串 |
| JSDoc | 业务函数具有功能说明、`@param` 和 `@returns` |
| inline onclick | HTML/JS/CSS 中数量为 0 |
| 事件监听 | 使用 `addEventListener` |

## 响应式

| 视口 | 结果 |
|---|---|
| 1440px | 桌面布局正常，无横向溢出 |
| 390px | 无横向滚动，顺序为地图 → 我的收藏 → 推荐结果 |

## 运行稳定性

- `node --check app.js`：通过。
- Playwright `pageerror`：0。
- Mock 与本地示意地图模式：正常。

## 证据截图

- `evidence/screenshots/01-vibe-vague-spec.png`
- `evidence/screenshots/02-codearts-sdd-complete.png`
- `evidence/screenshots/03-favorites-recent-search.png`
- `evidence/screenshots/04-sdd-mobile.png`
- `evidence/screenshots/05-sdd-final-desktop.png`
- `evidence/screenshots/06-sdd-final-mobile.png`

