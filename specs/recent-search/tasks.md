# 编码任务规划：最近搜索

> 需求基线：`.codeartsdoer/specs/recent-search/spec.md`（唯一验收依据）
> 设计基线：`.codeartsdoer/specs/recent-search/design.md`（锚点、函数名、DOM id/class、存储 key 均以该文档为准，不新增设计外的架构级改动）
> 实现约束：零依赖原生实现（纯 HTML/CSS/JS，无构建工具、无外部 UI 框架）；沿用既有分离式 `styles.css` 手写布局（桌面左右分栏、移动堆叠）；文件名小写 kebab-case；代码标识符使用英文。
> 改动范围：仅 `index.html`、`styles.css`、`app.js` 三个既有文件；**不新增文件、不新增网络请求、不新增后端接口、不新增构建配置与第三方依赖**。
> 硬性约束：`searchPlaces()`（`app.js:451-486`）函数体零改动；`locateAndSearch()`（`app.js:384-414`）、`applyMockData()`（`app.js:488-502`）、`filterBar` 委托（`app.js:121-135`）、`setSort()`（`app.js:240-250`）均不接入记录逻辑。

## 1. 最近搜索数据层（本地存储底座）

### 1.1 定义存储常量与文案常量

- [ ] 在 `app.js` 的 IIFE 顶部常量区新增最近搜索常量（前置依赖：无）
  - 涉及文件：`app.js`（常量声明区，`AMAP_READY_TIMEOUT`（第 11 行）之后、`var dom = {}`（第 13 行）之前）
  - 具体改动：新增 `RECENT_SEARCH_STORAGE_KEY = 'campus-food-recent-searches:v1'`、`RECENT_SEARCH_LIMIT = 8`、`RECENT_SEARCH_MAX_LENGTH = 50`、`RECENT_SEARCH_TOAST = { cleared: '已清空最近搜索' }`；`RECENT_SEARCH_LIMIT` 与 `RECENT_SEARCH_MAX_LENGTH` 作为唯一数值来源，读取、写入、渲染三处共用，禁止在别处硬编码 `8` 与 `50`
  - 验收步骤：全文检索 `8` 与 `50`，除常量定义处与文案字符串外无其它上限/长度硬编码；检索 `campus-food-recent-searches:v1` 仅出现在常量定义处

### 1.2 在 state 中挂载最近搜索列表

- [ ] 在 `app.js` 的 `state` 对象中新增 `recentSearches: []`（前置依赖：1.1）
  - 涉及文件：`app.js`（`state` 定义，`selectedId`（第 27 行）之后；收藏功能若已落地则紧邻 `favorites` 声明，二者互不依赖）
  - 具体改动：元素类型为 `string`，索引 0 为最近一条；数组只由记录层（`rememberSearchKeyword` / `clearRecentSearches`）与启动装载（`boot`）写入，视图层只读
  - 验收步骤：断点或 `console.log(state.recentSearches)` 可见初始为 `[]`；既有 `state` 字段（`restaurants`、`keyword`、`price`、`taste`、`sort`、`selectedId`、`route` 等）未被改动

### 1.3 实现本地读取与脏数据清洗

- [ ] 在 `app.js` 中新增 `readRecentSearches()`（前置依赖：1.1、1.2）
  - 涉及文件：`app.js`（新增函数，放在 `esc()`（`app.js:1186-1190`）附近的工具函数区，与后续 2.x 新增函数同区块）
  - 具体改动：
    - `localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)` → `JSON.parse`，整体包裹 `try/catch`
    - 结果非数组 → 静默 `removeItem` 并返回 `[]`
    - 逐条丢弃非 `string` 条目与 `trim()` 后为空的条目
    - 合法条目统一 `trim()` 并按 `RECENT_SEARCH_MAX_LENGTH` 截断（超出取前 50 个字符）
    - 按 `trim()` 后的完整字符串**首次出现**去重（大小写敏感，符合 spec"忽略首尾空白差异"）
    - 截断到 `RECENT_SEARCH_LIMIT`（8 条）
    - 任一步抛异常 → 静默 `removeItem` 并返回 `[]`，不抛异常、不 `note()`、不 `showToast`
  - 验收步骤：控制台依次写入 `not-json`、`{"a":1}`、`null`、`[1,2]`、`[""]`、`[" 川菜 ","川菜","",""]` 后刷新页面，均不报错；最后一种情况得到 `["川菜"]` 且条目不重复

### 1.4 实现本地写入与存储异常降级

- [ ] 在 `app.js` 中新增 `writeRecentSearches(list)`（前置依赖：1.3）
  - 涉及文件：`app.js`（与 `readRecentSearches` 相邻）
  - 具体改动：`JSON.stringify(list)` 后 `setItem`，成功返回 `true`；捕获 `QuotaExceededError` / 隐私模式禁用 / `SecurityError` 后返回 `false`，**不抛异常、不回滚内存态、不弹任何提示**（会话内仍可正常展示）
  - 验收步骤：DevTools 中重写 `localStorage.setItem` 使其抛错后执行一次搜索，页面无报错、搜索照常完成、区域仍按内存态显示新增关键词

### 1.5 启动时装载并缓存新增 DOM

- [ ] 在 `boot()` 中装载最近搜索，并在 `cacheDom()` 中缓存新增节点（前置依赖：1.3、3.1）
  - 涉及文件：`app.js`（`boot`（`app.js:71-84`）中 `buildMockRestaurants('')` 与 `renderAddress()` 之间，即原第 74-75 行之间；`cacheDom`（`app.js:86-112`）末尾）
  - 具体改动：
    - `boot` 中新增 `state.recentSearches = readRecentSearches();` 与 `renderRecentSearches();`，位于 `renderList()` 之前，保证首帧显隐即正确
    - `cacheDom` 末尾新增 `dom.recentSearch = document.getElementById('recentSearch');`、`dom.recentTags = document.getElementById('recentTags');`、`dom.recentClear = document.getElementById('recentClear');`
  - 验收步骤：刷新页面（localStorage 中预置 `["川菜","日料"]`）后区域首帧即显示两枚标签；清空存储后刷新，区域首帧即隐藏且头部无空白行

## 2. 搜索提交记录链路（记录时机与规则）

### 2.1 新增唯一提交入口 handleSearchSubmit

- [ ] 在 `app.js` 中新增 `handleSearchSubmit(rawValue)`（前置依赖：1.4、2.3）
  - 涉及文件：`app.js`（新增函数，与 1.3/1.4 同一函数区块）
  - 具体改动：
    - `var trimmed = String(rawValue == null ? '' : rawValue).trim();`
    - 空值分支：`state.keyword = ''; searchPlaces(); return;` —— 不写库、不重渲染、不改动既有记录与顺序
    - 非空分支：先 `rememberSearchKeyword(trimmed)` 完成记录与渲染，再 `state.keyword = trimmed`（**写入完整值，不截断**），最后 `searchPlaces()`
    - 函数内部吞掉存储异常，保证记录失败不影响搜索；不调用 `form.submit()`、不派发 `submit` 事件
  - 验收步骤：搜索"川菜"后 `state.keyword === '川菜'` 且 `searchPlaces` 被调用一次；输入 60 字符关键词时 `state.keyword` 为完整 60 字符，而记录项为前 50 字符

### 2.2 将 submit 监听改为调用统一入口

- [ ] 改写 `bindEvents()` 中的 `searchForm` 提交监听（前置依赖：2.1）
  - 涉及文件：`app.js`（`bindEvents`（`app.js:114-196`）内 `submit` 监听，原 `app.js:115-119`）
  - 具体改动：保留 `event.preventDefault()`，将"赋值 `state.keyword` + `searchPlaces()`"整体替换为 `handleSearchSubmit(dom.searchInput.value)`；不得保留原有赋值语句，避免记录与搜索重复或顺序颠倒
  - 验收步骤：
    1. 点击"搜索"按钮与在输入框按回车各触发一次，均只新增/提升一条记录
    2. 页面加载时的 `locateAndSearch()`（`app.js:384-414`，含 `searchPlaces({ initial: true })`）不产生任何记录
    3. 确认 `searchPlaces()`（`app.js:451-486`）、`applyMockData()`（`app.js:488-502`）函数体与改动前逐行一致（仅对比函数体，无新增语句）

### 2.3 实现 rememberSearchKeyword 记录领域逻辑

- [ ] 在 `app.js` 中新增 `rememberSearchKeyword(rawValue)`（前置依赖：1.1、1.2、1.4、3.2）
  - 涉及文件：`app.js`（与 `readRecentSearches` / `writeRecentSearches` 相邻）
  - 具体改动（严格按 2.1.3 提交流程）：
    1. `trimmed = String(rawValue == null ? '' : rawValue).trim()`，为空直接 `return`（不写库、不重渲染）
    2. `record = trimmed.slice(0, RECENT_SEARCH_MAX_LENGTH)`
    3. 用 `indexOf` 找出 `state.recentSearches` 中与 `record` 完全相等的旧条目并移除（去重，条目不增加）
    4. `state.recentSearches.unshift(record)`
    5. `state.recentSearches = state.recentSearches.slice(0, RECENT_SEARCH_LIMIT)`（超 8 条丢弃最久未使用）
    6. `writeRecentSearches(state.recentSearches)`（失败也不阻断）
    7. `renderRecentSearches()`
  - 验收步骤：依次搜索"川菜"→"日料"→"奶茶"后数组为 `["奶茶","日料","川菜"]`；再次搜索"川菜"后数组为 `["川菜","奶茶","日料"]`（长度仍为 3）；连续搜索 9 个不同关键词后数组长度为 8 且首个关键词已消失

### 2.4 校验空值与纯空白提交不产生记录

- [ ] 验证空关键词提交路径（前置依赖：2.2）
  - 涉及文件：`app.js`（仅核验，不改代码）
  - 验收步骤：记录若干关键词后，在搜索框输入空格/制表符/全角空格并提交，区域内容与顺序完全不变，localStorage 中 `campus-food-recent-searches:v1` 值不变；`searchPlaces()` 仍按既有行为展示结果（示例模式下为全量数据）

### 2.5 校验筛选与排序不产生记录

- [ ] 验证筛选/排序与记录链路的结构性隔离（前置依赖：2.2）
  - 涉及文件：`app.js`（仅核验，不改代码）
  - 验收步骤：连续点击价格 chip、口味 chip、"评分最高/距离最近"排序按钮各数次，`state.recentSearches` 与区域内容零变化，localStorage 无写入（DevTools Application 面板无更新）；确认 `filterBar` 委托（`app.js:121-135`）与 `setSort()`（`app.js:240-250`）未被插入任何记录调用

## 3. 最近搜索区域结构与空态

### 3.1 在搜索框下方插入区域 DOM

- [ ] 在 `index.html` 中新增 `#recentSearch` 区域（前置依赖：无，可与第 1 组并行）
  - 涉及文件：`index.html`（搜索表单 `</form>`（第 34 行）与 `.filter-bar`（第 36 行）之间）
  - 具体改动：插入
    - `<section class="recent-search" id="recentSearch" aria-labelledby="recentSearchTitle" hidden>`
    - 内部依次为 `<span class="recent-title" id="recentSearchTitle">最近搜索</span>`、`<div class="recent-tags" id="recentTags"></div>`、`<button class="recent-clear" type="button" id="recentClear" aria-label="清空最近搜索">清空</button>`
    - `</section>`
    - 必须默认带 `hidden` 属性；位于 `.app-header` 内，纵向间距由既有 `gap: 12px`（`styles.css:39-44`）承担，不额外加外边距
  - 验收步骤：DOM 顺序为"搜索栏 → 最近搜索 → 筛选栏"；首屏（无记录）该区域不可见且不占据高度，筛选栏位置与改动前一致（无布局跳动）

### 3.2 实现 renderRecentSearches 视图函数

- [ ] 在 `app.js` 中新增 `renderRecentSearches()`（前置依赖：1.5、3.1）
  - 涉及文件：`app.js`（与记录层函数相邻）
  - 具体改动：
    - `dom.recentSearch` 或 `dom.recentTags` 缺失时直接 `return`（容错，避免初始化顺序问题打断 `boot`）
    - 无记录：`dom.recentTags.innerHTML = ''`；`dom.recentSearch.hidden = true`
    - 有记录：按 `state.recentSearches` 顺序生成 `<button class="recent-tag" type="button" data-keyword="{esc(keyword)}">{esc(keyword)}</button>` 并整体写入 `dom.recentTags.innerHTML`；`dom.recentSearch.hidden = false`
    - 文本与 `data-keyword` 均经 `esc()`；不使用 `.chip` 类；每次渲染整体重建标签容器，不动清空按钮节点
  - 验收步骤：输入含 `<`、`"`、`&` 的关键词（如 `a<b"c&d`）后区域文本按原文显示且 DOM 结构未破坏（无标签错位、无多余节点）

### 3.3 确认无记录时零占位

- [ ] 核验隐藏态的布局表现（前置依赖：3.2）
  - 涉及文件：`styles.css`（仅核验既有 `[hidden] { display: none !important; }`，`styles.css:630`，不新增覆盖规则）
  - 验收步骤：首次访问（无存储）与点击清空后，头部"搜索栏 → 筛选栏"间距与设计稿一致，无空白行、无高度跳动；`getBoundingClientRect().height` 为 0

## 4. 点击复用与整体清空

### 4.1 补齐共享 toast 能力（条件性）

- [ ] 确认或补建 `#toast` 与 `showToast()`（前置依赖：无）
  - 涉及文件：`index.html`（第 121 行前，即 `<footer>` 之后、三个 `<script>` 之前）、`styles.css`（文件末尾新增区，`styles.css:830` 之后）、`app.js`（常量区新增 `toastTimer`；`cacheDom` 末尾新增 `dom.toast`；新增 `showToast`）
  - 具体改动：
    - **先检查**：若 `index.html` 已存在 `#toast` 且 `app.js` 已有 `showToast`（收藏功能已落地），**跳过补建**，仅核对契约一致，禁止重复定义同名函数与同名容器
    - 未存在时按 design.md 2.9 同一契约补建：`<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>`
    - `showToast(message, type)`：写文案 → 去 `hidden` → 下一帧加 `is-visible` → `type === 'error'` 加/否则去 `is-error` → 每次调用先 `clearTimeout(toastTimer)` 再计时（普通 2000ms）→ 到时去 `is-visible` 并在过渡后 `hidden = true` 且清空 `textContent`
    - `styles.css` 新增 `.toast`（`position: fixed` 底部居中、`z-index` 高于地图遮罩、圆角、单行居中、`opacity/transform` 过渡）、`.toast.is-visible`、`.toast.is-error`（复用 `--warn` 系列变量）
  - 验收步骤：控制台调用 `showToast('已清空最近搜索')` 可见底部提示并在 2 秒后消失；连续快速调用 3 次只显示最后一条；若收藏功能已在位，确认全项目 `showToast` 与 `id="toast"` 各只有一处

### 4.2 绑定区域事件委托

- [ ] 在 `bindEvents()` 中为 `#recentSearch` 新增 click 委托（前置依赖：1.5、3.1、4.1）
  - 涉及文件：`app.js`（`bindEvents`（`app.js:114-196`）内，紧跟 `searchForm` 监听之后新增，不修改既有监听）
  - 具体改动：`dom.recentSearch.addEventListener('click', handler)`；**判定顺序固定为**：先 `event.target.closest('#recentClear')` → 调 `clearRecentSearches()` 并 `return`；再 `event.target.closest('.recent-tag')` → 取 `data-keyword` 并调复用逻辑；两者都不命中则不做任何事
  - 验收步骤：点击"清空"不会误触发标签搜索；点击标签不会误触发清空；点击区域标题/空白处无任何动作

### 4.3 标签点击复用并提位

- [ ] 实现标签点击的"回填 + 立即搜索 + 提升首位"（前置依赖：4.2、2.1）
  - 涉及文件：`app.js`（4.2 委托内 `.recent-tag` 分支）
  - 具体改动：
    - `var keyword = tag.getAttribute('data-keyword');`
    - `dom.searchInput.value = keyword;`（显式回填，光标与显示同步）
    - `handleSearchSubmit(keyword);`（由 2.1 统一入口完成记录提位与 `searchPlaces()` 调用）
    - 不调用 `dom.searchForm.submit()`、不派发 `submit` 事件、不额外手动调用 `searchPlaces()`，避免二次提交与重复记录
    - 依赖 `<button type="button">` 原生行为覆盖键盘 Enter/空格触发，不新增键盘监听
  - 验收步骤：点击"日料"后输入框为"日料"、结果列表刷新、结果计数变化、地图红点按既有逻辑刷新，且"日料"移动到标签首位且总数不变；用 Tab 聚焦标签后按 Enter 效果相同

### 4.4 实现整体清空

- [ ] 在 `app.js` 中新增 `clearRecentSearches()`（前置依赖：1.4、3.2、4.1）
  - 涉及文件：`app.js`（与 `rememberSearchKeyword` 相邻）
  - 具体改动：`state.recentSearches = [];` → `writeRecentSearches([]);`（失败也不阻断）→ `renderRecentSearches();`（区域 `hidden`）→ `showToast(RECENT_SEARCH_TOAST.cleared)`；不调用 `searchPlaces()`、不清空搜索框、不重置筛选与排序；不提供单条删除
  - 验收步骤：点击"清空"后区域立即消失、出现"已清空最近搜索"、结果列表与筛选状态保持不变；刷新页面后区域仍为空；localStorage 中该 key 的值为 `"[]"`

## 5. 视觉样式与移动端适配

### 5.1 新增最近搜索区域与标签样式

- [ ] 在 `styles.css` 中新增 `.recent-search` 系列样式（前置依赖：3.1）
  - 涉及文件：`styles.css`（`styles.css:167` 之后、`.chip` 之前新增区块，或文件末尾新增区；二者择一，保持单一区块）
  - 具体改动：
    - `.recent-search { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }`（与搜索栏左对齐，随 `.app-header` 内边距，不加外边距）
    - `.recent-title { flex: none; font-size: 12px; color: var(--ink-soft); }`
    - `.recent-tags { display: flex; flex-wrap: wrap; gap: 6px; }`
    - `.recent-tag`：圆角 999px、字号 12.5px 量级（复用 `.chip` 尺度但独立类名）、`1px solid var(--line)`、`background: rgba(255,255,255,.75)`、`color: var(--ink-soft)`、`cursor: pointer`、`transition: all .15s ease`；`:hover` 边框转 `#ffc7a8`、文字转 `var(--brand-deep)`；`:focus-visible` 保留可见焦点环
  - 验收步骤：区域视觉与搜索栏、筛选 chip 层级协调；标签在长关键词下自动换行且不撑破容器；键盘 Tab 聚焦时焦点环清晰可见

### 5.2 清空按钮样式

- [ ] 新增 `.recent-clear` 样式（前置依赖：5.1）
  - 涉及文件：`styles.css`（与 5.1 同一区块）
  - 具体改动：无边框文本按钮、透明底、`flex: none`、`font-size: 12px`、`color: var(--ink-soft)`、`cursor: pointer`；`:hover` 文字转 `var(--brand-deep)`；`:focus-visible` 保留焦点环；不使用 `.chip` 的实心态样式
  - 验收步骤：清空按钮始终紧跟在标签容器后方、不被挤到下一行中部；hover 与聚焦态可辨识

### 5.3 移动端与窄屏适配

- [ ] 在既有媒体查询中补齐响应式规则（前置依赖：5.1、5.2）
  - 涉及文件：`styles.css`（`@media (max-width: 900px)`，`styles.css:596-621` 块内；窄屏细节如需追加可放 `@media (max-width: 420px)`，`styles.css:623-629`）
  - 具体改动：900px 以下区域随 `.app-header` 的 `padding: 14px 12px 10px` 对齐；`.recent-tags` 允许换行（`flex-wrap: wrap`）并允许收缩（`min-width: 0`）；必要时在 420px 以下将 `.recent-search { gap: 6px; }`、`.recent-tag { font-size: 12px; padding: 5px 12px; }`，禁止出现横向滚动
  - 验收步骤：375×812 与 420px 视口下，标签换行显示、无横向滚动条、清空按钮不被裁切；与筛选栏、搜索栏左右边界对齐

## 6. 与"餐厅收藏"的协作边界

### 6.1 存储隔离核对

- [ ] 核验两功能存储完全独立（前置依赖：1.1、1.3、1.4）
  - 涉及文件：`app.js`（仅核验，不改代码）
  - 验收步骤：最近搜索仅读写 `campus-food-recent-searches:v1`，收藏仅读写 `campus-food-favorites:v1`；把收藏 key 写成非法 JSON 后刷新，最近搜索区域正常；把最近搜索 key 写成非法 JSON 后刷新，收藏图标与面板正常；两处 `read*` / `write*` 函数互不调用

### 6.2 共享设施与事件/视图边界核对

- [ ] 核验 toast 单实现、state 字段与事件边界（前置依赖：4.1、4.2）
  - 涉及文件：`app.js`、`index.html`、`styles.css`（仅核验，不改代码）
  - 验收步骤：
    1. 全项目 `showToast` 定义与 `id="toast"` 容器各仅一处（收藏已落地时不重复定义）
    2. `state.favorites` 与 `state.recentSearches` 相邻声明、互不写入
    3. 最近搜索只监听 `#searchForm` 与 `#recentSearch`；不触碰 `renderList` / `markCards` / `renderFavorites` / `.fav-btn`
    4. CSS 命名空间为 `.recent-*`，与 `.fav-*`、`.favorites-*`、`.toast` 无冲突

## 7. 回归与验收

### 7.1 回归既有功能

- [ ] 验证最近搜索改动未破坏既有交互（前置依赖：第 1–6 组全部完成）
  - 涉及文件：`index.html`、`styles.css`、`app.js`（仅核验，不改代码）
  - 验证步骤：
    1. 项目根目录执行 `python -m http.server 8000`，访问 `http://localhost:8000/`
    2. 搜索关键词后列表、结果计数、红点数量与改动前一致；示例模式下 `applyMockData('', …)` 行为不变
    3. 切换价格/口味筛选、切换排序，列表与地图正常
    4. 点击卡片空白区选中并联动地图；"去这里/展开路线"按钮、本地示意图拖动/缩放/`+ − ◎` 正常；配置高德 Key 时 AMap 标记与 InfoWindow 正常
    5. 页面加载自动搜索（`locateAndSearch`）不产生记录；控制台无新增报错

### 7.2 最近搜索专项手工验收

- [ ] 按交互路径逐项手工验证（前置依赖：7.1）
  - 验证步骤：
    1. 首访无记录 → 区域不可见、无空白行
    2. 搜索"川菜" → 区域出现且含"川菜"、位于搜索框正下方
    3. 依次搜索"日料""奶茶" → 顺序"奶茶、日料、川菜"
    4. 重复搜索"川菜" → 该词到首位、总数仍为 3
    5. 连续搜索 9 个不同关键词 → 仅保留最近 8 个、最旧一条消失
    6. 输入空格提交 → 区域与顺序不变
    7. 仅切换筛选/排序 → 区域不变、无存储写入
    8. F5 刷新 → 内容与顺序一致
    9. 点击"日料" → 输入框回填、结果刷新、"日料"到首位
    10. 点击"清空" → 区域消失、出现"已清空最近搜索"、刷新后仍为空
    11. 伪造脏数据（`not-json` / `{"a":1}` / `[""]`）后刷新 → 不报错、搜索与筛选正常
    12. 搜索含 `<`、`"`、`&` 的关键词 → 标签文本正常、DOM 未破坏
    13. 375×812 与 420px 视口 → 无横向滚动、区域对齐正常

### 7.3 12 条验收对照

- [ ] 逐条对照 `recent-search/spec.md` 验收标准完成核验（前置依赖：7.2）
  - 对照方式：按 spec 顺序编号 1–12，逐条记录"通过/不通过"，不通过项回到对应任务（1.x–5.x）修正后重跑本节
  - 验收步骤：使用 8.x 交付验收清单逐条打勾，作为本节的最终结论

## 8. 交付验收清单（对应 `recent-search/spec.md` 12 条标准）

- [ ] **标准 1**：提交非空关键词（如"川菜"）并完成搜索后，搜索框下方出现"最近搜索"区域并包含"川菜"
  - 验证：区域位于 `#searchForm` 与 `#filterBar` 之间；`#recentTags` 内含文本为"川菜"的 `.recent-tag`
- [ ] **标准 2**：依次搜索"川菜"→"日料"→"奶茶"，区域顺序为"奶茶、日料、川菜"
  - 验证：读取 `state.recentSearches` 与 DOM 标签顺序一致，首个为"奶茶"
- [ ] **标准 3**：重复搜索已记录关键词时，记录总数不变且该关键词移至首位
  - 验证：重复搜索后 `state.recentSearches.length` 不变，目标词索引为 0
- [ ] **标准 4**：累计搜索超过 8 个不同关键词时，仅保留最近 8 个，最久未使用的一条被移除
  - 验证：第 9 个不同词进入后数组长度为 8，最早词不再出现于 DOM 与 localStorage
- [ ] **标准 5**：提交空关键词或仅含空白字符时不新增记录，原有记录与顺序保持不变
  - 验证：提交 `''` / `'   '` / 全角空格后 DOM 与 localStorage 值均未变化
- [ ] **标准 6**：仅切换价格筛选、口味筛选或排序方式时，不产生任何最近搜索记录
  - 验证：连续切换后 `state.recentSearches` 与存储值不变，DevTools 中无 `setItem` 调用
- [ ] **标准 7**：刷新页面或重新打开页面后，最近搜索区域的内容与顺序与刷新前一致
  - 验证：F5 与新标签页打开均按 `campus-food-recent-searches:v1` 恢复，顺序一致
- [ ] **标准 8**：点击某个最近搜索条目时，搜索框回填该关键词、立即触发搜索并展示结果，该条目同时移至首位
  - 验证：`#searchInput.value` 等于该关键词；结果列表与计数刷新；该词索引变为 0
- [ ] **标准 9**：不存在任何记录时，页面不展示"最近搜索"区域，且无占位空白或布局跳动
  - 验证：`#recentSearch.hidden === true`、区域高度为 0，筛选栏纵向位置与改动前一致
- [ ] **标准 10**：点击"清空"后区域消失、刷新后仍为空，并出现"已清空最近搜索"提示
  - 验证：区域 `hidden`、`showToast` 文案逐字符匹配、localStorage 值为 `"[]"`、刷新后仍隐藏
- [ ] **标准 11**：本地存储损坏或被写入非法结构时，页面不报错，搜索与筛选等既有功能仍正常工作
  - 验证：写入 `not-json`、`{"a":1}`、`[""]` 等后刷新，Console 无异常，搜索/筛选/排序/地图均正常
- [ ] **标准 12**：未引入任何后端接口、构建步骤或第三方依赖，最近搜索数据仅保存在本地浏览器
  - 验证：改动仅涉及 `index.html`、`styles.css`、`app.js`；无新增 `fetch`/`XMLHttpRequest`；无新增文件与依赖声明；Network 面板无新增请求
## 9. 第 3 轮：规范约束增强

### 9.1 Validator：关键词与 ID 校验

- [ ] 关键词提交前校验类型与非空（前置依赖：第 1–8 组完成）
  - 涉及文件：`app.js`
  - 具体改动：`handleSearchSubmit` 与环境入口对 `rawValue` 统一 `String(...).trim()`；无效值不记录、不写库
  - 验收步骤：提交 `''`、`'   '`、全角空格 → `state.recentSearches` 与 localStorage 不变；`README` 中餐厅 ID 校验由收藏功能 `validateRestaurantId` 负责

### 9.2 XSSFilter：关键词写入前过滤与读取清洗

- [ ] 接入 `xssFilter(value): string`（前置依赖：9.1）
  - 涉及文件：`app.js`
  - 具体改动：
    - `rememberSearchKeyword`：记录前过滤，过滤后为空则不记录
    - `writeRecentSearches`：写入前逐条过滤并截断 50 字符
    - `readRecentSearches`：读取时逐条过滤并截断 50 字符，去重口径不变
    - `renderRecentSearches`：继续使用 `esc()` 输出纯文本
  - 验收步骤：搜索 `<img src=x onerror=alert(1)>` → 标签不进入 localStorage、标签文本安全显示；脏数据 `["<script>alert(1)</script>","正常词"]` 刷新后被清洗，正常词保留

### 9.3 ES6 / JSDoc 重构

- [ ] 最近搜索相关函数全面 ES6 化并补 JSDoc（前置依赖：9.1、9.2）
  - 涉及文件：`app.js`
  - 具体改动：`const`/`let`、箭头函数、模板字符串；`readRecentSearches` / `writeRecentSearches` / `rememberSearchKeyword` / `clearRecentSearches` / `renderRecentSearches` / `handleSearchSubmit` / `xssFilter` / `validateRestaurantId` 均带 JSDoc
  - 验收步骤：全文检索最近搜索区块无 `var `；每个函数前均有 `/** ... */`

### 9.4 回归验收

- [ ] 最近搜索 8 项上限、去重提位、刷新保持、点击复用、清空提示、空态隐藏、移动端布局保持不变（前置依赖：9.1–9.3）
  - 验收步骤：按第 8 组 12 条标准重跑；连续搜索 9 个关键词仍只保留 8 条
- [ ] 与收藏功能存储隔离
  - 验收步骤：把 `campus-food-favorites:v1` 写成非法 JSON 后刷新，最近搜索正常；反之亦然
- [ ] 文档一致性：spec 第 3 轮约束与本节任务一一对应
  - 验收步骤：Validator、XSSFilter、ES6/JSDoc、回归四类均有任务与验收步骤