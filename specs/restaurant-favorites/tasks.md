# 编码任务规划：餐厅收藏

> 需求基线：`.codeartsdoer/specs/restaurant-favorites/spec.md`（唯一依据）
> 实现约束：零依赖原生实现（纯 HTML/CSS/JS，无构建工具、无外部 UI 框架）；沿用分离式 `styles.css` 手写布局；文件名小写 kebab-case；代码标识符使用英文。
> 改动范围：仅 `index.html`、`styles.css`、`app.js` 三个既有文件，不新增构建配置与第三方依赖。

## 1. 收藏数据层（localStorage 持久化底座）

### 1.1 定义收藏数据契约与存储常量

- [ ] 在 `app.js` 的 IIFE 顶部常量区新增 `FAVORITES_STORAGE_KEY = 'campus-food-favorites:v1'` 与 `FAVORITES_LIMIT = 20`
  - 涉及文件：`app.js`（常量声明区，紧随 `AMAP_READY_TIMEOUT` 之后）
  - 具体改动：新增两个常量，`FAVORITES_LIMIT` 作为唯一的上限数值来源，供写入与提示复用，禁止在别处硬编码 20
  - 验收：全局搜索 `20`，除 `FAVORITES_LIMIT` 定义处与文案字符串外无其它上限硬编码

### 1.2 在 state 中挂载收藏列表

- [ ] 在 `app.js` 的 `state` 对象中新增 `favorites: []`（前置依赖：1.1）
  - 涉及文件：`app.js`（`state` 定义，建议置于 `selectedId` 之后）
  - 具体改动：收藏列表按添加时间顺序保存条目快照 `{ id, name, taste, price, lng, lat, address, addedAt }`
  - 说明：`id` 为唯一主键；`name/taste/price/lng/lat/address` 仅作为展示与定位快照，用于刷新后"我的收藏"面板仍能渲染、点击仍能定位；若当前 `state.restaurants` 中存在同 `id` 条目，渲染与定位一律优先使用实时数据
  - 验收：`console.log` 或断点可见 `state.favorites` 初始为数组且不影响既有字段

### 1.3 实现本地读取与写入（含损坏数据清洗）

- [ ] 在 `app.js` 中新增 `readFavorites()` 与 `writeFavorites(list)` 两个函数（前置依赖：1.1、1.2）
  - 涉及文件：`app.js`（新增函数，建议放在工具函数区、`findById` 附近）
  - 具体改动：
    - `readFavorites()`：`localStorage.getItem(FAVORITES_STORAGE_KEY)` → `JSON.parse`，用 `try/catch` 兜底；对结果做清洗：仅保留对象且 `id` 为非空字符串的条目、按 `id` 去重且保留首次出现项、截断到 `FAVORITES_LIMIT` 条；任一步异常或结构不合法时返回空数组并静默 `removeItem` 清理脏数据
    - `writeFavorites(list)`：序列化写入并返回布尔结果；捕获写入异常（配额溢出、隐私模式禁用存储）返回 `false`，不回滚内存态
  - 验收：手工在控制台写入 `localStorage.setItem('campus-food-favorites:v1','not-json')` 后刷新页面不报错、面板正常显示空态

### 1.4 启动时装载收藏并接入初始化顺序

- [ ] 在 `boot()` 中于 `renderList()` 之前装载收藏数据（前置依赖：1.3）
  - 涉及文件：`app.js`（`boot` 函数，`state.restaurants = buildMockRestaurants('')` 之后、`renderAddress()` 之前）
  - 具体改动：`state.favorites = readFavorites();` 并在此后触发一次"我的收藏"面板渲染（渲染函数在第 4 组任务实现，本任务先加调用位与可选容错）
  - 验收：刷新页面时 Network/Console 无异常；收藏数据在列表首次渲染前已就绪，卡片图标首帧即为正确状态

## 2. 全局 Toast 提示能力

### 2.1 新增 toast 容器与样式

- [ ] 在 `index.html` 的 `</body>` 前新增全局提示容器，并在 `styles.css` 中补齐样式
  - 涉及文件：`index.html`、`styles.css`
  - 具体改动：
    - `index.html`：在三个 `<script>` 之前插入 `<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true" hidden></div>`
    - `styles.css`：新增 `.toast` 固定定位（页面底部居中，`position: fixed` + `z-index` 高于地图与面板）、深色半透明底、圆角、单行居中、`opacity/transform` 过渡；新增 `.toast.is-visible` 显示态、`.toast.is-error` 失败态配色（复用 `--warn` 系列色值）
    - 移动端（`max-width: 900px`）追加 `.toast` 宽度自适应、左右留白，避免被地图遮挡
  - 验收：手动在控制台 `document.getElementById('toast').hidden=false;` 可见提示条位于视口底部且不遮挡收藏面板

### 2.2 实现 showToast 函数

- [ ] 在 `app.js` 中新增 `showToast(message, type)`（前置依赖：2.1）
  - 涉及文件：`app.js`（`cacheDom` 追加 `dom.toast = document.getElementById('toast')`；新增 `showToast` 函数）
  - 具体改动：写入文案 → 清除 `hidden` → 下一帧追加 `is-visible`（保证过渡生效）→ `type === 'error'` 时追加 `is-error` 否则移除 → 用模块级 `toastTimer` 记录定时器，每次调用前 `clearTimeout` 后重新计时（普通提示 2000ms，错误提示 2600ms）→ 到时移除 `is-visible` 并在过渡结束后 `hidden = true`、清空 `textContent`
  - 验收：连续快速触发 3 次提示，最终只显示最后一条且按时消失；提示出现时 `aria-live` 可被读屏捕获

### 2.3 固定提示文案常量

- [ ] 在 `app.js` 中集中定义收藏相关文案，保证与 spec 逐字一致（前置依赖：2.2）
  - 涉及文件：`app.js`（常量区新增 `FAVORITE_TOAST` 对象）
  - 具体改动：`added: '已添加收藏'`、`removed: '已取消收藏'`、`failed: '操作失败，请重试'`、`full: '收藏夹已满（最多20家）'`
  - 验收：三处成功/失败文案与 spec 输出段落逐字符一致（含中文逗号与全角括号）

## 3. 餐厅卡片收藏图标（空心/实心两态）

### 3.1 在卡片模板中渲染收藏按钮

- [ ] 修改 `renderList()` 的卡片 HTML 模板，加入收藏图标节点（前置依赖：1.4）
  - 涉及文件：`app.js`（`renderList` 函数内的 `map` 回调）
  - 具体改动：
    - 在 `.card-top` 内、`.card-score` 之后插入 `<button class="fav-btn" type="button" data-id="…" aria-pressed="true|false" aria-label="取消收藏|收藏">` 
    - 图标按收藏态输出实心 `♥`（已收藏）或空心 `♡`（未收藏），由 `isFavorite(item.id)` 判定
    - 已收藏时按钮追加 `is-active` 类，供 CSS 着色
    - 按钮不参与卡片 `tabindex` 语义冲突：保留卡片原 `tabindex="0"`，按钮自身自然可聚焦
  - 验收：搜索/筛选/排序后重渲染，图标态与 `state.favorites` 保持一致，不出现图标丢失或错位

### 3.2 新增 isFavorite 判定函数

- [ ] 在 `app.js` 中新增 `isFavorite(id)` 与 `findFavorite(id)`（前置依赖：1.2）
  - 涉及文件：`app.js`（与 `findById` 相邻）
  - 具体改动：按 `id` 在 `state.favorites` 中线性查找，返回布尔值或条目对象；所有图标态、面板高亮、去重判断统一走该函数，避免多处重复实现
  - 验收：控制台调用 `isFavorite('mock-01')` 与收藏态一致

### 3.3 绑定收藏按钮点击并隔离卡片选中

- [ ] 在 `cardList` 的事件委托中拦截 `.fav-btn` 点击（前置依赖：3.1、3.2、2.3）
  - 涉及文件：`app.js`（`bindEvents` 中 `dom.cardList` 的 `click` 与 `keydown` 监听）
  - 具体改动：
    - 在既有 `click` 委托的最前面判断 `event.target.closest('.fav-btn')`：命中则 `event.preventDefault()`、`event.stopPropagation()`，读取 `data-id`，按当前收藏态决定 `action`（已收藏→`remove`，未收藏→`add`），调用收藏切换入口（第 6 组任务实现 `toggleFavorite`），然后 `return`，确保不触发 `selectRestaurant`
    - 在既有 `keydown` 委托中同样排除 `.fav-btn`：键盘 Enter/空格聚焦在收藏按钮上时交由按钮原生 click 处理，禁止同时选中卡片
  - 验收：点击图标后地图不跳转、卡片不进入 `is-active`；点击卡片空白区域仍能正常选中并联动地图

### 3.4 收藏图标两态样式

- [ ] 在 `styles.css` 中新增 `.fav-btn` 系列样式（前置依赖：3.1）
  - 涉及文件：`styles.css`（卡片样式区，`.card-score` 之后）
  - 具体改动：图标按钮透明底、无边框、`font-size: 15px`、圆形点击热区不小于 28×28px；默认态灰色空心；`.fav-btn.is-active` 使用品牌红实心并带轻微缩放过渡；`hover` 提升对比度；`:focus-visible` 保留可见焦点环；`[hidden]` 规则不受影响
  - 验收：空心/实心两态肉眼可区分；键盘 Tab 可聚焦并显示焦点环；点击热区在移动端可稳定命中

## 4. "我的收藏"面板（右侧、地图下方）

### 4.1 调整页面结构：右侧列容器 + 收藏面板

- [ ] 修改 `index.html` 的 `<main class="layout">` 结构（前置依赖：无，可与第 3 组并行）
  - 涉及文件：`index.html`
  - 具体改动：
    - 将现有 `<section class="panel map-panel">` 整体包入新增的 `<div class="right-column">`，作为右侧列的第 1 个子块
    - 在同一右列内、地图之后新增 `<section class="panel favorites-panel" aria-labelledby="favTitle">`，内含：面板头（`<h2 id="favTitle">我的收藏</h2>` + 计数徽标 `<span class="fav-count" id="favCount">0/20</span>`）、列表 `<ul class="favorite-list" id="favoriteList" aria-live="polite"></ul>`、空态 `<div class="favorites-empty" id="favoritesEmpty">`（主文案"还没有收藏的餐厅"，副文案"点击卡片上的 ♡ 收藏喜欢的店"）
    - 左侧 `list-panel` 保持不变；`<footer class="app-footer">` 位置不变
  - 验收：桌面端右列自上而下为"地图 → 我的收藏"；DOM 顺序与视觉顺序一致，不产生横向滚动

### 4.2 桌面左右分栏布局与面板高度

- [ ] 在 `styles.css` 中为右列与收藏面板补齐布局（前置依赖：4.1）
  - 涉及文件：`styles.css`（`.layout` 之后新增）
  - 具体改动：
    - `.layout` 保持现有两列 `grid-template-columns` 不变（左列表列 + 右列）
    - 新增 `.right-column { display: flex; flex-direction: column; gap: 14px; min-height: 0; }`
    - `.right-column .map-panel { flex: 1 1 auto; min-height: 0; }`，使地图自动吃掉剩余高度
    - `.favorites-panel { flex: 0 0 auto; max-height: 260px; }`，`.favorite-list { overflow-y: auto; }` 独立滚动，不挤压地图
    - 复用既有 `.panel`、`.panel-head`、`.result-meta` 视觉规范，不引入新配色体系
  - 验收：1280×800 视口下左列表与右列等高、地图不被压缩到不可用、收藏列表超出时仅面板内部滚动

### 4.3 收藏面板渲染与空态

- [ ] 在 `app.js` 中新增 `renderFavorites()` 并在数据变更后统一调用（前置依赖：1.4、4.1）
  - 涉及文件：`app.js`（`cacheDom` 追加 `dom.favoriteList`、`dom.favoritesEmpty`、`dom.favCount`；新增 `renderFavorites`）
  - 具体改动：
    - 空列表时清空 `ul`、显示 `#favoritesEmpty`、计数显示 `0/20`
    - 非空时隐藏空态，按 `state.favorites` 顺序渲染 `<li class="favorite-item" data-id="…" tabindex="0" role="button">`，内容含名称、口味标签、人均价格（`price` 为空显示 `—`）；名称与地址等文本一律经 `esc()` 转义
    - 计数显示 `n/20`，满额时计数追加 `.is-full` 类（仅视觉强调，不替代第 6 组的上限拦截）
    - 每一项的 `aria-label` 包含"查看并在地图定位"语义
    - 在 `boot`、收藏增删、以及餐厅数据刷新（`searchPlaces` / fallback 数据重建）之后调用
  - 验收：收藏 2 家后计数为 `2/20`、列表顺序与添加顺序一致；删除后列表即时更新

### 4.4 收藏项点击定位并弹出详情

- [ ] 为 `favoriteList` 绑定事件委托，联动地图与详情（前置依赖：4.3、5.1）
  - 涉及文件：`app.js`（`bindEvents` 新增 `dom.favoriteList` 的 `click` 与 `keydown` 监听）
  - 具体改动：点击/回车/空格命中 `.favorite-item` 时读取 `data-id`，调用统一的定位入口（见 5.1）；阻止默认滚动与冒泡；定位成功后不关闭收藏面板，保持"我的收藏"可见
  - 验收：点击收藏项后地图中心切到该餐厅、红点高亮、详情卡弹出；面板列表不消失

## 5. 收藏定位联动与地图详情

### 5.1 复用既有 selectRestaurant 实现定位

- [ ] 新增 `focusFavorite(id)` 薄封装，复用既有地图选中链路（前置依赖：1.2、4.4）
  - 涉及文件：`app.js`（`selectRestaurant` 之后新增函数）
  - 具体改动：
    - 按 `id` 先 `findById` 取实时数据；取不到时回退 `findFavorite(id)` 的快照，仍取不到则 `showToast(FAVORITE_TOAST.failed, 'error')` 并结束
    - 若该餐厅当前不在可见列表（被关键词/价格/口味过滤掉），先重置 `state.keyword=''`、`state.price='all'`、`state.taste='all'`、同步 `searchInput` 与筛选按钮，再 `applyFilters()`，保证红点与卡片可定位高亮
    - 最后调用既有 `selectRestaurant(id, 'favorites')`；`selectRestaurant` 内部已按 `mapMode` 分别走 `focusLocal + showLocalInfo` 或 `setZoomAndCenter + openAmapInfo`，不新增第二套地图逻辑
  - 验收：在"川菜"筛选下收藏一家粤菜餐厅，点击收藏项后筛选自动回到"全部"，地图定位且详情弹出

### 5.2 收藏增删后同步地图红点与卡片

- [ ] 在收藏状态变更后统一刷新相关视图（前置依赖：5.1）
  - 涉及文件：`app.js`（新增 `refreshFavoriteViews()`）
  - 具体改动：聚合调用 `renderList()`（重算图标态）、`renderFavorites()`（面板与计数）、`markCards()`；不改动 `renderLocalMarkers()` 的既有行为（红点集合仍由筛选结果决定）
  - 验收：新增收藏后卡片图标立即变实心、面板立即出现该餐厅；取消后两者同步回退

## 6. 收藏切换逻辑与边界收敛

### 6.1 实现 toggleFavorite 主流程

- [ ] 在 `app.js` 中新增 `toggleFavorite(id, action)`（前置依赖：1.3、2.3、3.3）
  - 涉及文件：`app.js`（新增函数，建议放在 `focusFavorite` 之后）
  - 具体改动（严格按 spec 输入校验）：
    1. `id` 非字符串或去空格后为空 → `showToast(FAVORITE_TOAST.failed, 'error')`，不写库
    2. `action` 不在 `{ add, remove }` 内 → 同上失败提示
    3. `add` 分支：已收藏（`isFavorite`）→ 幂等返回，不重复写入、不占名额，提示"已添加收藏"；未收藏且 `state.favorites.length >= FAVORITES_LIMIT` → 提示 `FAVORITE_TOAST.full`，数据不变；否则从 `findById(id)` 生成快照（`id/name/taste/price/lng/lat/address/addedAt`）追加到末尾
    4. `remove` 分支：按 `id` 过滤移除，不做上限校验
    5. 写入：`writeFavorites(state.favorites)` 返回 `false` → 回滚内存态到操作前快照并提示"操作失败，请重试"
    6. 成功后：`refreshFavoriteViews()` + 对应成功提示（add→"已添加收藏"，remove→"已取消收藏"）
  - 验收：`add` 超 20 家时第 21 家数据不进列表、提示为"收藏夹已满（最多20家）"；同一家连续点两次 `add` 数量不变

### 6.2 去重与顺序稳定性

- [ ] 收口去重规则，保证顺序可预测（前置依赖：6.1）
  - 涉及文件：`app.js`（`toggleFavorite` 与 `readFavorites`）
  - 具体改动：写入前用 `id` 唯一性断言；读取清洗时按首次出现顺序保留；`addedAt` 使用 `Date.now()` 仅作调试字段，渲染顺序始终以数组顺序为准，不依赖 `addedAt` 排序
  - 验收：手工在 localStorage 中放入重复 id 的两条数据，刷新后仅保留一条且计数正确

### 6.3 存储不可用降级

- [ ] 补齐 localStorage 异常时的用户可见行为（前置依赖：6.1）
  - 涉及文件：`app.js`（`readFavorites` / `writeFavorites` 调用处）
  - 具体改动：读取异常按空收藏处理且不打断启动；写入异常（`QuotaExceededError`、隐私模式、被禁用）走回滚 + "操作失败，请重试"，并且不抛未捕获异常
  - 验收：浏览器禁用站点数据后点击收藏，页面不崩、提示失败文案、卡片图标不误亮

## 7. 移动端堆叠与响应式

### 7.1 移动端堆叠顺序

- [ ] 调整 `@media (max-width: 900px)` 下右列与收藏面板的排布（前置依赖：4.2）
  - 涉及文件：`styles.css`（既有 `@media (max-width: 900px)` 块内）
  - 具体改动：`.right-column { display: contents; }` 使地图与收藏面板直接参与 `.layout` 的纵向排列；既有 `.layout` 为 `flex-direction: column-reverse`（`styles.css:605-610`），仅展开 `display: contents` 时的视觉顺序会是"我的收藏 → 地图 → 推荐结果"，因此必须同步补充 `order`（依据 `design.md` 2.4.3「移动端顺序修正」）：`.right-column .map-panel { order: 2; height: 296px; }`（高度保持既有值）、`.favorites-panel { order: 1; max-height: 220px; height: auto; }`，`list-panel` 保持默认 `order: 0`；主轴自底向上为 `list → favorites → map`，视觉自上而下即为"地图 → 我的收藏 → 推荐结果"
  - 修订说明（对齐 `design.md` 2.4.3）：本条原文只写 `display: contents` + `column-reverse`，与下方验收目标"地图 → 我的收藏 → 推荐列表"相反（实际会变成"我的收藏 → 地图 → 推荐列表"）；按设计文档明示的顺序修正补入 `order` 规则，任务编号、涉及文件与验收目标均不变，其余任务不作改动。
  - 验收：375×812 视口下从上到下依次可见地图、我的收藏、推荐列表，无横向滚动、无元素重叠

### 7.2 窄屏细节

- [ ] 在 `@media (max-width: 420px)` 补齐收藏面板内边距（前置依赖：7.1）
  - 涉及文件：`styles.css`
  - 具体改动：收藏项横向内边距与卡片一致；计数徽标字号缩小一档；toast 左右安全边距不小于 12px
  - 验收：420px 视口下收藏项文字不溢出、单行省略生效

## 8. 回归与验收

### 8.1 回归既有功能

- [ ] 验证收藏改动未破坏既有交互（前置依赖：第 1–7 组全部完成）
  - 涉及文件：`index.html`、`styles.css`、`app.js`
  - 具体改动：仅核验，不改代码
  - 验证步骤：
    1. 静态服务器启动后，搜索关键词、切换价格/口味筛选、切换排序，列表与结果计数正常
    2. 点击卡片空白区，地图定位与详情卡正常；"去这里/展开路线"按钮仍可用
    3. 本地示意图拖动、滚轮缩放、`+ / − / ◎` 按钮正常；有高德 Key 时 AMap 标记与 InfoWindow 正常
    4. 点击收藏图标不触发卡片选中、不触发地图跳转

### 8.2 收藏专项手工验收

- [ ] 按 6 条 spec 验收标准逐条手工验证（前置依赖：8.1）
  - 启动方式：项目根目录执行 `python -m http.server 8000`，浏览器访问 `http://localhost:8000/`（未配置高德 Key 时自动使用示例数据，全部交互可验证）
  - 验证步骤：
    1. **图标两态**：卡片右上出现 `♡`；收藏后变实心 `♥`，取消后回 `♡`
    2. **添加/取消**：点击 `♡` → 图标变实心 + toast"已添加收藏"；再点 → 变空心 + toast"已取消收藏"
    3. **刷新保持**：收藏 3 家后按 F5，卡片图标仍为实心，"我的收藏"仍列 3 家、计数 `3/20`
    4. **上限提示**：连续收藏至 20 家，再收藏第 21 家 → toast"收藏夹已满（最多20家）"，图标保持空心、计数停在 `20/20`
    5. **面板列表**：名称、口味、人均与卡片一致；删除后该项立即消失；清空后展示空态文案
    6. **点击定位**：点击任一收藏项 → 地图中心平移到该餐厅、红点高亮、详情卡弹出（桌面与移动端各验一次）
    7. **异常路径**：浏览器控制台执行 `localStorage.setItem('campus-food-favorites:v1','{{{')` 后刷新 → 不报错、收藏为空态；连续快速点击收藏图标 → 只出现最后一次 toast，无并发错乱

## 9. 交付验收清单（对应 spec.md 6 条标准）

- [ ] **标准 1**：每个餐厅卡片上显示收藏图标（空心/实心）
  - 验证：加载页面后所有卡片均含 `.fav-btn`；未收藏为 `♡`、已收藏为 `♥`；筛选/排序/搜索重渲染后图标态不丢失
- [ ] **标准 2**：点击图标可正常添加/取消收藏
  - 验证：单次点击切换图标态并出现对应 toast（"已添加收藏"/"已取消收藏"）；点击图标不触发卡片选中与地图跳转
- [ ] **标准 3**：刷新页面后收藏状态保持
  - 验证：收藏若干后 F5，图标、面板列表、计数三者一致；localStorage 中 `campus-food-favorites:v1` 条目数与计数相同
- [ ] **标准 4**：收藏超过 20 家时提示上限
  - 验证：第 21 家被拦截，提示"收藏夹已满（最多20家）"，数据不写入、计数不增长；删除一家后可再次收藏成功
- [ ] **标准 5**："我的收藏"面板正确显示列表
  - 验证：面板位于地图下方；条目名称/口味/人均正确；空态文案正常；超过面板高度时内部滚动
- [ ] **标准 6**：点击收藏列表餐厅，地图定位并弹出详情
  - 验证：点击收藏项后地图平移到该坐标、对应红点高亮、详情卡出现；在筛选状态下点击会自动复位筛选以完成定位
## 10. 第 3 轮：规范约束增强

### 10.1 Validator：餐厅 ID 校验

- [ ] 新增 `validateRestaurantId(value): boolean`（前置依赖：第 1–9 组完成）
  - 涉及文件：`app.js`
  - 具体改动：`typeof value === 'string' && value.trim().length > 0`；函数带 JSDoc
  - 调用点：`toggleFavorite` 入口、`focusFavorite` 入口
  - 验收步骤：传入 `null`、`undefined`、数字、空串、纯空白串 → 返回 `false`，不写 localStorage、不改 `state.favorites`、不改 UI、不弹成功提示，控制台 `console.warn`；传入 `'mock-01'` → 返回 `true`

### 10.2 XSSFilter：写入前过滤与读取清洗

- [ ] 新增 `xssFilter(value): string`（前置依赖：10.1）
  - 涉及文件：`app.js`
  - 具体改动：去除 `script/iframe/svg` 等标签、通用 HTML 标签、`javascript:/vbscript:/data:` 协议与 `on*=` 属性；函数带 JSDoc
  - 接入点：
    - `writeFavorites`：写入前对 `id/name/taste/address` 过滤并剔除非法 id
    - `readFavorites`：读取时对同名字段过滤，`id` 经 `validateRestaurantId` 校验
    - `toggleFavorite`：生成快照时过滤字段
    - `normalizePoi`：对高德返回的 `name/address` 过滤
  - 验收步骤：收藏名称含 `<script>alert(1)</script>` 的餐厅 → localStorage 中不含该标签；手工写入含标签的收藏 JSON 后刷新 → 面板显示纯文本、无脚本执行；正常中文与标点保持不变

### 10.3 ES6 / JSDoc 重构

- [ ] 将 `app.js` 全面重构为 ES6 风格（前置依赖：10.1、10.2）
  - 涉及文件：`app.js`（必要时同步 `index.html`、`styles.css`）
  - 具体改动：
    - `var` 全部替换为 `const`/`let`；回调改为箭头函数；字符串拼接改为模板字符串
    - 每个函数（含嵌套函数）添加 JSDoc，覆盖功能、`@param`、`@returns`
    - 变量与函数保持小驼峰 camelCase，常量全大写
    - 事件绑定统一 `addEventListener`，移除任何 `on*` 属性监听
  - 验收步骤：全文检索无 `var `、无 `onclick=`、无未注释的顶层函数；功能回归全部通过

### 10.4 回归验收

- [ ] 收藏 20 家上限、刷新持久化、卡片 ♡/♥ 两态、面板计数、地图联动、移动端布局保持不变（前置依赖：10.1–10.3）
  - 验收步骤：按第 9 组 6 条标准重跑；收藏第 21 家仍提示“收藏夹已满（最多20家）”；F5 后收藏与图标一致
- [ ] 事件与渲染回归：点击收藏图标不触发卡片选中；收藏项点击仍复位筛选并定位
  - 验收步骤：桌面与 375×812 各验一次
- [ ] 文档一致性：spec 第 3 轮约束与本节任务一一对应
  - 验收步骤：Validator、XSSFilter、ES6/JSDoc、回归四类均有任务与验收步骤