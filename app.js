(function () {
  'use strict';

  var MOCK = window.MOCK_DATA || {};
  var MOCK_LOCATION = MOCK.location || { lng: 116.3106, lat: 39.9929, address: '示例位置', city: '' };
  var MOCK_RESTAURANTS = Array.isArray(MOCK.restaurants) ? MOCK.restaurants : [];
  var CONFIG = window.APP_CONFIG || {};
  var KEY = String(CONFIG.amapKey || '').trim();
  var REST = 'https://restapi.amap.com/v3';
  var BASE_SPAN_LNG = 0.018;
  var AMAP_READY_TIMEOUT = 6500;
  var FAVORITES_STORAGE_KEY = 'campus-food-favorites:v1';
  var FAVORITES_LIMIT = 20;
  var FAVORITE_TOAST = {
    added: '已添加收藏',
    removed: '已取消收藏',
    failed: '操作失败，请重试',
    full: '收藏夹已满（最多20家）'
  };
  var RECENT_SEARCH_STORAGE_KEY = 'campus-food-recent-searches:v1';
  var RECENT_SEARCH_LIMIT = 8;
  var RECENT_SEARCH_MAX_LENGTH = 50;
  var RECENT_SEARCH_TOAST = { cleared: '已清空最近搜索' };
  var toastTimer = null;

  var dom = {};

  var state = {
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

  var TASTE_RULES = [
    { taste: '川菜', keys: ['川菜', '湘菜', '火锅', '麻辣', '酸菜鱼'] },
    { taste: '粤菜', keys: ['粤菜', '烧腊', '港式', '潮汕', '粥'] },
    { taste: '日料', keys: ['日料', '日本', '寿司', '拉面', '居酒屋'] },
    { taste: '西餐', keys: ['西餐', '披萨', '牛排', '意面', '烘焙', '甜品'] },
    { taste: '奶茶', keys: ['奶茶', '茶饮', '饮品', '咖啡', '水果茶'] },
    { taste: '小吃', keys: ['小吃', '快餐', '面馆', '米线', '包子', '饺子', '烧烤', '麻辣烫', '煎饼'] }
  ];

  var PRICE_GUESS = { 川菜: 55, 粤菜: 48, 日料: 65, 西餐: 75, 奶茶: 18, 小吃: 25 };

  document.addEventListener('DOMContentLoaded', boot);

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

  function bindEvents() {
    dom.searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      handleSearchSubmit(dom.searchInput.value);
    });

    if (dom.recentSearch) {
      dom.recentSearch.addEventListener('click', function (event) {
        if (event.target.closest('#recentClear')) {
          clearRecentSearches();
          return;
        }
        var tag = event.target.closest('.recent-tag');
        if (!tag) return;
        var keyword = tag.getAttribute('data-keyword');
        dom.searchInput.value = keyword;
        handleSearchSubmit(keyword);
      });
    }

    dom.filterBar.addEventListener('click', function (event) {
      var priceBtn = event.target.closest('[data-price]');
      if (priceBtn) {
        state.price = priceBtn.getAttribute('data-price');
        syncFilterButtons();
        applyFilters();
        return;
      }
      var tasteBtn = event.target.closest('[data-taste]');
      if (tasteBtn) {
        state.taste = tasteBtn.getAttribute('data-taste');
        syncFilterButtons();
        applyFilters();
      }
    });

    document.addEventListener('click', function (event) {
      var routeBtn = event.target.closest('.route-btn');
      if (routeBtn) {
        event.preventDefault();
        handleRouteClick(routeBtn.getAttribute('data-id'));
      }
    });

    dom.sortDistance.addEventListener('click', function () { setSort('distance'); });
    dom.sortRating.addEventListener('click', function () { setSort('rating'); });

    dom.cardList.addEventListener('click', function (event) {
      var favBtn = event.target.closest('.fav-btn');
      if (favBtn) {
        event.preventDefault();
        event.stopPropagation();
        var favId = favBtn.getAttribute('data-id');
        toggleFavorite(favId, isFavorite(favId) ? 'remove' : 'add');
        return;
      }
      var card = event.target.closest('.card');
      if (card) selectRestaurant(card.getAttribute('data-id'), 'list');
    });

    dom.cardList.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.fav-btn')) return;
      var card = event.target.closest('.card');
      if (!card) return;
      event.preventDefault();
      selectRestaurant(card.getAttribute('data-id'), 'list');
    });

    if (dom.favoriteList) {
      dom.favoriteList.addEventListener('click', function (event) {
        var row = event.target.closest('.favorite-item');
        if (!row) return;
        event.preventDefault();
        focusFavorite(row.getAttribute('data-id'));
      });

      dom.favoriteList.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var row = event.target.closest('.favorite-item');
        if (!row) return;
        event.preventDefault();
        focusFavorite(row.getAttribute('data-id'));
      });
    }

    dom.localInfo.addEventListener('click', function (event) {
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

    dom.zoomIn.addEventListener('click', function (event) {
      event.stopPropagation();
      setZoom(state.local.zoom * 1.2);
    });
    dom.zoomOut.addEventListener('click', function (event) {
      event.stopPropagation();
      setZoom(state.local.zoom / 1.2);
    });
    dom.zoomReset.addEventListener('click', function (event) {
      event.stopPropagation();
      state.local.zoom = 1;
      state.local.offsetX = 0;
      state.local.offsetY = 0;
      applyLocalTransform();
    });

    window.addEventListener('resize', function () {
      if (state.mapMode === 'local') renderLocalMarkers();
    });
  }

  function syncFilterButtons() {
    if (!dom.filterBar) return;
    var priceButtons = dom.filterBar.querySelectorAll('[data-price]');
    for (var i = 0; i < priceButtons.length; i++) {
      priceButtons[i].classList.toggle('is-active', priceButtons[i].getAttribute('data-price') === state.price);
    }
    var tasteButtons = dom.filterBar.querySelectorAll('[data-taste]');
    for (var j = 0; j < tasteButtons.length; j++) {
      tasteButtons[j].classList.toggle('is-active', tasteButtons[j].getAttribute('data-taste') === state.taste);
    }
  }

  function matchPrice(item) {
    if (state.price === 'low') return item.price != null && item.price < 30;
    if (state.price === 'mid') return item.price != null && item.price >= 30 && item.price <= 80;
    if (state.price === 'high') return item.price != null && item.price > 80;
    return true;
  }

  function matchTaste(item) {
    return state.taste === 'all' || item.taste === state.taste;
  }

  function applyFilters() {
    var list = sortedList();
    var visible = false;
    for (var i = 0; i < list.length; i++) {
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

  function setSearching(active) {
    if (!dom.searchBtn) return;
    dom.searchBtn.disabled = active;
    dom.searchBtn.textContent = active ? '搜索中…' : '搜索';
  }

  function note(message) {
    if (!dom.notice) return;
    dom.notice.textContent = message;
    dom.notice.hidden = false;
  }

  function clearNote() {
    if (!dom.notice) return;
    dom.notice.hidden = true;
    dom.notice.textContent = '';
  }

  function setMapBadge(text, isLocal) {
    if (!dom.mapBadge) return;
    dom.mapBadge.textContent = text;
    dom.mapBadge.classList.toggle('is-local', !!isLocal);
  }

  function showMapLoading(active) {
    if (!dom.mapLoading) return;
    dom.mapLoading.classList.toggle('is-visible', !!active);
    dom.mapLoading.hidden = !active;
  }

  function renderAddress() {
    dom.addressText.textContent = state.address;
    dom.addressSub.textContent = state.addressSub;
    dom.addressBadge.hidden = !state.isMockLocation;
  }

  function renderMeta() {
    var list = sortedList();
    var total = state.restaurants.length;
    var near = list.filter(function (item) { return item.distance < 1000; }).length;
    var countText = list.length === total
      ? total + ' 家'
      : list.length + ' 家（共 ' + total + ' 家）';
    dom.resultMeta.textContent = countText + ' · ' +
      (state.isMockData ? '示例数据' : '高德实时数据') + ' · 1 公里内 ' + near + ' 家';
  }

  function sortedList() {
    var list = state.restaurants.filter(function (item) {
      return matchPrice(item) && matchTaste(item);
    });
    if (state.sort === 'rating') {
      list.sort(function (a, b) {
        return (b.rating == null ? -1 : b.rating) - (a.rating == null ? -1 : a.rating) ||
          a.distance - b.distance;
      });
    } else {
      list.sort(function (a, b) {
        return a.distance - b.distance ||
          (b.rating == null ? -1 : b.rating) - (a.rating == null ? -1 : a.rating);
      });
    }
    return list;
  }

  function renderList() {
    var list = sortedList();
    if (!list.length) {
      dom.cardList.innerHTML = '';
      dom.emptyState.hidden = false;
      return;
    }
    dom.emptyState.hidden = true;
    dom.cardList.innerHTML = list.map(function (item, index) {
      var active = item.id === state.selectedId;
      var favorite = isFavorite(item.id);
      var score = item.rating == null ? '—' : item.rating.toFixed(1);
      var price = item.price == null ? '—' : item.price;
      return '<li class="card' + (active ? ' is-active' : '') + '" data-id="' + esc(item.id) +
        '" tabindex="0" role="button" aria-selected="' + active + '">' +
        '<div class="card-top">' +
        '<span class="card-name"><span class="card-index">' + (index + 1) + '</span>' + esc(item.name) + '</span>' +
        '<span class="card-score">★ ' + score + '</span>' +
        '<button class="fav-btn' + (favorite ? ' is-active' : '') + '" type="button" data-id="' +
        esc(item.id) + '" aria-pressed="' + favorite + '" aria-label="' +
        (favorite ? '取消收藏' : '收藏') + '">' + (favorite ? '♥' : '♡') + '</button>' +
        '</div>' +
        '<div class="card-meta">' +
        '<span class="meta-item">🛣 ' + formatDistance(item.distance) + '</span>' +
        '<span class="meta-item">💰 人均 ' + price + ' 元</span>' +
        '<span class="meta-item taste">' + esc(item.taste) + '</span>' +
        '</div>' +
        (item.address ? '<div class="card-addr">' + esc(item.address) + '</div>' : '') +
        (item.reason ? '<div class="card-reason"><b>推荐</b><span>' + esc(item.reason) + '</span></div>' : '') +
        '</li>';
    }).join('');
  }

  function markCards() {
    var cards = dom.cardList.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var active = cards[i].getAttribute('data-id') === state.selectedId;
      cards[i].classList.toggle('is-active', active);
      cards[i].setAttribute('aria-selected', String(active));
    }
  }

  function selectRestaurant(id, source) {
    var item = findById(id);
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

  function findById(id) {
    for (var i = 0; i < state.restaurants.length; i++) {
      if (state.restaurants[i].id === id) return state.restaurants[i];
    }
    return null;
  }

  function readFavorites() {
    try {
      var raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bad favorites');
      var seen = {};
      var list = [];
      for (var i = 0; i < parsed.length && list.length < FAVORITES_LIMIT; i++) {
        var entry = parsed[i];
        if (!entry || typeof entry !== 'object') continue;
        var id = typeof entry.id === 'string' ? entry.id : '';
        if (!id || seen[id]) continue;
        seen[id] = true;
        list.push({
          id: id,
          name: typeof entry.name === 'string' ? entry.name : '',
          taste: typeof entry.taste === 'string' ? entry.taste : '',
          price: typeof entry.price === 'number' && isFinite(entry.price) ? entry.price : null,
          lng: typeof entry.lng === 'number' && isFinite(entry.lng) ? entry.lng : null,
          lat: typeof entry.lat === 'number' && isFinite(entry.lat) ? entry.lat : null,
          address: typeof entry.address === 'string' ? entry.address : '',
          addedAt: typeof entry.addedAt === 'number' && isFinite(entry.addedAt) ? entry.addedAt : 0
        });
      }
      return list;
    } catch (err) {
      try { localStorage.removeItem(FAVORITES_STORAGE_KEY); } catch (removeErr) { /* ignore */ }
      return [];
    }
  }

  function writeFavorites(list) {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }

  function isFavorite(id) {
    return !!findFavorite(id);
  }

  function findFavorite(id) {
    for (var i = 0; i < state.favorites.length; i++) {
      if (state.favorites[i].id === id) return state.favorites[i];
    }
    return null;
  }

  function toggleFavorite(id, action) {
    if (typeof id !== 'string' || !id.trim()) {
      showToast(FAVORITE_TOAST.failed, 'error');
      return;
    }
    if (action !== 'add' && action !== 'remove') {
      showToast(FAVORITE_TOAST.failed, 'error');
      return;
    }
    var previous = state.favorites.slice();
    if (action === 'add') {
      if (isFavorite(id)) {
        showToast(FAVORITE_TOAST.added);
        return;
      }
      if (state.favorites.length >= FAVORITES_LIMIT) {
        showToast(FAVORITE_TOAST.full, 'error');
        return;
      }
      var item = findById(id);
      if (!item) {
        showToast(FAVORITE_TOAST.failed, 'error');
        return;
      }
      state.favorites.push({
        id: item.id,
        name: item.name || '',
        taste: item.taste || '',
        price: typeof item.price === 'number' ? item.price : null,
        lng: item.lng,
        lat: item.lat,
        address: item.address || '',
        addedAt: Date.now()
      });
    } else {
      state.favorites = state.favorites.filter(function (entry) {
        return entry.id !== id;
      });
    }
    if (!writeFavorites(state.favorites)) {
      state.favorites = previous;
      showToast(FAVORITE_TOAST.failed, 'error');
      return;
    }
    refreshFavoriteViews();
    showToast(action === 'add' ? FAVORITE_TOAST.added : FAVORITE_TOAST.removed);
  }

  function ensureFavoriteVisible(id) {
    var item = findById(id);
    if (item) return item;
    var favorite = findFavorite(id);
    if (!favorite) return null;
    var lng = Number(favorite.lng);
    var lat = Number(favorite.lat);
    if (!isFinite(lng) || !isFinite(lat)) return null;
    var restored = {
      id: favorite.id,
      name: favorite.name || '未命名餐厅',
      taste: favorite.taste || '美食',
      price: typeof favorite.price === 'number' ? favorite.price : null,
      rating: null,
      lng: lng,
      lat: lat,
      address: favorite.address || '',
      distance: Math.max(10, Math.round(haversine(state.center, { lng: lng, lat: lat }))),
      source: 'favorite',
      reason: ''
    };
    state.restaurants.push(restored);
    return restored;
  }

  function focusFavorite(id) {
    var item = ensureFavoriteVisible(id);
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

  function renderFavorites() {
    if (!dom.favoriteList || !dom.favoritesEmpty || !dom.favCount) return;
    var count = state.favorites.length;
    dom.favCount.textContent = count + '/' + FAVORITES_LIMIT;
    dom.favCount.classList.toggle('is-full', count >= FAVORITES_LIMIT);
    if (!count) {
      dom.favoriteList.innerHTML = '';
      dom.favoritesEmpty.hidden = false;
      return;
    }
    dom.favoritesEmpty.hidden = true;
    dom.favoriteList.innerHTML = state.favorites.map(function (favorite) {
      var live = findById(favorite.id);
      var item = live || favorite;
      var name = item.name || '未命名餐厅';
      var taste = item.taste || '美食';
      var priceText = item.price == null ? '—' : item.price + ' 元';
      return '<li class="favorite-item" data-id="' + esc(favorite.id) + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(name) + '，查看并在地图定位">' +
        '<span class="favorite-item-name">' + esc(name) + '</span>' +
        '<span class="favorite-item-meta">' + esc(taste) + ' · 人均 ' + esc(priceText) + '</span>' +
        '</li>';
    }).join('');
  }

  function refreshFavoriteViews() {
    renderList();
    renderFavorites();
    markCards();
  }

  function showToast(message, type) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.remove('is-visible');
    dom.toast.classList.toggle('is-error', type === 'error');
    if (toastTimer) clearTimeout(toastTimer);
    var reveal = function () { dom.toast.classList.add('is-visible'); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(reveal);
    else reveal();
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove('is-visible');
      toastTimer = setTimeout(function () {
        dom.toast.hidden = true;
        dom.toast.textContent = '';
      }, 200);
    }, type === 'error' ? 2600 : 2000);
  }

  function readRecentSearches() {
    try {
      var raw = localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('bad recent searches');
      var seen = {};
      var list = [];
      for (var i = 0; i < parsed.length && list.length < RECENT_SEARCH_LIMIT; i++) {
        var value = parsed[i];
        if (typeof value !== 'string') continue;
        var keyword = value.trim();
        if (!keyword) continue;
        keyword = keyword.slice(0, RECENT_SEARCH_MAX_LENGTH);
        if (seen[keyword]) continue;
        seen[keyword] = true;
        list.push(keyword);
      }
      return list;
    } catch (err) {
      try { localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY); } catch (removeErr) { /* ignore */ }
      return [];
    }
  }

  function writeRecentSearches(list) {
    try {
      localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }

  function rememberSearchKeyword(rawValue) {
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) return;
    var record = trimmed.slice(0, RECENT_SEARCH_MAX_LENGTH);
    state.recentSearches = state.recentSearches.filter(function (item) {
      return item !== record;
    });
    state.recentSearches.unshift(record);
    state.recentSearches = state.recentSearches.slice(0, RECENT_SEARCH_LIMIT);
    writeRecentSearches(state.recentSearches);
    renderRecentSearches();
  }

  function clearRecentSearches() {
    state.recentSearches = [];
    writeRecentSearches([]);
    renderRecentSearches();
    showToast(RECENT_SEARCH_TOAST.cleared);
  }

  function renderRecentSearches() {
    if (!dom.recentSearch || !dom.recentTags) return;
    if (!state.recentSearches.length) {
      dom.recentTags.innerHTML = '';
      dom.recentSearch.hidden = true;
      return;
    }
    dom.recentTags.innerHTML = state.recentSearches.map(function (keyword) {
      return '<button class="recent-tag" type="button" data-keyword="' + esc(keyword) + '">' +
        esc(keyword) + '</button>';
    }).join('');
    dom.recentSearch.hidden = false;
  }

  function handleSearchSubmit(rawValue) {
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) {
      state.keyword = '';
      searchPlaces();
      return;
    }
    rememberSearchKeyword(trimmed);
    state.keyword = trimmed;
    searchPlaces();
  }

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
      var ip = await fetchJSON(REST + '/ip?key=' + encodeURIComponent(KEY));
      if (!ip || String(ip.status) !== '1') throw new Error('IP 定位无结果');
      var city = pickCity(ip);
      if (!city) throw new Error('IP 定位未返回城市');
      state.city = city;
      var center = rectangleCenter(ip.rectangle);
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

  async function resolveAddress() {
    try {
      var url = REST + '/geocode/regeo?key=' + encodeURIComponent(KEY) +
        '&location=' + state.center.lng + ',' + state.center.lat + '&extensions=base&radius=1000';
      var result = await fetchJSON(url);
      var regeo = result && result.regeocode;
      var address = regeo && regeo.formatted_address;
      if (Array.isArray(address)) address = address.join('');
      if (typeof address === 'string' && address.trim()) {
        state.address = address.trim();
        state.addressSub = state.city + ' · 高德 IP 定位（精度有限）';
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

  function useFallbackLocation(err) {
    state.center = { lng: MOCK_LOCATION.lng, lat: MOCK_LOCATION.lat };
    state.city = MOCK_LOCATION.city || '';
    state.address = MOCK_LOCATION.address || '示例位置';
    state.addressSub = '示例位置 · ' + reasonText(err);
    state.isMockLocation = true;
    state.useMockData = true;
    renderAddress();
    applyMockData('', false);
    note('定位失败（' + reasonText(err) + '），已切换到示例位置与示例餐厅数据，地图、搜索与详情功能均可演示。');
    syncMapCenter();
  }

  async function searchPlaces(options) {
    options = options || {};
    var keyword = state.keyword;
    if (state.useMockData || !KEY) {
      applyMockData(keyword, !options.initial);
      return;
    }
    setSearching(true);
    clearNote();
    try {
      var url = REST + '/place/text?key=' + encodeURIComponent(KEY) +
        '&keywords=' + encodeURIComponent(keyword || '美食') +
        '&types=050000&offset=25&page=1&extensions=all' +
        '&city=' + encodeURIComponent(state.city) + '&citylimit=false';
      var result = await fetchJSON(url);
      var pois = result && Array.isArray(result.pois) ? result.pois : [];
      var items = pois.filter(hasLocation).map(normalizePoi);
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
      note('真实搜索不可用（' + reasonText(err) + '），已展示示例餐厅数据，功能可完整演示。');
    } finally {
      setSearching(false);
    }
  }

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
      note('示例数据中匹配“' + keyword + '”的餐厅已展示，真实接口恢复后会自动切换。');
    }
    syncMapCenter();
  }

  function buildMockRestaurants(keyword) {
    var list = MOCK_RESTAURANTS.map(toMockRestaurant);
    if (!keyword) return list;
    var filtered = list.filter(function (item) {
      return item.name.indexOf(keyword) >= 0 || item.taste.indexOf(keyword) >= 0 ||
        item.address.indexOf(keyword) >= 0;
    });
    return filtered.length ? filtered : list;
  }

  function toMockRestaurant(raw) {
    var lng = Number(raw.lng) + (state.center.lng - Number(MOCK_LOCATION.lng));
    var lat = Number(raw.lat) + (state.center.lat - Number(MOCK_LOCATION.lat));
    var item = {
      id: raw.id,
      name: raw.name,
      taste: raw.taste || '美食',
      price: typeof raw.price === 'number' ? raw.price : null,
      rating: typeof raw.rating === 'number' ? raw.rating : null,
      lng: lng,
      lat: lat,
      address: raw.address || '',
      distance: Math.max(10, Math.round(haversine(state.center, { lng: lng, lat: lat }))),
      source: 'mock',
      reason: ''
    };
    item.reason = buildReason(item);
    return item;
  }

  function resolveDistance(poi, lng, lat) {
    var distance = parseFloat(poi && poi.distance);
    if (!isFinite(distance) || distance <= 0) {
      distance = parseFloat(poi && poi._distance);
    }
    if (!isFinite(distance) || distance <= 0) {
      distance = haversine(state.center, { lng: lng, lat: lat });
    }
    if (!isFinite(distance) || distance <= 0) distance = 10;
    return Math.max(10, Math.round(distance));
  }

  function normalizePoi(poi, index) {
    var pair = String(poi.location || '').split(',');
    var lng = parseFloat(pair[0]);
    var lat = parseFloat(pair[1]);
    var distance = resolveDistance(poi, lng, lat);
    var taste = detectTaste(poi);
    var cost = parseFloat(poi.biz_ext && poi.biz_ext.cost);
    var rating = parseFloat(poi.biz_ext && poi.biz_ext.rating);
    var item = {
      id: 'amap-' + String(poi.id || index),
      name: poi.name || '未命名餐厅',
      taste: taste,
      price: isFinite(cost) && cost > 0 ? Math.round(cost) : (PRICE_GUESS[taste] || 45),
      rating: isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
      lng: lng,
      lat: lat,
      address: typeof poi.address === 'string' ? poi.address : '',
      distance: distance,
      source: 'amap',
      reason: ''
    };
    item.reason = buildReason(item);
    return item;
  }

  function detectTaste(poi) {
    var text = String(poi.type || '') + ' ' + String(poi.name || '');
    for (var i = 0; i < TASTE_RULES.length; i++) {
      var rule = TASTE_RULES[i];
      for (var j = 0; j < rule.keys.length; j++) {
        if (text.indexOf(rule.keys[j]) >= 0) return rule.taste;
      }
    }
    var type = String(poi.type || '');
    if (type.indexOf(';') >= 0) {
      var parts = type.split(';').filter(function (part) { return part.trim(); });
      if (parts.length) return parts[parts.length - 1].trim();
    }
    return '美食';
  }

  function buildReason(item) {
    var parts = [];
    var minutes = Math.max(1, Math.round(item.distance / 75));
    if (item.distance < 600) {
      parts.push('步行约 ' + minutes + ' 分钟即到');
    } else if (item.distance < 1500) {
      parts.push('步行约 ' + minutes + ' 分钟');
    } else {
      parts.push('距离 ' + formatDistance(item.distance) + '，建议骑行');
    }
    if (item.price != null) {
      if (item.price < 30) parts.push('平价人均 ' + item.price + ' 元');
      else if (item.price <= 80) parts.push('人均 ' + item.price + ' 元');
      else parts.push('人均 ' + item.price + ' 元偏高');
    }
    if (item.rating != null) {
      if (item.rating >= 4.5) parts.push('评分 ' + item.rating.toFixed(1) + ' 口碑好');
      else if (item.rating >= 4.0) parts.push('评分 ' + item.rating.toFixed(1));
      else parts.push('评分 ' + item.rating.toFixed(1) + ' 胜在实惠');
    }
    if (item.taste) parts.push('主打' + item.taste);
    return parts.join(' · ');
  }

  function hasLocation(poi) {
    var pair = String(poi.location || '').split(',');
    return pair.length === 2 && isFinite(parseFloat(pair[0])) && isFinite(parseFloat(pair[1]));
  }

  function dedupe(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = item.name + '|' + item.lng.toFixed(4) + ',' + item.lat.toFixed(4);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function pickCity(ip) {
    if (typeof ip.city === 'string' && ip.city) return ip.city;
    if (Array.isArray(ip.city) && ip.city.length) return String(ip.city[0]);
    if (typeof ip.province === 'string' && ip.province) return ip.province;
    return '';
  }

  function rectangleCenter(rectangle) {
    if (typeof rectangle !== 'string' || rectangle.indexOf(';') < 0) return null;
    var corners = rectangle.split(';');
    var first = corners[0].split(',');
    var second = corners[1].split(',');
    var lng1 = parseFloat(first[0]);
    var lat1 = parseFloat(first[1]);
    var lng2 = parseFloat(second[0]);
    var lat2 = parseFloat(second[1]);
    if (!isFinite(lng1) || !isFinite(lat1) || !isFinite(lng2) || !isFinite(lat2)) return null;
    return { lng: (lng1 + lng2) / 2, lat: (lat1 + lat2) / 2 };
  }

  async function cityCenter(city) {
    try {
      var result = await fetchJSON(REST + '/geocode/geo?key=' + encodeURIComponent(KEY) +
        '&address=' + encodeURIComponent(city));
      var geo = result && result.geocodes && result.geocodes[0];
      var pair = geo && String(geo.location || '').split(',');
      var lng = pair ? parseFloat(pair[0]) : NaN;
      var lat = pair ? parseFloat(pair[1]) : NaN;
      if (isFinite(lng) && isFinite(lat)) return { lng: lng, lat: lat };
    } catch (err) { /* ignore */ }
    return null;
  }

  async function fetchJSON(url, timeout) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout || 9000);
    try {
      var response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

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

  function currentSpan() {
    var maxDistance = 0;
    state.restaurants.forEach(function (item) {
      var distance = haversine(state.center, { lng: item.lng, lat: item.lat });
      if (distance > maxDistance) maxDistance = distance;
    });
    return Math.max(BASE_SPAN_LNG, (maxDistance * 2.4) / 85000);
  }

  function project(point) {
    var width = dom.localMap.clientWidth || 600;
    var height = dom.localMap.clientHeight || 400;
    var pxPerLng = width / currentSpan();
    var pxPerLat = pxPerLng / Math.max(0.25, Math.cos(state.center.lat * Math.PI / 180));
    return {
      x: width * 1.5 + (point.lng - state.center.lng) * pxPerLng,
      y: height * 1.5 - (point.lat - state.center.lat) * pxPerLat
    };
  }

  function renderLocalMarkers() {
    if (!dom.localMarkers) return;
    var list = sortedList();
    var width = dom.localMap.clientWidth || 600;
    var height = dom.localMap.clientHeight || 400;
    var pxPerLng = width / currentSpan();
    var pxPerLat = pxPerLng / Math.max(0.25, Math.cos(state.center.lat * Math.PI / 180));
    dom.localMarkers.innerHTML = '';
    list.forEach(function (item, index) {
      var pos = {
        x: width * 1.5 + (item.lng - state.center.lng) * pxPerLng,
        y: height * 1.5 - (item.lat - state.center.lat) * pxPerLat
      };
      var marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'marker' + (item.id === state.selectedId ? ' is-active' : '');
      marker.setAttribute('data-id', item.id);
      marker.style.left = pos.x + 'px';
      marker.style.top = pos.y + 'px';
      marker.textContent = String(index + 1);
      marker.title = item.name + ' · ' + formatDistance(item.distance);
      marker.setAttribute('aria-label', item.name + '，点击查看详情');
      marker.addEventListener('click', function (event) {
        event.stopPropagation();
        selectRestaurant(item.id, 'map');
      });
      dom.localMarkers.appendChild(marker);
    });
    applyLocalTransform();
  }

  function applyLocalTransform() {
    if (!dom.localPlane) return;
    dom.localPlane.style.transform = 'translate(' + state.local.offsetX + 'px,' +
      state.local.offsetY + 'px) scale(' + state.local.zoom + ')';
    var inverse = 1 / state.local.zoom;
    var markers = dom.localMarkers ? dom.localMarkers.children : [];
    for (var i = 0; i < markers.length; i++) {
      markers[i].style.transform = 'translate(-50%,-50%) scale(' + inverse + ')';
    }
  }

  function updateLocalMarkerState() {
    if (!dom.localMarkers) return;
    var markers = dom.localMarkers.children;
    for (var i = 0; i < markers.length; i++) {
      markers[i].classList.toggle('is-active', markers[i].getAttribute('data-id') === state.selectedId);
    }
  }

  function focusLocal(item) {
    var width = dom.localMap.clientWidth || 600;
    var pxPerLng = width / currentSpan();
    var pxPerLat = pxPerLng / Math.max(0.25, Math.cos(state.center.lat * Math.PI / 180));
    var dx = (item.lng - state.center.lng) * pxPerLng;
    var dy = (item.lat - state.center.lat) * pxPerLat;
    state.local.offsetX = -dx * state.local.zoom;
    state.local.offsetY = dy * state.local.zoom;
    applyLocalTransform();
  }

  function setZoom(next) {
    state.local.zoom = Math.min(3.2, Math.max(0.6, next));
    applyLocalTransform();
  }

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

  function onPointerMove(event) {
    if (!state.local.dragging) return;
    var dx = event.clientX - state.local.startX;
    var dy = event.clientY - state.local.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.local.moved = true;
    state.local.offsetX = state.local.baseX + dx;
    state.local.offsetY = state.local.baseY + dy;
    applyLocalTransform();
  }

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

  function onWheel(event) {
    event.preventDefault();
    setZoom(state.local.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
  }

  function showLocalInfo(item) {
    dom.localInfo.innerHTML =
      '<div class="info-top"><h3>' + esc(item.name) + '</h3>' +
      '<button type="button" class="info-close" aria-label="关闭详情">✕</button></div>' +
      infoBody(item);
    dom.localInfo.hidden = false;
  }

  function hideLocalInfo() {
    if (!dom.localInfo) return;
    dom.localInfo.hidden = true;
    dom.localInfo.innerHTML = '';
  }

  function infoBody(item) {
    var chips = [];
    chips.push('🛣 ' + formatDistance(item.distance));
    if (item.price != null) chips.push('💰 人均 ' + item.price + ' 元');
    if (item.rating != null) chips.push('★ ' + item.rating.toFixed(1));
    chips.push('🍽 ' + esc(item.taste));
    var hasRoute = state.route.id === item.id && state.route.status !== 'idle';
    var routeLabel = hasRoute && state.route.expanded ? '收起路线' : (hasRoute ? '展开路线' : '去这里');
    return '<div class="info-meta">' + chips.map(function (text) {
      return '<span>' + text + '</span>';
    }).join('') + '</div>' +
      (item.address ? '<p class="info-addr">' + esc(item.address) + '</p>' : '') +
      (item.reason ? '<p class="info-reason"><b>推荐</b>' + esc(item.reason) + '</p>' : '') +
      '<div class="info-actions"><button class="route-btn" type="button" data-id="' +
      esc(item.id) + '">' + routeLabel + '</button></div>' +
      routePanelHtml(item);
  }

  function infoHtml(item) {
    return '<div class="info-card"><h3>' + esc(item.name) + '</h3>' + infoBody(item) + '</div>';
  }

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

  function handleRouteClick(id) {
    var item = findById(id);
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
      id: id,
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

  async function loadRoute(item) {
    if (!KEY || state.useMockData || state.isMockData) {
      applyEstimatedRoute(item, '');
      return;
    }
    try {
      var url = REST + '/direction/walking?key=' + encodeURIComponent(KEY) +
        '&origin=' + state.center.lng + ',' + state.center.lat +
        '&destination=' + item.lng + ',' + item.lat + '&extensions=base';
      var result = await fetchJSON(url, 9000);
      var path = result && result.route && result.route.paths && result.route.paths[0];
      if (!path || !(Number(path.distance) > 0)) throw new Error('无步行路线');
      if (state.route.id !== item.id) return;
      var steps = (path.steps || []).map(function (step) {
        return stripHtml(step.instruction || '');
      }).filter(function (text) { return text; });
      var distance = Math.round(Number(path.distance));
      var seconds = Number(path.duration);
      var minutes = isFinite(seconds) && seconds > 0
        ? Math.max(1, Math.round(seconds / 60))
        : Math.max(1, Math.round(distance / 75));
      state.route = {
        id: item.id,
        status: 'ready',
        expanded: true,
        distance: distance,
        minutes: minutes,
        steps: steps.slice(0, 4),
        desc: steps.length ? '' : '沿校园周边道路步行前往，全程约 ' + formatDistance(distance) + '。',
        sourceText: '高德步行路线',
        note: ''
      };
      refreshInfo();
      updateLocalMarkerState();
    } catch (err) {
      if (state.route.id !== item.id) return;
      applyEstimatedRoute(item, '路线接口不可用（' + reasonText(err) + '），已按直线距离估算');
    }
  }

  function applyEstimatedRoute(item, note) {
    var distance = Math.max(10, Math.round(item.distance));
    var minutes = Math.max(1, Math.round(distance / 75));
    state.route = {
      id: item.id,
      status: 'ready',
      expanded: true,
      distance: distance,
      minutes: minutes,
      steps: [],
      desc: '从当前位置出发，沿校园道路步行前往' + item.name + '，全程约 ' +
        formatDistance(distance) + '，步行约 ' + minutes + ' 分钟。',
      sourceText: '估算路线',
      note: note || '示例数据模式：路线按距离估算，仅供参考。'
    };
    refreshInfo();
    updateLocalMarkerState();
  }

  function routePanelHtml(item) {
    var route = state.route;
    if (route.id !== item.id || route.status === 'idle') return '';
    if (route.status === 'loading') {
      return '<div class="route-panel"><p class="route-loading">正在获取步行路线…</p></div>';
    }
    var summary = '<div class="route-summary"><strong>约 ' + formatDistance(route.distance) + '</strong>' +
      '<span>步行约 ' + route.minutes + ' 分钟</span>' +
      '<em>' + esc(route.sourceText) + '</em></div>';
    if (!route.expanded) {
      return '<div class="route-panel is-collapsed">' + summary + '</div>';
    }
    var steps = route.steps && route.steps.length
      ? '<ol class="route-steps">' + route.steps.map(function (text) {
        return '<li>' + esc(text) + '</li>';
      }).join('') + '</ol>'
      : '<p class="route-desc">' + esc(route.desc) + '</p>';
    return '<div class="route-panel">' + summary + steps +
      (route.note ? '<p class="route-note">' + esc(route.note) + '</p>' : '') + '</div>';
  }

  function refreshInfo() {
    var item = findById(state.selectedId);
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

  function stripHtml(text) {
    return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function tryAmap() {
    if (!KEY) {
      setMapBadge('本地示意地图 · 未配置 Key', true);
      if (dom.mapTip) dom.mapTip.textContent = '本地示意地图 · 未配置高德 Key，可拖动、缩放、点击红点查看详情';
      return;
    }
    showMapLoading(true);
    setMapBadge('正在连接高德地图…', false);
    dom.amapMap.classList.add('is-active');
    var map = null;
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
      var ready = await waitMapReady(map);
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
      state.amapInfo.on('close', function () {
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
      note('高德地图 JS API 不可用（' + reasonText(err) + '，可能是 Key 未开通 JS API 权限），已切换为可交互的本地示意地图，餐厅标记与详情功能正常。');
    } finally {
      showMapLoading(false);
    }
  }

  function loadAmapScript() {
    if (window.AMap) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(KEY);
      script.async = true;
      var timer = setTimeout(function () {
        reject(new Error('地图脚本加载超时'));
      }, 8000);
      script.onload = function () {
        clearTimeout(timer);
        if (window.AMap) resolve();
        else reject(new Error('地图脚本不可用'));
      };
      script.onerror = function () {
        clearTimeout(timer);
        reject(new Error('地图脚本加载失败'));
      };
      document.head.appendChild(script);
    });
  }

  function isAmapRendered() {
    var container = dom.amapMap;
    if (!container) return false;
    if (/INVALID|USERKEY|USER_KEY|无效|校验失败|权限不足/i.test(container.textContent || '')) return false;
    var canvas = container.querySelector('canvas');
    if (canvas && canvas.width > 0 && canvas.height > 0) return true;
    return container.querySelectorAll('img').length > 0;
  }

  function waitMapReady(map) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve(ok);
      }
      try {
        map.on('complete', function () { finish(true); });
        map.on('error', function () { finish(false); });
      } catch (err) { /* ignore */ }
      setTimeout(function () { finish(false); }, AMAP_READY_TIMEOUT);
    });
  }

  function renderAMapMarkers() {
    if (!state.amap || !window.AMap) return;
    state.markerBatchToken += 1;
    var token = state.markerBatchToken;
    clearAmapMarkers();
    var list = sortedList();
    var index = 0;
    var batchSize = 6;

    function addBatch() {
      if (state.markerBatchToken !== token || !state.amap) return;
      var end = Math.min(index + batchSize, list.length);
      list.slice(index, end).forEach(function (item) {
        var marker = new window.AMap.Marker({
          position: [item.lng, item.lat],
          title: item.name,
          anchor: 'bottom-center',
          zIndex: 100 + index,
          content: pinHtml(index + 1, item.id === state.selectedId)
        });
        marker.on('click', function () {
          selectRestaurant(item.id, 'map');
        });
        state.amap.add(marker);
        state.amapMarkers.push({ marker: marker, id: item.id });
        index += 1;
      });
      if (index < list.length) {
        if (window.requestAnimationFrame) window.requestAnimationFrame(addBatch);
        else setTimeout(addBatch, 16);
      }
    }

    addBatch();
  }

  function clearAmapMarkers() {
    if (!state.amap) {
      state.amapMarkers = [];
      return;
    }
    state.amapMarkers.forEach(function (entry) {
      try { state.amap.remove(entry.marker); } catch (err) { /* ignore */ }
    });
    state.amapMarkers = [];
  }

  function pinHtml(index, active) {
    return '<div class="amap-pin' + (active ? ' is-active' : '') + '"><span>' + index + '</span></div>';
  }

  function updateAmapMarkersActive() {
    state.amapMarkers.forEach(function (entry) {
      if (entry.marker.setContent) {
        entry.marker.setContent(pinHtml(indexOfMarker(entry.id), entry.id === state.selectedId));
      }
    });
  }

  function indexOfMarker(id) {
    var list = sortedList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return i + 1;
    }
    return 0;
  }

  function openAmapInfo(item) {
    if (!state.amap || !state.amapInfo) return;
    state.amapInfo.setContent(infoHtml(item));
    state.amapInfo.open(state.amap, [item.lng, item.lat]);
  }

  function haversine(a, b) {
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatDistance(meters) {
    if (!isFinite(meters) || meters < 0) return '—';
    if (meters < 1000) return Math.round(meters) + ' 米';
    return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + ' 公里';
  }

  function reasonText(err) {
    if (!err) return '未知错误';
    if (err.name === 'AbortError') return '请求超时';
    if (err instanceof TypeError) return '网络不可达';
    return err.message || String(err);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
})();