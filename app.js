(function () {
  'use strict';

  const MOCK = window.MOCK_DATA || {};
  const MOCK_LOCATION = MOCK.location || { lng: 116.3106, lat: 39.9929, address: '示例位置', city: '' };
  const MOCK_RESTAURANTS = Array.isArray(MOCK.restaurants) ? MOCK.restaurants : [];
  const CONFIG = window.APP_CONFIG || {};
  const KEY = String(CONFIG.amapKey || '').trim();
  const REST = 'https://restapi.amap.com/v3';
  const BASE_SPAN_LNG = 0.018;
  const AMAP_READY_TIMEOUT = 6500;
  const FAVORITES_STORAGE_KEY = 'campus-food-favorites:v1';
  const FAVORITES_LIMIT = 20;
  const FAVORITE_TOAST = {
    added: '已添加收藏',
    removed: '已取消收藏',
    failed: '操作失败，请重试',
    full: '收藏夹已满（最多20家）'
  };
  const RECENT_SEARCH_STORAGE_KEY = 'campus-food-recent-searches:v1';
  const RECENT_SEARCH_LIMIT = 8;
  const RECENT_SEARCH_MAX_LENGTH = 50;
  const RECENT_SEARCH_TOAST = { cleared: '已清空最近搜索' };
  let toastTimer = null;

  const dom = {};

  const state = {
    center: { lng: MOCK_LOCATION.lng, lat: MOCK_LOCATION.lat },
    city: MOCK_LOCATION.city || '',
    address: MOCK_LOCATION.address || '示例位置',
    addressSub: '示例位置 · 未获取真实定位',
    isMockLocation: true,
    restaurants: [],
    isMockData: true,
    sort: 'distance',
    keyword: '',
    price: 'all',
    taste: 'all',
    selectedId: null,
    favorites: [],
    recentSearches: [],
    route: {
      id: null,
      status: 'idle',
      expanded: false,
      distance: 0,
      minutes: 0,
      steps: [],
      desc: '',
      sourceText: '',
      note: ''
    },
    useMockData: true,
    mapMode: 'local',
    amap: null,
    amapMarkers: [],
    amapInfo: null,
    markerBatchToken: 0,
    local: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      startX: 0,
      startY: 0,
      baseX: 0,
      baseY: 0,
      moved: false
    }
  };

  const TASTE_RULES = [
    { taste: '川菜', keys: ['川菜', '湘菜', '火锅', '麻辣', '酸菜鱼'] },
    { taste: '粤菜', keys: ['粤菜', '烧腊', '港式', '潮汕', '粥'] },
    { taste: '日料', keys: ['日料', '日本', '寿司', '拉面', '居酒屋'] },
    { taste: '西餐', keys: ['西餐', '披萨', '牛排', '意面', '烘焙', '甜品'] },
    { taste: '奶茶', keys: ['奶茶', '茶饮', '饮品', '咖啡', '水果茶'] },
    { taste: '小吃', keys: ['小吃', '快餐', '面馆', '米线', '包子', '饺子', '烧烤', '麻辣烫', '煎饼'] }
  ];

  const PRICE_GUESS = { 川菜: 55, 粤菜: 48, 日料: 65, 西餐: 75, 奶茶: 18, 小吃: 25 };

  document.addEventListener('DOMContentLoaded', boot);

  /**
   * 清洗字符串中的潜在 XSS 内容，去除标签与危险协议，保留正常中英文文本。
   * @param {*} value - 待清洗的原始值
   * @returns {string} 清洗后的安全字符串
   */
  function xssFilter(value) {
    if (value == null) return '';
    return String(value)
      .replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta|svg|math)[^>]*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/(javascript|vbscript|data)\s*:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
  }

  /**
   * 校验餐厅 ID 是否为非空字符串。
   * @param {*} value - 待校验的餐厅 ID
   * @returns {boolean} 合法返回 true，否则返回 false
   */
  function validateRestaurantId(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * 应用启动入口：缓存 DOM、装载本地数据并初始化视图与地图。
   * @returns {void}
   */
  function boot() {
    cacheDom();
    if (!dom.cardList || !dom.localMap) return;
    state.restaurants = buildMockRestaurants('');
    state.favorites = readFavorites();
    state.recentSearches = readRecentSearches();
    renderAddress();
    renderRecentSearches();
    renderList();
    renderFavorites();
    renderLocalMarkers();
    renderMeta();
    setMapBadge('本地示意地图', true);
    syncFilterButtons();
    bindEvents();
    locateAndSearch();
    tryAmap();
  }

  /**
   * 缓存页面中需要频繁访问的 DOM 节点。
   * @returns {void}
   */
  function cacheDom() {
    dom.addressText = document.getElementById('addressText');
    dom.addressSub = document.getElementById('addressSub');
    dom.addressBadge = document.getElementById('addressBadge');
    dom.searchForm = document.getElementById('searchForm');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchBtn = document.getElementById('searchBtn');
    dom.filterBar = document.getElementById('filterBar');
    dom.resultMeta = document.getElementById('resultMeta');
    dom.sortDistance = document.getElementById('sortDistance');
    dom.sortRating = document.getElementById('sortRating');
    dom.cardList = document.getElementById('cardList');
    dom.emptyState = document.getElementById('emptyState');
    dom.skeleton = document.getElementById('skeleton');
    dom.notice = document.getElementById('notice');
    dom.mapBadge = document.getElementById('mapBadge');
    dom.amapMap = document.getElementById('amapMap');
    dom.localMap = document.getElementById('localMap');
    dom.localPlane = document.getElementById('localPlane');
    dom.localMarkers = document.getElementById('localMarkers');
    dom.localInfo = document.getElementById('localInfo');
    dom.mapTip = document.getElementById('mapTip');
    dom.mapLoading = document.getElementById('mapLoading');
    dom.zoomIn = document.getElementById('zoomIn');
    dom.zoomOut = document.getElementById('zoomOut');
    dom.zoomReset = document.getElementById('zoomReset');
    dom.toast = document.getElementById('toast');
    dom.favoriteList = document.getElementById('favoriteList');
    dom.favoritesEmpty = document.getElementById('favoritesEmpty');
    dom.favCount = document.getElementById('favCount');
    dom.recentSearch = document.getElementById('recentSearch');
    dom.recentTags = document.getElementById('recentTags');
    dom.recentClear = document.getElementById('recentClear');
  }

  /**
   * 绑定页面全部事件监听（统一使用 addEventListener）。
   * @returns {void}
   */
  function bindEvents() {
    dom.searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSearchSubmit(dom.searchInput.value);
    });

    if (dom.recentSearch) {
      dom.recentSearch.addEventListener('click', (event) => {
        if (event.target.closest('#recentClear')) {
          clearRecentSearches();
          return;
        }
        const tag = event.target.closest('.recent-tag');
        if (!tag) return;
        const keyword = tag.getAttribute('data-keyword');
        dom.searchInput.value = keyword;
        handleSearchSubmit(keyword);
      });
    }

    dom.filterBar.addEventListener('click', (event) => {
      const priceBtn = event.target.closest('[data-price]');
      if (priceBtn) {
        state.price = priceBtn.getAttribute('data-price');
        syncFilterButtons();
        applyFilters();
        return;
      }
      const tasteBtn = event.target.closest('[data-taste]');
      if (tasteBtn) {
        state.taste = tasteBtn.getAttribute('data-taste');
        syncFilterButtons();
        applyFilters();
      }
    });

    document.addEventListener('click', (event) => {
      const routeBtn = event.target.closest('.route-btn');
      if (routeBtn) {
        event.preventDefault();
        handleRouteClick(routeBtn.getAttribute('data-id'));
      }
    });

    dom.sortDistance.addEventListener('click', () => setSort('distance'));
    dom.sortRating.addEventListener('click', () => setSort('rating'));

    dom.cardList.addEventListener('click', (event) => {
      const favBtn = event.target.closest('.fav-btn');
      if (favBtn) {
        event.preventDefault();
        event.stopPropagation();
        const favId = favBtn.getAttribute('data-id');
        toggleFavorite(favId, isFavorite(favId) ? 'remove' : 'add');
        return;
      }
      const card = event.target.closest('.card');
      if (card) selectRestaurant(card.getAttribute('data-id'), 'list');
    });

    dom.cardList.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.fav-btn')) return;
      const card = event.target.closest('.card');
      if (!card) return;
      event.preventDefault();
      selectRestaurant(card.getAttribute('data-id'), 'list');
    });

    if (dom.favoriteList) {
      dom.favoriteList.addEventListener('click', (event) => {
        const row = event.target.closest('.favorite-item');
        if (!row) return;
        event.preventDefault();
        focusFavorite(row.getAttribute('data-id'));
      });

      dom.favoriteList.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('.favorite-item');
        if (!row) return;
        event.preventDefault();
        focusFavorite(row.getAttribute('data-id'));
      });
    }

    dom.localInfo.addEventListener('click', (event) => {
      if (event.target.closest('.info-close')) {
        state.selectedId = null;
        resetRoute();
        hideLocalInfo();
        markCards();
        updateLocalMarkerState();
      }
    });

    dom.localMap.addEventListener('pointerdown', onPointerDown);
    dom.localMap.addEventListener('pointermove', onPointerMove);
    dom.localMap.addEventListener('pointerup', onPointerUp);
    dom.localMap.addEventListener('pointercancel', onPointerUp);
    dom.localMap.addEventListener('wheel', onWheel, { passive: false });

    dom.zoomIn.addEventListener('click', (event) => {
      event.stopPropagation();
      setZoom(state.local.zoom * 1.2);
    });
    dom.zoomOut.addEventListener('click', (event) => {
      event.stopPropagation();
      setZoom(state.local.zoom / 1.2);
    });
    dom.zoomReset.addEventListener('click', (event) => {
      event.stopPropagation();
      state.local.zoom = 1;
      state.local.offsetX = 0;
      state.local.offsetY = 0;
      applyLocalTransform();
    });

    window.addEventListener('resize', () => {
      if (state.mapMode === 'local') renderLocalMarkers();
    });
  }

  /**
   * 同步筛选按钮的选中样式。
   * @returns {void}
   */
  function syncFilterButtons() {
    if (!dom.filterBar) return;
    const priceButtons = dom.filterBar.querySelectorAll('[data-price]');
    for (let i = 0; i < priceButtons.length; i++) {
      priceButtons[i].classList.toggle('is-active', priceButtons[i].getAttribute('data-price') === state.price);
    }
    const tasteButtons = dom.filterBar.querySelectorAll('[data-taste]');
    for (let j = 0; j < tasteButtons.length; j++) {
      tasteButtons[j].classList.toggle('is-active', tasteButtons[j].getAttribute('data-taste') === state.taste);
    }
  }

  /**
   * 判断餐厅是否符合当前价格筛选。
   * @param {Object} item - 餐厅对象
   * @returns {boolean} 符合返回 true
   */
  function matchPrice(item) {
    if (state.price === 'low') return item.price != null && item.price < 30;
    if (state.price === 'mid') return item.price != null && item.price >= 30 && item.price <= 80;
    if (state.price === 'high') return item.price != null && item.price > 80;
    return true;
  }

  /**
   * 判断餐厅是否符合当前口味筛选。
   * @param {Object} item - 餐厅对象
   * @returns {boolean} 符合返回 true
   */
  function matchTaste(item) {
    return state.taste === 'all' || item.taste === state.taste;
  }

  /**
   * 应用筛选并刷新列表、计数与地图标记。
   * @returns {void}
   */
  function applyFilters() {
    const list = sortedList();
    let visible = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === state.selectedId) visible = true;
    }
    if (!visible && state.selectedId) {
      state.selectedId = null;
      resetRoute();
      hideLocalInfo();
      if (state.amapInfo) state.amapInfo.close();
      updateLocalMarkerState();
    }
    renderList();
    renderMeta();
    renderLocalMarkers();
    if (state.mapMode === 'amap') renderAMapMarkers();
  }

  /**
   * 切换排序方式并刷新视图。
   * @param {string} sort - 排序方式，distance 或 rating
   * @returns {void}
   */
  function setSort(sort) {
    if (state.sort === sort) return;
    state.sort = sort;
    dom.sortDistance.classList.toggle('is-active', sort === 'distance');
    dom.sortRating.classList.toggle('is-active', sort === 'rating');
    dom.sortDistance.setAttribute('aria-pressed', String(sort === 'distance'));
    dom.sortRating.setAttribute('aria-pressed', String(sort === 'rating'));
    renderList();
    renderLocalMarkers();
    if (state.mapMode === 'amap') renderAMapMarkers();
  }

  /**
   * 切换搜索按钮的忙碌状态。
   * @param {boolean} active - 是否处于搜索中
   * @returns {void}
   */
  function setSearching(active) {
    if (!dom.searchBtn) return;
    dom.searchBtn.disabled = active;
    dom.searchBtn.textContent = active ? '搜索中…' : '搜索';
  }

  /**
   * 显示页面内常驻提示。
   * @param {string} message - 提示文案
   * @returns {void}
   */
  function note(message) {
    if (!dom.notice) return;
    dom.notice.textContent = message;
    dom.notice.hidden = false;
  }

  /**
   * 清除页面内常驻提示。
   * @returns {void}
   */
  function clearNote() {
    if (!dom.notice) return;
    dom.notice.hidden = true;
    dom.notice.textContent = '';
  }

  /**
   * 设置地图状态徽标。
   * @param {string} text - 徽标文案
   * @param {boolean} isLocal - 是否本地示意地图
   * @returns {void}
   */
  function setMapBadge(text, isLocal) {
    if (!dom.mapBadge) return;
    dom.mapBadge.textContent = text;
    dom.mapBadge.classList.toggle('is-local', !!isLocal);
  }

  /**
   * 显示或隐藏地图加载遮罩。
   * @param {boolean} active - 是否显示
   * @returns {void}
   */
  function showMapLoading(active) {
    if (!dom.mapLoading) return;
    dom.mapLoading.classList.toggle('is-visible', !!active);
    dom.mapLoading.hidden = !active;
  }

  /**
   * 刷新地址栏展示。
   * @returns {void}
   */
  function renderAddress() {
    dom.addressText.textContent = state.address;
    dom.addressSub.textContent = state.addressSub;
    dom.addressBadge.hidden = !state.isMockLocation;
  }

  /**
   * 刷新结果计数与数据源说明。
   * @returns {void}
   */
  function renderMeta() {
    const list = sortedList();
    const total = state.restaurants.length;
    const near = list.filter((item) => item.distance < 1000).length;
    const countText = list.length === total ? `${total} 家` : `${list.length} 家（共 ${total} 家）`;
    dom.resultMeta.textContent = `${countText} · ${state.isMockData ? '示例数据' : '高德实时数据'} · 1 公里内 ${near} 家`;
  }

  /**
   * 按当前筛选与排序生成餐厅列表副本。
   * @returns {Array<Object>} 排序后的餐厅数组
   */
  function sortedList() {
    const list = state.restaurants.filter((item) => matchPrice(item) && matchTaste(item));
    if (state.sort === 'rating') {
      list.sort((a, b) => (b.rating == null ? -1 : b.rating) - (a.rating == null ? -1 : a.rating) || a.distance - b.distance);
    } else {
      list.sort((a, b) => a.distance - b.distance || (b.rating == null ? -1 : b.rating) - (a.rating == null ? -1 : a.rating));
    }
    return list;
  }

  /**
   * 渲染推荐餐厅卡片列表，含收藏按钮。
   * @returns {void}
   */
  function renderList() {
    const list = sortedList();
    if (!list.length) {
      dom.cardList.innerHTML = '';
      dom.emptyState.hidden = false;
      return;
    }
    dom.emptyState.hidden = true;
    dom.cardList.innerHTML = list.map((item, index) => {
      const active = item.id === state.selectedId;
      const favorite = isFavorite(item.id);
      const score = item.rating == null ? '—' : item.rating.toFixed(1);
      const price = item.price == null ? '—' : item.price;
      return `<li class="card${active ? ' is-active' : ''}" data-id="${esc(item.id)}" tabindex="0" role="button" aria-selected="${active}">
        <div class="card-top">
          <span class="card-name"><span class="card-index">${index + 1}</span>${esc(item.name)}</span>
          <span class="card-score">★ ${score}</span>
          <button class="fav-btn${favorite ? ' is-active' : ''}" type="button" data-id="${esc(item.id)}" aria-pressed="${favorite}" aria-label="${favorite ? '取消收藏' : '收藏'}">${favorite ? '♥' : '♡'}</button>
        </div>
        <div class="card-meta">
          <span class="meta-item">🛣 ${formatDistance(item.distance)}</span>
          <span class="meta-item">💰 人均 ${price} 元</span>
          <span class="meta-item taste">${esc(item.taste)}</span>
        </div>
        ${item.address ? `<div class="card-addr">${esc(item.address)}</div>` : ''}
        ${item.reason ? `<div class="card-reason"><b>推荐</b><span>${esc(item.reason)}</span></div>` : ''}
      </li>`;
    }).join('');
  }

  /**
   * 根据当前选中项更新卡片高亮状态。
   * @returns {void}
   */
  function markCards() {
    const cards = dom.cardList.querySelectorAll('.card');
    for (let i = 0; i < cards.length; i++) {
      const active = cards[i].getAttribute('data-id') === state.selectedId;
      cards[i].classList.toggle('is-active', active);
      cards[i].setAttribute('aria-selected', String(active));
    }
  }

  /**
   * 选中餐厅并联动地图与详情。
   * @param {string} id - 餐厅 ID
   * @param {string} source - 触发来源，list/map/favorites
   * @returns {void}
   */
  function selectRestaurant(id, source) {
    const item = findById(id);
    if (!item) return;
    if (state.selectedId !== id) resetRoute();
    state.selectedId = id;
    markCards();
    if (state.mapMode === 'amap' && state.amap) {
      if (source === 'map') {
        openAmapInfo(item);
        state.amap.setCenter([item.lng, item.lat]);
      } else {
        state.amap.setZoomAndCenter(Math.max(state.amap.getZoom(), 15), [item.lng, item.lat]);
        openAmapInfo(item);
      }
      updateAmapMarkersActive();
    } else {
      focusLocal(item);
      showLocalInfo(item);
      updateLocalMarkerState();
    }
  }

  /**
   * 按 ID 在实时餐厅集合中查找。
   * @param {string} id - 餐厅 ID
   * @returns {Object|null} 找到返回餐厅，否则 null
   */
  function findById(id) {
    for (let i = 0; i < state.restaurants.length; i++) {
      if (state.restaurants[i].id === id) return state.restaurants[i];
    }
    return null;
  }

  /**
   * 从 localStorage 读取并清洗收藏数据。
   * @returns {Array<Object>} 清洗后的收藏数组
   */
  function readFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bad favorites');
      const seen = {};
      const list = [];
      for (let i = 0; i < parsed.length && list.length < FAVORITES_LIMIT; i++) {
        const entry = parsed[i];
        if (!entry || typeof entry !== 'object') continue;
        const id = xssFilter(entry.id);
        if (!validateRestaurantId(id) || seen[id]) continue;
        seen[id] = true;
        list.push({
          id,
          name: xssFilter(entry.name),
          taste: xssFilter(entry.taste),
          price: typeof entry.price === 'number' && isFinite(entry.price) ? entry.price : null,
          lng: typeof entry.lng === 'number' && isFinite(entry.lng) ? entry.lng : null,
          lat: typeof entry.lat === 'number' && isFinite(entry.lat) ? entry.lat : null,
          address: xssFilter(entry.address),
          addedAt: typeof entry.addedAt === 'number' && isFinite(entry.addedAt) ? entry.addedAt : 0
        });
      }
      return list;
    } catch (err) {
      try { localStorage.removeItem(FAVORITES_STORAGE_KEY); } catch (removeErr) { /* ignore */ }
      return [];
    }
  }

  /**
   * 过滤并写入收藏数据到 localStorage。
   * @param {Array<Object>} list - 待写入的收藏数组
   * @returns {boolean} 写入成功返回 true，失败返回 false
   */
  function writeFavorites(list) {
    try {
      const safeList = list.map((entry) => ({
        id: xssFilter(entry.id),
        name: xssFilter(entry.name),
        taste: xssFilter(entry.taste),
        price: typeof entry.price === 'number' && isFinite(entry.price) ? entry.price : null,
        lng: typeof entry.lng === 'number' && isFinite(entry.lng) ? entry.lng : null,
        lat: typeof entry.lat === 'number' && isFinite(entry.lat) ? entry.lat : null,
        address: xssFilter(entry.address),
        addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now()
      })).filter((entry) => validateRestaurantId(entry.id));
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(safeList));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 判断餐厅是否已收藏。
   * @param {string} id - 餐厅 ID
   * @returns {boolean} 已收藏返回 true
   */
  function isFavorite(id) {
    return !!findFavorite(id);
  }

  /**
   * 按 ID 查找收藏项。
   * @param {string} id - 餐厅 ID
   * @returns {Object|null} 找到返回收藏项，否则 null
   */
  function findFavorite(id) {
    for (let i = 0; i < state.favorites.length; i++) {
      if (state.favorites[i].id === id) return state.favorites[i];
    }
    return null;
  }

  /**
   * 收藏或取消收藏餐厅，含 ID 校验、上限、幂等与写入回滚。
   * @param {string} id - 餐厅 ID
   * @param {string} action - add 或 remove
   * @returns {void}
   */
  function toggleFavorite(id, action) {
    if (!validateRestaurantId(id)) {
      console.warn('无效的餐厅 ID，已忽略收藏操作：', id);
      return;
    }
    if (action !== 'add' && action !== 'remove') {
      console.warn('无效的收藏操作类型：', action);
      return;
    }
    const previous = state.favorites.slice();
    if (action === 'add') {
      if (isFavorite(id)) {
        showToast(FAVORITE_TOAST.added);
        return;
      }
      if (state.favorites.length >= FAVORITES_LIMIT) {
        showToast(FAVORITE_TOAST.full, 'error');
        return;
      }
      const item = findById(id);
      if (!item) {
        console.warn('未找到餐厅，已忽略收藏操作：', id);
        return;
      }
      state.favorites.push({
        id: xssFilter(item.id),
        name: xssFilter(item.name),
        taste: xssFilter(item.taste),
        price: typeof item.price === 'number' ? item.price : null,
        lng: item.lng,
        lat: item.lat,
        address: xssFilter(item.address),
        addedAt: Date.now()
      });
    } else {
      state.favorites = state.favorites.filter((entry) => entry.id !== id);
    }
    if (!writeFavorites(state.favorites)) {
      state.favorites = previous;
      showToast(FAVORITE_TOAST.failed, 'error');
      return;
    }
    refreshFavoriteViews();
    showToast(action === 'add' ? FAVORITE_TOAST.added : FAVORITE_TOAST.removed);
  }

  /**
   * 确保收藏项存在于实时餐厅集合中，必要时用快照回补。
   * @param {string} id - 餐厅 ID
   * @returns {Object|null} 可见餐厅对象或 null
   */
  function ensureFavoriteVisible(id) {
    const known = findById(id);
    if (known) return known;
    const favorite = findFavorite(id);
    if (!favorite) return null;
    const lng = Number(favorite.lng);
    const lat = Number(favorite.lat);
    if (!isFinite(lng) || !isFinite(lat)) return null;
    const restored = {
      id: favorite.id,
      name: favorite.name || '未命名餐厅',
      taste: favorite.taste || '美食',
      price: typeof favorite.price === 'number' ? favorite.price : null,
      rating: null,
      lng,
      lat,
      address: favorite.address || '',
      distance: Math.max(10, Math.round(haversine(state.center, { lng, lat }))),
      source: 'favorite',
      reason: ''
    };
    state.restaurants.push(restored);
    return restored;
  }

  /**
   * 从收藏列表定位餐厅：复位筛选后选中并弹出详情。
   * @param {string} id - 餐厅 ID
   * @returns {void}
   */
  function focusFavorite(id) {
    if (!validateRestaurantId(id)) {
      console.warn('无效的餐厅 ID，已忽略收藏定位：', id);
      return;
    }
    const item = ensureFavoriteVisible(id);
    if (!item) {
      showToast(FAVORITE_TOAST.failed, 'error');
      return;
    }
    state.keyword = '';
    state.price = 'all';
    state.taste = 'all';
    if (dom.searchInput) dom.searchInput.value = '';
    syncFilterButtons();
    applyFilters();
    selectRestaurant(id, 'favorites');
  }

  /**
   * 渲染“我的收藏”面板、计数与空态。
   * @returns {void}
   */
  function renderFavorites() {
    if (!dom.favoriteList || !dom.favoritesEmpty || !dom.favCount) return;
    const count = state.favorites.length;
    dom.favCount.textContent = `${count}/${FAVORITES_LIMIT}`;
    dom.favCount.classList.toggle('is-full', count >= FAVORITES_LIMIT);
    if (!count) {
      dom.favoriteList.innerHTML = '';
      dom.favoritesEmpty.hidden = false;
      return;
    }
    dom.favoritesEmpty.hidden = true;
    dom.favoriteList.innerHTML = state.favorites.map((favorite) => {
      const live = findById(favorite.id);
      const item = live || favorite;
      const name = item.name || '未命名餐厅';
      const taste = item.taste || '美食';
      const priceText = item.price == null ? '—' : `${item.price} 元`;
      return `<li class="favorite-item" data-id="${esc(favorite.id)}" tabindex="0" role="button" aria-label="${esc(name)}，查看并在地图定位">
        <span class="favorite-item-name">${esc(name)}</span>
        <span class="favorite-item-meta">${esc(taste)} · 人均 ${esc(priceText)}</span>
      </li>`;
    }).join('');
  }

  /**
   * 聚合刷新收藏变化影响的卡片、面板与选中态。
   * @returns {void}
   */
  function refreshFavoriteViews() {
    renderList();
    renderFavorites();
    markCards();
  }

  /**
   * 显示底部一次性提示。
   * @param {string} message - 提示文案
   * @param {string} [type] - 提示类型，error 为错误提示
   * @returns {void}
   */
  function showToast(message, type) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.remove('is-visible');
    dom.toast.classList.toggle('is-error', type === 'error');
    if (toastTimer) clearTimeout(toastTimer);
    const reveal = () => dom.toast.classList.add('is-visible');
    if (window.requestAnimationFrame) window.requestAnimationFrame(reveal);
    else reveal();
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
      toastTimer = setTimeout(() => {
        dom.toast.hidden = true;
        dom.toast.textContent = '';
      }, 200);
    }, type === 'error' ? 2600 : 2000);
  }

  /**
   * 从 localStorage 读取并清洗最近搜索关键词。
   * @returns {Array<string>} 清洗后的关键词数组
   */
  function readRecentSearches() {
    try {
      const raw = localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bad recent searches');
      const seen = {};
      const list = [];
      for (let i = 0; i < parsed.length && list.length < RECENT_SEARCH_LIMIT; i++) {
        if (typeof parsed[i] !== 'string') continue;
        const keyword = xssFilter(parsed[i]).slice(0, RECENT_SEARCH_MAX_LENGTH);
        if (!keyword || seen[keyword]) continue;
        seen[keyword] = true;
        list.push(keyword);
      }
      return list;
    } catch (err) {
      try { localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY); } catch (removeErr) { /* ignore */ }
      return [];
    }
  }

  /**
   * 过滤并写入最近搜索关键词。
   * @param {Array<string>} list - 待写入的关键词数组
   * @returns {boolean} 写入成功返回 true，失败返回 false
   */
  function writeRecentSearches(list) {
    try {
      const safeList = list
        .map((item) => xssFilter(item).slice(0, RECENT_SEARCH_MAX_LENGTH))
        .filter((item) => item);
      localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(safeList));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 记录最近搜索关键词并刷新区域。
   * @param {string} rawValue - 原始搜索关键词
   * @returns {void}
   */
  function rememberSearchKeyword(rawValue) {
    const trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) return;
    const record = xssFilter(trimmed).slice(0, RECENT_SEARCH_MAX_LENGTH);
    if (!record) return;
    state.recentSearches = state.recentSearches.filter((item) => item !== record);
    state.recentSearches.unshift(record);
    state.recentSearches = state.recentSearches.slice(0, RECENT_SEARCH_LIMIT);
    writeRecentSearches(state.recentSearches);
    renderRecentSearches();
  }

  /**
   * 清空最近搜索并提示。
   * @returns {void}
   */
  function clearRecentSearches() {
    state.recentSearches = [];
    writeRecentSearches([]);
    renderRecentSearches();
    showToast(RECENT_SEARCH_TOAST.cleared);
  }

  /**
   * 渲染最近搜索区域，无记录时隐藏。
   * @returns {void}
   */
  function renderRecentSearches() {
    if (!dom.recentSearch || !dom.recentTags) return;
    if (!state.recentSearches.length) {
      dom.recentTags.innerHTML = '';
      dom.recentSearch.hidden = true;
      return;
    }
    dom.recentTags.innerHTML = state.recentSearches.map((keyword) =>
      `<button class="recent-tag" type="button" data-keyword="${esc(keyword)}">${esc(keyword)}</button>`
    ).join('');
    dom.recentSearch.hidden = false;
  }

  /**
   * 统一处理搜索提交：记录关键词后执行搜索。
   * @param {string} rawValue - 搜索框原始值
   * @returns {void}
   */
  function handleSearchSubmit(rawValue) {
    const trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) {
      state.keyword = '';
      searchPlaces();
      return;
    }
    rememberSearchKeyword(trimmed);
    state.keyword = trimmed;
    searchPlaces();
  }

  /**
   * 初始化定位并执行首次搜索。
   * @returns {Promise<void>} 定位与搜索完成
   */
  async function locateAndSearch() {
    if (!KEY) {
      state.useMockData = true;
      state.isMockLocation = true;
      state.isMockData = true;
      state.address = MOCK_LOCATION.address || '示例位置';
      state.addressSub = '示例位置 · 未配置高德 Key';
      renderAddress();
      renderMeta();
      note('未检测到高德 Key（config.local.js 缺失或为空），当前使用示例位置与示例餐厅数据，全部交互功能可正常演示。');
      return;
    }
    try {
      const ip = await fetchJSON(`${REST}/ip?key=${encodeURIComponent(KEY)}`);
      if (!ip || String(ip.status) !== '1') throw new Error('IP 定位无结果');
      const city = pickCity(ip);
      if (!city) throw new Error('IP 定位未返回城市');
      state.city = city;
      let center = rectangleCenter(ip.rectangle);
      if (!center) center = await cityCenter(city);
      if (!center) throw new Error('无法确定城市中心');
      state.center = center;
      await resolveAddress();
      state.useMockData = false;
      renderAddress();
      await searchPlaces({ initial: true });
    } catch (err) {
      useFallbackLocation(err);
    }
  }

  /**
   * 逆地理编码当前坐标并更新地址文案。
   * @returns {Promise<void>} 逆地理编码完成
   */
  async function resolveAddress() {
    try {
      const result = await fetchJSON(`${REST}/geocode/regeo?key=${encodeURIComponent(KEY)}&location=${state.center.lng},${state.center.lat}`);
      const regeo = result && result.regeocode;
      let address = regeo && regeo.formatted_address;
      if (Array.isArray(address)) address = address.join('');
      if (typeof address === 'string' && address.trim()) {
        state.address = address.trim();
        state.addressSub = `${state.city} · 高德 IP 定位（精度有限）`;
        state.isMockLocation = false;
        return;
      }
      throw new Error('逆地理编码无结果');
    } catch (err) {
      state.address = MOCK_LOCATION.address || '示例位置';
      state.addressSub = '示例位置 · 逆地理编码失败';
      state.isMockLocation = true;
    }
  }

  /**
   * 定位失败时回退到示例位置与示例数据。
   * @param {Error} err - 触发回退的错误
   * @returns {void}
   */
  function useFallbackLocation(err) {
    state.center = { lng: MOCK_LOCATION.lng, lat: MOCK_LOCATION.lat };
    state.city = MOCK_LOCATION.city || '';
    state.address = MOCK_LOCATION.address || '示例位置';
    state.addressSub = `示例位置 · ${reasonText(err)}`;
    state.isMockLocation = true;
    state.useMockData = true;
    renderAddress();
    applyMockData('', false);
    note(`定位失败（${reasonText(err)}），已切换到示例位置与示例餐厅数据，地图、搜索与详情功能均可演示。`);
    syncMapCenter();
  }

  /**
   * 按当前关键词执行餐厅搜索。
   * @param {Object} [options] - 搜索选项
   * @param {boolean} [options.initial] - 是否为初始化搜索
   * @returns {Promise<void>} 搜索完成
   */
  async function searchPlaces(options) {
    options = options || {};
    const keyword = state.keyword;
    if (state.useMockData || !KEY) {
      applyMockData(keyword, !options.initial);
      return;
    }
    setSearching(true);
    clearNote();
    try {
      const url = `${REST}/place/text?key=${encodeURIComponent(KEY)}&keywords=${encodeURIComponent(keyword || '美食')}&types=050000&offset=25&page=1&extensions=all&city=${encodeURIComponent(state.city)}&citylimit=false`;
      const result = await fetchJSON(url);
      const pois = result && Array.isArray(result.pois) ? result.pois : [];
      let items = pois.filter(hasLocation).map(normalizePoi);
      items = dedupe(items).slice(0, 20);
      if (!items.length) throw new Error('该关键词没有搜索结果');
      state.restaurants = items;
      state.isMockData = false;
      state.selectedId = null;
      resetRoute();
      hideLocalInfo();
      state.amapInfo && state.amapInfo.close();
      renderList();
      renderLocalMarkers();
      renderMeta();
      renderFavorites();
      syncMapCenter();
    } catch (err) {
      applyMockData(keyword, false);
      note(`真实搜索不可用（${reasonText(err)}），已展示示例餐厅数据，功能可完整演示。`);
    } finally {
      setSearching(false);
    }
  }

  /**
   * 应用示例餐厅数据并刷新视图。
   * @param {string} keyword - 搜索关键词
   * @param {boolean} showNote - 是否显示提示
   * @returns {void}
   */
  function applyMockData(keyword, showNote) {
    state.restaurants = buildMockRestaurants(keyword);
    state.isMockData = true;
    state.selectedId = null;
    resetRoute();
    hideLocalInfo();
    if (state.amapInfo) state.amapInfo.close();
    renderList();
    renderLocalMarkers();
    renderMeta();
    renderFavorites();
    if (showNote && keyword) {
      note(`示例数据中匹配“${keyword}”的餐厅已展示，真实接口恢复后会自动切换。`);
    }
    syncMapCenter();
  }

  /**
   * 构建示例餐厅列表并按关键词过滤。
   * @param {string} keyword - 搜索关键词
   * @returns {Array<Object>} 示例餐厅数组
   */
  function buildMockRestaurants(keyword) {
    const list = MOCK_RESTAURANTS.map(toMockRestaurant);
    if (!keyword) return list;
    const filtered = list.filter((item) =>
      item.name.indexOf(keyword) >= 0 || item.taste.indexOf(keyword) >= 0 || item.address.indexOf(keyword) >= 0
    );
    return filtered.length ? filtered : list;
  }

  /**
   * 将示例原始数据转换为餐厅对象。
   * @param {Object} raw - 示例原始餐厅
   * @returns {Object} 标准化餐厅对象
   */
  function toMockRestaurant(raw) {
    const lng = Number(raw.lng) + (state.center.lng - Number(MOCK_LOCATION.lng));
    const lat = Number(raw.lat) + (state.center.lat - Number(MOCK_LOCATION.lat));
    const item = {
      id: raw.id,
      name: raw.name,
      taste: raw.taste || '美食',
      price: typeof raw.price === 'number' ? raw.price : null,
      rating: typeof raw.rating === 'number' ? raw.rating : null,
      lng,
      lat,
      address: raw.address || '',
      distance: Math.max(10, Math.round(haversine(state.center, { lng, lat }))),
      source: 'mock',
      reason: ''
    };
    item.reason = buildReason(item);
    return item;
  }

  /**
   * 计算并规整餐厅距离。
   * @param {Object} poi - 高德 POI
   * @param {number} lng - 经度
   * @param {number} lat - 纬度
   * @returns {number} 距离（米）
   */
  function resolveDistance(poi, lng, lat) {
    let distance = parseFloat(poi && poi.distance);
    if (!isFinite(distance) || distance <= 0) distance = parseFloat(poi && poi._distance);
    if (!isFinite(distance) || distance <= 0) distance = haversine(state.center, { lng, lat });
    if (!isFinite(distance) || distance <= 0) distance = 10;
    return Math.max(10, Math.round(distance));
  }

  /**
   * 将高德 POI 标准化为餐厅对象。
   * @param {Object} poi - 高德 POI
   * @param {number} index - POI 序号
   * @returns {Object} 标准化餐厅对象
   */
  function normalizePoi(poi, index) {
    const pair = String(poi.location || '').split(',');
    const lng = parseFloat(pair[0]);
    const lat = parseFloat(pair[1]);
    const distance = resolveDistance(poi, lng, lat);
    const taste = detectTaste(poi);
    const cost = parseFloat(poi.biz_ext && poi.biz_ext.cost);
    const rating = parseFloat(poi.biz_ext && poi.biz_ext.rating);
    const item = {
      id: `amap-${String(poi.id || index)}`,
      name: xssFilter(poi.name) || '未命名餐厅',
      taste,
      price: isFinite(cost) && cost > 0 ? Math.round(cost) : (PRICE_GUESS[taste] || 45),
      rating: isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
      lng,
      lat,
      address: typeof poi.address === 'string' ? xssFilter(poi.address) : '',
      distance,
      source: 'amap',
      reason: ''
    };
    item.reason = buildReason(item);
    return item;
  }

  /**
   * 根据 POI 类型与名称推断口味。
   * @param {Object} poi - 高德 POI
   * @returns {string} 口味名称
   */
  function detectTaste(poi) {
    const text = `${String(poi.type || '')} ${String(poi.name || '')}`;
    for (let i = 0; i < TASTE_RULES.length; i++) {
      const rule = TASTE_RULES[i];
      for (let j = 0; j < rule.keys.length; j++) {
        if (text.indexOf(rule.keys[j]) >= 0) return rule.taste;
      }
    }
    const type = String(poi.type || '');
    if (type.indexOf(';') >= 0) {
      const parts = type.split(';').filter((part) => part.trim());
      if (parts.length) return parts[parts.length - 1].trim();
    }
    return '美食';
  }

  /**
   * 生成餐厅推荐理由。
   * @param {Object} item - 餐厅对象
   * @returns {string} 推荐理由文本
   */
  function buildReason(item) {
    const parts = [];
    const minutes = Math.max(1, Math.round(item.distance / 75));
    if (item.distance < 600) parts.push(`步行约 ${minutes} 分钟即到`);
    else if (item.distance < 1500) parts.push(`步行约 ${minutes} 分钟`);
    else parts.push(`距离 ${formatDistance(item.distance)}，建议骑行`);
    if (item.price != null) {
      if (item.price < 30) parts.push(`平价人均 ${item.price} 元`);
      else if (item.price <= 80) parts.push(`人均 ${item.price} 元`);
      else parts.push(`人均 ${item.price} 元偏高`);
    }
    if (item.rating != null) {
      if (item.rating >= 4.5) parts.push(`评分 ${item.rating.toFixed(1)} 口碑好`);
      else if (item.rating >= 4.0) parts.push(`评分 ${item.rating.toFixed(1)}`);
      else parts.push(`评分 ${item.rating.toFixed(1)} 胜在实惠`);
    }
    if (item.taste) parts.push(`主打${item.taste}`);
    return parts.join(' · ');
  }

  /**
   * 判断 POI 是否包含合法坐标。
   * @param {Object} poi - 高德 POI
   * @returns {boolean} 坐标合法返回 true
   */
  function hasLocation(poi) {
    const pair = String(poi.location || '').split(',');
    return pair.length === 2 && isFinite(parseFloat(pair[0])) && isFinite(parseFloat(pair[1]));
  }

  /**
   * 按名称与坐标去除重复 POI。
   * @param {Array<Object>} items - 餐厅数组
   * @returns {Array<Object>} 去重后的数组
   */
  function dedupe(items) {
    const seen = {};
    return items.filter((item) => {
      const key = `${item.name}|${item.lng.toFixed(4)},${item.lat.toFixed(4)}`;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /**
   * 从 IP 定位结果中提取城市名。
   * @param {Object} ip - IP 定位结果
   * @returns {string} 城市名，未知返回空串
   */
  function pickCity(ip) {
    if (typeof ip.city === 'string' && ip.city) return ip.city;
    if (Array.isArray(ip.city) && ip.city.length) return String(ip.city[0]);
    if (typeof ip.province === 'string' && ip.province) return ip.province;
    return '';
  }

  /**
   * 计算 IP 定位矩形中心点。
   * @param {string} rectangle - 矩形坐标串
   * @returns {{lng:number,lat:number}|null} 中心点或 null
   */
  function rectangleCenter(rectangle) {
    if (typeof rectangle !== 'string' || rectangle.indexOf(';') < 0) return null;
    const corners = rectangle.split(';');
    const first = corners[0].split(',');
    const second = corners[1].split(',');
    const lng1 = parseFloat(first[0]);
    const lat1 = parseFloat(first[1]);
    const lng2 = parseFloat(second[0]);
    const lat2 = parseFloat(second[1]);
    if (!isFinite(lng1) || !isFinite(lat1) || !isFinite(lng2) || !isFinite(lat2)) return null;
    return { lng: (lng1 + lng2) / 2, lat: (lat1 + lat2) / 2 };
  }

  /**
   * 通过地理编码获取城市中心点。
   * @param {string} city - 城市名
   * @returns {Promise<{lng:number,lat:number}|null>} 城市中心点或 null
   */
  async function cityCenter(city) {
    try {
      const result = await fetchJSON(`${REST}/geocode/geo?key=${encodeURIComponent(KEY)}&address=${encodeURIComponent(city)}`);
      const geo = result && result.geocodes && result.geocodes[0];
      const pair = geo && String(geo.location || '').split(',');
      const lng = pair ? parseFloat(pair[0]) : NaN;
      const lat = pair ? parseFloat(pair[1]) : NaN;
      if (isFinite(lng) && isFinite(lat)) return { lng, lat };
    } catch (err) { /* ignore */ }
    return null;
  }

  /**
   * 带超时的 JSON 请求。
   * @param {string} url - 请求地址
   * @param {number} [timeout] - 超时毫秒数
   * @returns {Promise<Object>} 响应 JSON
   */
  async function fetchJSON(url, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 9000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 同步地图视野到当前中心点。
   * @returns {void}
   */
  function syncMapCenter() {
    if (state.mapMode === 'amap' && state.amap) {
      state.amap.setCenter([state.center.lng, state.center.lat]);
      renderAMapMarkers();
    } else {
      state.local.offsetX = 0;
      state.local.offsetY = 0;
      renderLocalMarkers();
    }
  }

  /**
   * 计算本地示意地图当前跨度。
   * @returns {number} 经度跨度
   */
  function currentSpan() {
    let maxDistance = 0;
    state.restaurants.forEach((item) => {
      const distance = haversine(state.center, { lng: item.lng, lat: item.lat });
      if (distance > maxDistance) maxDistance = distance;
    });
    return Math.max(BASE_SPAN_LNG, (maxDistance * 2.4) / 85000);
  }

  /**
   * 将经纬度投影为本地示意地图坐标。
   * @param {{lng:number,lat:number}} point - 经纬度
   * @returns {{x:number,y:number}} 像素坐标
   */
  function project(point) {
    const width = dom.localMap.clientWidth || 600;
    const height = dom.localMap.clientHeight || 400;
    const pxPerLng = width / currentSpan();
    const pxPerLat = pxPerLng / Math.max(0.25, Math.cos((state.center.lat * Math.PI) / 180));
    return {
      x: width * 1.5 + (point.lng - state.center.lng) * pxPerLng,
      y: height * 1.5 - (point.lat - state.center.lat) * pxPerLat
    };
  }

  /**
   * 渲染本地示意地图标记点。
   * @returns {void}
   */
  function renderLocalMarkers() {
    if (!dom.localMarkers) return;
    const list = sortedList();
    const width = dom.localMap.clientWidth || 600;
    const height = dom.localMap.clientHeight || 400;
    const pxPerLng = width / currentSpan();
    const pxPerLat = pxPerLng / Math.max(0.25, Math.cos((state.center.lat * Math.PI) / 180));
    dom.localMarkers.innerHTML = '';
    list.forEach((item, index) => {
      const pos = {
        x: width * 1.5 + (item.lng - state.center.lng) * pxPerLng,
        y: height * 1.5 - (item.lat - state.center.lat) * pxPerLat
      };
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = `marker${item.id === state.selectedId ? ' is-active' : ''}`;
      marker.setAttribute('data-id', item.id);
      marker.style.left = `${pos.x}px`;
      marker.style.top = `${pos.y}px`;
      marker.textContent = String(index + 1);
      marker.title = `${item.name} · ${formatDistance(item.distance)}`;
      marker.setAttribute('aria-label', `${item.name}，点击查看详情`);
      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        selectRestaurant(item.id, 'map');
      });
      dom.localMarkers.appendChild(marker);
    });
    applyLocalTransform();
  }

  /**
   * 应用本地示意地图的平移与缩放变换。
   * @returns {void}
   */
  function applyLocalTransform() {
    if (!dom.localPlane) return;
    dom.localPlane.style.transform = `translate(${state.local.offsetX}px,${state.local.offsetY}px) scale(${state.local.zoom})`;
    const inverse = 1 / state.local.zoom;
    const markers = dom.localMarkers ? dom.localMarkers.children : [];
    for (let i = 0; i < markers.length; i++) {
      markers[i].style.transform = `translate(-50%,-50%) scale(${inverse})`;
    }
  }

  /**
   * 更新本地标记点的选中高亮。
   * @returns {void}
   */
  function updateLocalMarkerState() {
    if (!dom.localMarkers) return;
    const markers = dom.localMarkers.children;
    for (let i = 0; i < markers.length; i++) {
      markers[i].classList.toggle('is-active', markers[i].getAttribute('data-id') === state.selectedId);
    }
  }

  /**
   * 将本地示意地图聚焦到指定餐厅。
   * @param {Object} item - 餐厅对象
   * @returns {void}
   */
  function focusLocal(item) {
    const width = dom.localMap.clientWidth || 600;
    const pxPerLng = width / currentSpan();
    const pxPerLat = pxPerLng / Math.max(0.25, Math.cos((state.center.lat * Math.PI) / 180));
    const dx = (item.lng - state.center.lng) * pxPerLng;
    const dy = (item.lat - state.center.lat) * pxPerLat;
    state.local.offsetX = -dx * state.local.zoom;
    state.local.offsetY = dy * state.local.zoom;
    applyLocalTransform();
  }

  /**
   * 设置本地示意地图缩放级别。
   * @param {number} next - 目标缩放值
   * @returns {void}
   */
  function setZoom(next) {
    state.local.zoom = Math.min(3.2, Math.max(0.6, next));
    applyLocalTransform();
  }

  /**
   * 处理地图指针按下，开始拖拽。
   * @param {PointerEvent} event - 指针事件
   * @returns {void}
   */
  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('.marker, .zoom-controls, .local-info')) return;
    state.local.dragging = true;
    state.local.moved = false;
    state.local.startX = event.clientX;
    state.local.startY = event.clientY;
    state.local.baseX = state.local.offsetX;
    state.local.baseY = state.local.offsetY;
    dom.localMap.classList.add('is-dragging');
    try { dom.localMap.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
  }

  /**
   * 处理地图指针移动，更新拖拽偏移。
   * @param {PointerEvent} event - 指针事件
   * @returns {void}
   */
  function onPointerMove(event) {
    if (!state.local.dragging) return;
    const dx = event.clientX - state.local.startX;
    const dy = event.clientY - state.local.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.local.moved = true;
    state.local.offsetX = state.local.baseX + dx;
    state.local.offsetY = state.local.baseY + dy;
    applyLocalTransform();
  }

  /**
   * 处理地图指针抬起，结束拖拽。
   * @param {PointerEvent} event - 指针事件
   * @returns {void}
   */
  function onPointerUp(event) {
    if (!state.local.dragging) return;
    state.local.dragging = false;
    dom.localMap.classList.remove('is-dragging');
    try { dom.localMap.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    if (!state.local.moved) {
      state.selectedId = null;
      resetRoute();
      hideLocalInfo();
      markCards();
      updateLocalMarkerState();
    }
  }

  /**
   * 处理地图滚轮缩放。
   * @param {WheelEvent} event - 滚轮事件
   * @returns {void}
   */
  function onWheel(event) {
    event.preventDefault();
    setZoom(state.local.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
  }

  /**
   * 显示本地详情卡。
   * @param {Object} item - 餐厅对象
   * @returns {void}
   */
  function showLocalInfo(item) {
    dom.localInfo.innerHTML = `<div class="info-top"><h3>${esc(item.name)}</h3><button type="button" class="info-close" aria-label="关闭详情">✕</button></div>${infoBody(item)}`;
    dom.localInfo.hidden = false;
  }

  /**
   * 隐藏并清空本地详情卡。
   * @returns {void}
   */
  function hideLocalInfo() {
    if (!dom.localInfo) return;
    dom.localInfo.hidden = true;
    dom.localInfo.innerHTML = '';
  }

  /**
   * 生成餐厅详情内容 HTML。
   * @param {Object} item - 餐厅对象
   * @returns {string} 详情 HTML
   */
  function infoBody(item) {
    const chips = [];
    chips.push(`🛣 ${formatDistance(item.distance)}`);
    if (item.price != null) chips.push(`💰 人均 ${item.price} 元`);
    if (item.rating != null) chips.push(`★ ${item.rating.toFixed(1)}`);
    chips.push(`🍽 ${esc(item.taste)}`);
    const hasRoute = state.route.id === item.id && state.route.status !== 'idle';
    const routeLabel = hasRoute && state.route.expanded ? '收起路线' : (hasRoute ? '展开路线' : '去这里');
    return `<div class="info-meta">${chips.map((text) => `<span>${text}</span>`).join('')}</div>
      ${item.address ? `<p class="info-addr">${esc(item.address)}</p>` : ''}
      ${item.reason ? `<p class="info-reason"><b>推荐</b>${esc(item.reason)}</p>` : ''}
      <div class="info-actions"><button class="route-btn" type="button" data-id="${esc(item.id)}">${routeLabel}</button></div>
      ${routePanelHtml(item)}`;
  }

  /**
   * 生成高德 InfoWindow 内容 HTML。
   * @param {Object} item - 餐厅对象
   * @returns {string} InfoWindow HTML
   */
  function infoHtml(item) {
    return `<div class="info-card"><h3>${esc(item.name)}</h3>${infoBody(item)}</div>`;
  }

  /**
   * 重置路线状态。
   * @returns {void}
   */
  function resetRoute() {
    state.route = {
      id: null,
      status: 'idle',
      expanded: false,
      distance: 0,
      minutes: 0,
      steps: [],
      desc: '',
      sourceText: '',
      note: ''
    };
  }

  /**
   * 处理“去这里/展开路线”按钮点击。
   * @param {string} id - 餐厅 ID
   * @returns {void}
   */
  function handleRouteClick(id) {
    const item = findById(id);
    if (!item) return;
    if (state.selectedId !== id) {
      state.selectedId = id;
      markCards();
      resetRoute();
    }
    if (state.route.id === id && state.route.status !== 'idle') {
      state.route.expanded = !state.route.expanded;
      refreshInfo();
      updateLocalMarkerState();
      return;
    }
    state.route = {
      id,
      status: 'loading',
      expanded: true,
      distance: 0,
      minutes: 0,
      steps: [],
      desc: '',
      sourceText: '',
      note: ''
    };
    refreshInfo();
    loadRoute(item);
  }

  /**
   * 加载步行路线，失败时回退估算。
   * @param {Object} item - 餐厅对象
   * @returns {Promise<void>} 路线加载完成
   */
  async function loadRoute(item) {
    if (!KEY || state.useMockData || state.isMockData) {
      applyEstimatedRoute(item, '');
      return;
    }
    try {
      const url = `${REST}/direction/walking?key=${encodeURIComponent(KEY)}&origin=${state.center.lng},${state.center.lat}&destination=${item.lng},${item.lat}&extensions=base`;
      const result = await fetchJSON(url, 9000);
      const path = result && result.route && result.route.paths && result.route.paths[0];
      if (!path || !(Number(path.distance) > 0)) throw new Error('无步行路线');
      if (state.route.id !== item.id) return;
      const steps = (path.steps || []).map((step) => stripHtml(step.instruction || '')).filter((text) => text);
      const distance = Math.round(Number(path.distance));
      const seconds = Number(path.duration);
      const minutes = isFinite(seconds) && seconds > 0
        ? Math.max(1, Math.round(seconds / 60))
        : Math.max(1, Math.round(distance / 75));
      state.route = {
        id: item.id,
        status: 'ready',
        expanded: true,
        distance,
        minutes,
        steps: steps.slice(0, 4),
        desc: steps.length ? '' : `沿校园周边道路步行前往，全程约 ${formatDistance(distance)}。`,
        sourceText: '高德步行路线',
        note: ''
      };
      refreshInfo();
      updateLocalMarkerState();
    } catch (err) {
      if (state.route.id !== item.id) return;
      applyEstimatedRoute(item, `路线接口不可用（${reasonText(err)}），已按直线距离估算`);
    }
  }

  /**
   * 按直线距离生成估算路线。
   * @param {Object} item - 餐厅对象
   * @param {string} noteText - 备注文案
   * @returns {void}
   */
  function applyEstimatedRoute(item, noteText) {
    const distance = Math.max(10, Math.round(item.distance));
    const minutes = Math.max(1, Math.round(distance / 75));
    state.route = {
      id: item.id,
      status: 'ready',
      expanded: true,
      distance,
      minutes,
      steps: [],
      desc: `从当前位置出发，沿校园道路步行前往${item.name}，全程约 ${formatDistance(distance)}，步行约 ${minutes} 分钟。`,
      sourceText: '估算路线',
      note: noteText || '示例数据模式：路线按距离估算，仅供参考。'
    };
    refreshInfo();
    updateLocalMarkerState();
  }

  /**
   * 生成路线面板 HTML。
   * @param {Object} item - 餐厅对象
   * @returns {string} 路线面板 HTML
   */
  function routePanelHtml(item) {
    const route = state.route;
    if (route.id !== item.id || route.status === 'idle') return '';
    if (route.status === 'loading') {
      return '<div class="route-panel"><p class="route-loading">正在获取步行路线…</p></div>';
    }
    const summary = `<div class="route-summary"><strong>约 ${formatDistance(route.distance)}</strong><span>步行约 ${route.minutes} 分钟</span><em>${esc(route.sourceText)}</em></div>`;
    if (!route.expanded) return `<div class="route-panel is-collapsed">${summary}</div>`;
    const steps = route.steps && route.steps.length
      ? `<ol class="route-steps">${route.steps.map((text) => `<li>${esc(text)}</li>`).join('')}</ol>`
      : `<p class="route-desc">${esc(route.desc)}</p>`;
    return `<div class="route-panel">${summary}${steps}${route.note ? `<p class="route-note">${esc(route.note)}</p>` : ''}</div>`;
  }

  /**
   * 刷新当前选中餐厅的详情内容。
   * @returns {void}
   */
  function refreshInfo() {
    const item = findById(state.selectedId);
    if (!item) return;
    if (state.mapMode === 'amap' && state.amapInfo) {
      state.amapInfo.setContent(infoHtml(item));
      if (state.amapInfo.getIsOpen && !state.amapInfo.getIsOpen()) {
        state.amapInfo.open(state.amap, [item.lng, item.lat]);
      }
    } else {
      showLocalInfo(item);
    }
  }

  /**
   * 去除字符串中的 HTML 标签。
   * @param {string} text - 原始文本
   * @returns {string} 纯文本
   */
  function stripHtml(text) {
    return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * 尝试加载高德地图，失败时保留本地示意地图。
   * @returns {Promise<void>} 初始化完成
   */
  async function tryAmap() {
    if (!KEY) {
      setMapBadge('本地示意地图 · 未配置 Key', true);
      if (dom.mapTip) dom.mapTip.textContent = '本地示意地图 · 未配置高德 Key，可拖动、缩放、点击红点查看详情';
      return;
    }
    showMapLoading(true);
    setMapBadge('正在连接高德地图…', false);
    dom.amapMap.classList.add('is-active');
    let map = null;
    try {
      await loadAmapScript();
      map = new window.AMap.Map('amapMap', {
        zoom: 15,
        zooms: [12, 18],
        center: [state.center.lng, state.center.lat],
        viewMode: '2D',
        resizeEnable: true,
        enableHighResolution: false,
        fadeEffect: false
      });
      const ready = await waitMapReady(map);
      if (!ready) throw new Error('地图初始化超时');
      if (!isAmapRendered()) throw new Error('地图图层渲染失败');
      state.amap = map;
      state.mapMode = 'amap';
      dom.localMap.classList.add('is-hidden');
      setMapBadge('高德地图 JS API');
      state.amapInfo = new window.AMap.InfoWindow({
        offset: new window.AMap.Pixel(0, -34),
        anchor: 'bottom-center',
        closeWhenClickMap: true
      });
      state.amapInfo.on('close', () => {
        state.selectedId = null;
        resetRoute();
        markCards();
        updateAmapMarkersActive();
      });
      renderAMapMarkers();
    } catch (err) {
      state.mapMode = 'local';
      state.amap = null;
      if (map) {
        try { map.destroy(); } catch (destroyErr) { /* ignore */ }
      }
      dom.amapMap.classList.remove('is-active');
      dom.amapMap.innerHTML = '';
      dom.localMap.classList.remove('is-hidden');
      setMapBadge('本地示意地图 · 高德不可用', true);
      if (dom.mapTip) dom.mapTip.textContent = '本地示意地图 · 高德地图不可用，可拖动、缩放、点击红点查看详情';
      note(`高德地图 JS API 不可用（${reasonText(err)}，可能是 Key 未开通 JS API 权限），已切换为可交互的本地示意地图，餐厅标记与详情功能正常。`);
    } finally {
      showMapLoading(false);
    }
  }

  /**
   * 动态加载高德地图脚本。
   * @returns {Promise<void>} 脚本加载完成
   */
  function loadAmapScript() {
    if (window.AMap) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(KEY)}`;
      script.async = true;
      const timer = setTimeout(() => reject(new Error('地图脚本加载超时')), 8000);
      script.addEventListener('load', () => {
        clearTimeout(timer);
        if (window.AMap) resolve();
        else reject(new Error('地图脚本不可用'));
      });
      script.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('地图脚本加载失败'));
      });
      document.head.appendChild(script);
    });
  }

  /**
   * 检查高德地图图层是否成功渲染。
   * @returns {boolean} 渲染成功返回 true
   */
  function isAmapRendered() {
    const container = dom.amapMap;
    if (!container) return false;
    if (/INVALID|USERKEY|USER_KEY|无效|校验失败|权限不足/i.test(container.textContent || '')) return false;
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.width > 0 && canvas.height > 0) return true;
    return container.querySelectorAll('img').length > 0;
  }

  /**
   * 等待高德地图就绪。
   * @param {Object} map - 高德地图实例
   * @returns {Promise<boolean>} 就绪返回 true
   */
  function waitMapReady(map) {
    return new Promise((resolve) => {
      let done = false;
      /**
       * 结束等待并返回结果。
       * @param {boolean} ok - 是否就绪
       * @returns {void}
       */
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      try {
        map.on('complete', () => finish(true));
        map.on('error', () => finish(false));
      } catch (err) { /* ignore */ }
      setTimeout(() => finish(false), AMAP_READY_TIMEOUT);
    });
  }

  /**
   * 渲染高德地图餐厅标记（分批加载）。
   * @returns {void}
   */
  function renderAMapMarkers() {
    if (!state.amap || !window.AMap) return;
    state.markerBatchToken += 1;
    const token = state.markerBatchToken;
    clearAmapMarkers();
    const list = sortedList();
    let index = 0;
    const batchSize = 6;

    /**
     * 追加一批标记。
     * @returns {void}
     */
    const addBatch = () => {
      if (state.markerBatchToken !== token || !state.amap) return;
      const end = Math.min(index + batchSize, list.length);
      list.slice(index, end).forEach((item) => {
        const marker = new window.AMap.Marker({
          position: [item.lng, item.lat],
          title: item.name,
          anchor: 'bottom-center',
          zIndex: 100 + index,
          content: pinHtml(index + 1, item.id === state.selectedId)
        });
        marker.on('click', () => selectRestaurant(item.id, 'map'));
        state.amap.add(marker);
        state.amapMarkers.push({ marker, id: item.id });
        index += 1;
      });
      if (index < list.length) {
        if (window.requestAnimationFrame) window.requestAnimationFrame(addBatch);
        else setTimeout(addBatch, 16);
      }
    };

    addBatch();
  }

  /**
   * 清除高德地图标记。
   * @returns {void}
   */
  function clearAmapMarkers() {
    if (!state.amap) {
      state.amapMarkers = [];
      return;
    }
    state.amapMarkers.forEach((entry) => {
      try { state.amap.remove(entry.marker); } catch (err) { /* ignore */ }
    });
    state.amapMarkers = [];
  }

  /**
   * 生成高德地图标记 HTML。
   * @param {number} index - 标记序号
   * @param {boolean} active - 是否选中
   * @returns {string} 标记 HTML
   */
  function pinHtml(index, active) {
    return `<div class="amap-pin${active ? ' is-active' : ''}"><span>${index}</span></div>`;
  }

  /**
   * 更新高德地图标记的选中态。
   * @returns {void}
   */
  function updateAmapMarkersActive() {
    state.amapMarkers.forEach((entry) => {
      if (entry.marker.setContent) {
        entry.marker.setContent(pinHtml(indexOfMarker(entry.id), entry.id === state.selectedId));
      }
    });
  }

  /**
   * 获取餐厅在标记列表中的序号。
   * @param {string} id - 餐厅 ID
   * @returns {number} 1 起始序号，未找到返回 0
   */
  function indexOfMarker(id) {
    const list = sortedList();
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return i + 1;
    }
    return 0;
  }

  /**
   * 打开高德地图信息窗口。
   * @param {Object} item - 餐厅对象
   * @returns {void}
   */
  function openAmapInfo(item) {
    if (!state.amap || !state.amapInfo) return;
    state.amapInfo.setContent(infoHtml(item));
    state.amapInfo.open(state.amap, [item.lng, item.lat]);
  }

  /**
   * 计算两点间球面距离。
   * @param {{lng:number,lat:number}} a - 起点
   * @param {{lng:number,lat:number}} b - 终点
   * @returns {number} 距离（米）
   */
  function haversine(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /**
   * 格式化距离展示。
   * @param {number} meters - 距离（米）
   * @returns {string} 格式化距离文本
   */
  function formatDistance(meters) {
    if (!isFinite(meters) || meters < 0) return '—';
    if (meters < 1000) return `${Math.round(meters)} 米`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} 公里`;
  }

  /**
   * 将错误转换为可读文案。
   * @param {Error} err - 错误对象
   * @returns {string} 错误文案
   */
  function reasonText(err) {
    if (!err) return '未知错误';
    if (err.name === 'AbortError') return '请求超时';
    if (err instanceof TypeError) return '网络不可达';
    return err.message || String(err);
  }

  /**
   * 转义 HTML 特殊字符。
   * @param {*} value - 原始值
   * @returns {string} 转义后的字符串
   */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }
})();