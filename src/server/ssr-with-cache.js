const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;
const cacheManager = require('./cache');

/**
 * SSR 渲染函数（带缓存）
 * 缓存策略：
 * 1. 先检查页面级缓存（完整 HTML）
 * 2. 未命中则检查数据缓存
 * 3. 都未命中则调用接口并渲染
 *
 * @param {string} itemId - 商品ID
 * @param {object} options - 配置选项
 * @returns {Promise<string>} - 渲染后的 HTML 字符串
 */
async function renderSSRWithCache(itemId, options = {}) {
  const {
    skipCache = false,      // 是否跳过缓存（用于调试）
    cacheTTL = 300,         // 缓存过期时间（秒），默认 5 分钟
    dataCacheTTL = 600      // 数据缓存过期时间（秒），默认 10 分钟
  } = options;

  const startTime = Date.now();
  const cacheKey = cacheManager.generateKey('ssr-html', itemId);
  const dataCacheKey = cacheManager.generateKey('item-data', itemId);

  try {
    // ===== 第一层：页面级缓存（完整 HTML）=====
    if (!skipCache) {
      const cachedHTML = await cacheManager.get(cacheKey);
      if (cachedHTML) {
        const renderTime = Date.now() - startTime;
        console.log(`✅ SSR 缓存命中: ${itemId} (${renderTime}ms)`);
        return cachedHTML;
      }
    }

    // ===== 第二层：数据缓存 =====
    let itemData;
    if (!skipCache) {
      const cachedData = await cacheManager.get(dataCacheKey);
      if (cachedData) {
        itemData = JSON.parse(cachedData);
        console.log(`✅ 数据缓存命中: ${itemId}`);
      }
    }

    // ===== 第三层：调用接口获取数据 =====
    if (!itemData) {
      itemData = await fetchItemData(itemId);
      // 缓存数据（数据缓存时间更长）
      await cacheManager.set(
        dataCacheKey,
        JSON.stringify(itemData),
        dataCacheTTL
      );
      console.log(`📦 数据已缓存: ${itemId}`);
    }

    // ===== React 渲染 =====
    const renderStart = Date.now();
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, { itemData })
    );
    const renderTime = Date.now() - renderStart;

    // ===== 生成完整 HTML =====
    const html = generateHTML(appHtml, itemData);

    // ===== 缓存完整 HTML =====
    await cacheManager.set(cacheKey, html, cacheTTL);

    const totalTime = Date.now() - startTime;
    console.log(`🎨 SSR 渲染完成: ${itemId} (渲染: ${renderTime}ms, 总计: ${totalTime}ms)`);

    return html;
  } catch (error) {
    console.error('SSR 渲染失败:', error);
    throw error;
  }
}

/**
 * 获取商品数据
 * Mock 函数 - 实际项目中替换为真实的数据获取逻辑
 */
async function fetchItemData(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        itemId,
        title: `普通商品 ${itemId}`,
        price: 199.99,
        originalPrice: 299.99,
        stock: 500,
        description: '这是一个普通商品的详细描述，支持完整的 SSR 渲染',
        images: [
          '/images/item1.jpg',
          '/images/item2.jpg',
          '/images/item3.jpg'
        ],
        specs: {
          brand: '品牌名称',
          model: '型号123',
          color: '黑色'
        },
        reviews: [
          { user: '用户A', rating: 5, comment: '非常好' },
          { user: '用户B', rating: 4, comment: '不错' }
        ],
        updatedAt: Date.now()  // 添加更新时间，用于缓存失效判断
      });
    }, 100);
  });
}

/**
 * 生成完整的 HTML 页面
 */
function generateHTML(appHtml, itemData) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${itemData.title} - 商品详情</title>
  <meta name="description" content="${itemData.description}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="root">${appHtml}</div>

  <!-- 注入初始数据到页面，用于客户端 hydration -->
  <script>
    window.__INITIAL_DATA__ = ${JSON.stringify(itemData)};
  </script>

  <!-- 加载客户端 bundle -->
  <script src="/client.bundle.js"></script>
</body>
</html>
  `.trim();
}

/**
 * 使缓存失效（商品更新时调用）
 * @param {string} itemId - 商品ID
 */
async function invalidateCache(itemId) {
  const cacheKey = cacheManager.generateKey('ssr-html', itemId);
  const dataCacheKey = cacheManager.generateKey('item-data', itemId);

  await cacheManager.delete(cacheKey);
  await cacheManager.delete(dataCacheKey);

  console.log(`🗑️  缓存已失效: ${itemId}`);
}

/**
 * 批量使缓存失效
 * @param {string[]} itemIds - 商品ID数组
 */
async function invalidateBatchCache(itemIds) {
  const promises = itemIds.map(id => invalidateCache(id));
  await Promise.all(promises);
  console.log(`🗑️  批量缓存已失效: ${itemIds.length} 个商品`);
}

/**
 * 预热缓存（提前渲染热门商品）
 * @param {string[]} itemIds - 商品ID数组
 */
async function warmupCache(itemIds) {
  console.log(`🔥 开始预热缓存: ${itemIds.length} 个商品`);

  const promises = itemIds.map(async (itemId) => {
    try {
      await renderSSRWithCache(itemId);
      console.log(`✅ 预热成功: ${itemId}`);
    } catch (error) {
      console.error(`❌ 预热失败: ${itemId}`, error.message);
    }
  });

  await Promise.all(promises);
  console.log(`🔥 缓存预热完成`);
}

module.exports = {
  renderSSRWithCache,
  invalidateCache,
  invalidateBatchCache,
  warmupCache
};
