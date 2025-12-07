const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;
const { cacheHelper } = require('../utils/redis');

/**
 * 优化版 SSR 渲染函数
 *
 * 优化策略：
 * 1. 数据分层：只传递首屏必需数据给 SSR
 * 2. 多级缓存：页面缓存 + 数据缓存
 * 3. 流式渲染：使用 renderToNodeStream（可选）
 * 4. 性能监控：记录各阶段耗时
 */

/**
 * 优化版 SSR 渲染 - 数据分层策略
 */
async function renderSSROptimized(itemId) {
  const cacheKey = `ssr:optimized:${itemId}`;
  const perfStart = Date.now();

  try {
    // 1. 先查页面缓存
    const cachedHtml = await cacheHelper.getString(cacheKey, 'ssr');
    if (cachedHtml) {
      console.log(`✅ SSR 缓存命中: ${itemId} (${Date.now() - perfStart}ms)`);
      return cachedHtml;
    }

    // 2. 获取商品数据（只获取首屏必需数据）
    const itemData = await fetchItemDataOptimized(itemId);

    // 3. SSR 渲染（只渲染首屏关键内容）
    const renderStart = Date.now();
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, {
        itemData: itemData.essential, // 只传递必需数据
        isSSR: true
      })
    );
    const renderTime = Date.now() - renderStart;
    console.log(`⚡ React 渲染耗时: ${renderTime}ms`);

    // 4. 生成完整 HTML
    const html = generateOptimizedHTML(appHtml, itemData, itemId);

    // 5. 缓存策略：根据商品类型设置不同 TTL
    const ttl = itemData.essential.stock > 100 ? 300 : 60; // 库存多的商品缓存更久
    await cacheHelper.setString(cacheKey, html, ttl);

    console.log(`📝 SSR 完成: ${itemId}, 总耗时: ${Date.now() - perfStart}ms`);
    return html;

  } catch (error) {
    console.error('SSR 渲染失败:', error);
    throw error;
  }
}

/**
 * 优化版数据获取 - 数据分层
 *
 * 返回结构：
 * {
 *   essential: {},  // 首屏必需数据（用于 SSR）
 *   lazy: {}        // 次要数据（客户端异步加载）
 * }
 */
async function fetchItemDataOptimized(itemId) {
  const cacheKey = `item:optimized:${itemId}`;

  try {
    // 1. 先查缓存
    const cached = await cacheHelper.get(cacheKey, 'item');
    if (cached) {
      console.log(`✅ 商品数据缓存命中: ${itemId}`);
      return cached;
    }

    // 2. 并行获取数据（实际项目中应该调用真实接口）
    const [basicInfo, stockInfo] = await Promise.all([
      fetchBasicInfo(itemId),
      fetchStockInfo(itemId)
    ]);

    // 3. 数据分层：区分首屏必需和次要数据
    const itemData = {
      // 首屏必需数据（SSR 渲染）
      essential: {
        itemId,
        title: basicInfo.title,
        price: basicInfo.price,
        originalPrice: basicInfo.originalPrice,
        stock: stockInfo.stock,
        description: basicInfo.description.substring(0, 200), // 只取前 200 字
        images: basicInfo.images.slice(0, 5), // 只取前 5 张图
        specs: basicInfo.specs
      },
      // 次要数据（客户端异步加载）
      lazy: {
        fullDescription: basicInfo.description,
        allImages: basicInfo.images,
        reviewCount: basicInfo.reviewCount,
        avgRating: basicInfo.avgRating
      }
    };

    // 4. 缓存完整数据
    await cacheHelper.set(cacheKey, itemData, 300);
    console.log(`📝 商品数据已缓存: ${itemId}`);

    return itemData;

  } catch (error) {
    console.error('获取商品数据失败:', error);
    throw error;
  }
}

/**
 * Mock: 获取商品基本信息
 */
async function fetchBasicInfo(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        title: `优质商品 ${itemId}`,
        price: 199.99,
        originalPrice: 299.99,
        description: '这是一个非常详细的商品描述'.repeat(10),
        images: Array(10).fill('/images/item.jpg').map((img, i) => `${img}?v=${i}`),
        specs: {
          brand: '品牌名称',
          model: '型号123',
          color: '黑色'
        },
        reviewCount: 1523,
        avgRating: 4.8
      });
    }, 50);
  });
}

/**
 * Mock: 获取库存信息
 */
async function fetchStockInfo(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        stock: Math.floor(Math.random() * 1000) + 100
      });
    }, 30);
  });
}

/**
 * 生成优化后的 HTML
 *
 * 优化点：
 * 1. 内联关键 CSS
 * 2. 预加载关键资源
 * 3. 异步加载次要脚本
 * 4. 注入性能监控代码
 */
function generateOptimizedHTML(appHtml, itemData, itemId) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${itemData.essential.title} - 商品详情</title>
  <meta name="description" content="${itemData.essential.description}">

  <!-- 预加载关键资源 -->
  <link rel="preload" href="/client.bundle.js" as="script">
  <link rel="preconnect" href="https://api.example.com">

  <!-- 内联关键 CSS（首屏样式） -->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }

    /* 骨架屏样式（用于懒加载区域） */
    [data-lazy-load] {
      min-height: 200px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 8px;
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  </style>
</head>
<body>
  <!-- SSR 渲染的首屏内容 -->
  <div id="root">${appHtml}</div>

  <!-- 注入数据：分层传递 -->
  <script>
    // 首屏数据（已在 SSR 中使用）
    window.__INITIAL_DATA__ = ${JSON.stringify(itemData.essential)};

    // 懒加载数据的 API 端点
    window.__LAZY_LOAD_ENDPOINTS__ = {
      reviews: '/api/item/${itemId}/reviews',
      recommendations: '/api/item/${itemId}/recommendations',
      detailImages: '/api/item/${itemId}/images'
    };

    // 性能监控
    window.__SSR_TIMING__ = {
      serverTime: ${Date.now()},
      itemId: '${itemId}'
    };
  </script>

  <!-- 主要客户端脚本 -->
  <script src="/client.bundle.js"></script>

  <!-- 懒加载脚本（异步加载次要内容） -->
  <script>
    // 使用 Intersection Observer 实现懒加载
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const endpoint = element.dataset.lazyLoad;

            // 加载对应的数据
            if (window.__LAZY_LOAD_ENDPOINTS__[endpoint]) {
              fetch(window.__LAZY_LOAD_ENDPOINTS__[endpoint])
                .then(res => res.json())
                .then(data => {
                  // 渲染数据到对应容器
                  renderLazyContent(endpoint, data);
                  observer.unobserve(element);
                })
                .catch(err => console.error('懒加载失败:', err));
            }
          }
        });
      }, { rootMargin: '100px' }); // 提前 100px 开始加载

      // 观察所有懒加载元素
      document.querySelectorAll('[data-lazy-load]').forEach(el => {
        observer.observe(el);
      });
    }

    // 渲染懒加载内容
    function renderLazyContent(type, data) {
      const container = document.querySelector(\`[data-lazy-load="\${type}"]\`);
      if (!container) return;

      if (type === 'reviews') {
        container.innerHTML = data.reviews.map(review => \`
          <div style="border-bottom: 1px solid #f0f0f0; padding: 16px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <strong>\${review.user}</strong>
              <span>\${'⭐'.repeat(review.rating)}</span>
            </div>
            <p>\${review.comment}</p>
          </div>
        \`).join('');
      } else if (type === 'recommendations') {
        container.innerHTML = data.items.map(item => \`
          <div style="display: inline-block; width: 200px; margin: 10px;">
            <img src="\${item.image}" style="width: 100%; border-radius: 8px;">
            <h4>\${item.title}</h4>
            <p style="color: #ff4d4f; font-weight: bold;">¥\${item.price}</p>
          </div>
        \`).join('');
      }
    }
  </script>
</body>
</html>
  `.trim();
}

module.exports = {
  renderSSROptimized,
  fetchItemDataOptimized
};
