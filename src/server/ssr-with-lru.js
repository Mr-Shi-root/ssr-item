const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;
const { ssrCache } = require('../utils/lru-cache');

/**
 * SSR 渲染函数 - 用于普通商品
 * 使用 LRU 缓存优化性能
 * @param {string} itemId - 商品ID
 * @returns {Promise<string>} - 渲染后的 HTML 字符串
 */
async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;
  const startTime = Date.now();

  try {
    // ===== 步骤 1: 尝试从 LRU 缓存获取 =====
    const cachedHtml = ssrCache.get(cacheKey);
    if (cachedHtml) {
      const duration = Date.now() - startTime;
      console.log(`⚡ LRU 缓存返回 HTML: ${itemId} (耗时: ${duration}ms)`);
      return cachedHtml;
    }

    // ===== 步骤 2: 缓存未命中，执行 SSR 渲染 =====
    console.log(`🎨 开始 SSR 渲染: ${itemId}`);

    // 2.1 获取商品数据
    const itemData = await fetchItemData(itemId);

    // 2.2 使用 React 渲染组件为 HTML 字符串
    const renderStart = Date.now();
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, { itemData })
    );
    const renderDuration = Date.now() - renderStart;
    console.log(`⚡ React 渲染完成: ${renderDuration}ms`);

    // 2.3 生成完整的 HTML 页面
    const html = generateHTML(appHtml, itemData);

    // ===== 步骤 3: 写入 LRU 缓存 =====
    // TTL 60 秒（可根据商品类型动态调整）
    const ttl = 1000 * 60;
    ssrCache.set(cacheKey, html, ttl);

    const totalDuration = Date.now() - startTime;
    console.log(`✅ SSR 渲染完成: ${itemId} (总耗时: ${totalDuration}ms)`);

    return html;
  } catch (error) {
    console.error('❌ SSR 渲染失败:', error);
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
        ]
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
 * 清除指定商品的 SSR 缓存
 * 用于商品更新时主动失效缓存
 */
function invalidateCache(itemId) {
  const cacheKey = `ssr:${itemId}`;
  ssrCache.delete(cacheKey);
  console.log(`🗑️ 已清除商品 ${itemId} 的 SSR 缓存`);
}

/**
 * 预热热门商品的 SSR 缓存
 * 在服务启动时或定时任务中调用
 */
async function warmupCache(itemIds) {
  console.log(`🔥 开始预热 SSR 缓存: ${itemIds.length} 个商品`);

  const results = await Promise.allSettled(
    itemIds.map(async (itemId) => {
      try {
        const html = await renderSSR(itemId);
        return { itemId, success: true, size: html.length };
      } catch (error) {
        console.error(`预热失败: ${itemId}`, error.message);
        return { itemId, success: false, error: error.message };
      }
    })
  );

  const successful = results.filter(r => r.value?.success).length;
  console.log(`✅ SSR 缓存预热完成: ${successful}/${itemIds.length} 成功`);

  return results;
}

module.exports = {
  renderSSR,
  invalidateCache,
  warmupCache,
  ssrCache
};
