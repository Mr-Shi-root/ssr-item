const React = require('react');
const { renderToPipeableStream } = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;
const { cacheHelper } = require('../utils/redis');

/**
 * React 18 流式 SSR 渲染
 *
 * 优势：
 * 1. 边渲染边发送，TTFB 更快
 * 2. 支持 Suspense 流式传输
 * 3. 更好的用户体验
 *
 * 注意：需要 React 18+
 */

/**
 * 流式 SSR 渲染（不使用缓存）
 * 适用于实时性要求高的场景
 */
function renderSSRStreaming(itemId, res) {
  const perfStart = Date.now();

  // 获取商品数据
  fetchItemDataForStreaming(itemId).then(itemData => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      React.createElement(ItemDetailPage, {
        itemData: itemData.essential,
        isSSR: true
      }),
      {
        // Shell 准备好后立即开始发送
        onShellReady() {
          res.statusCode = didError ? 500 : 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');

          // 发送 HTML 头部
          res.write(generateStreamingHTMLHead(itemData));

          // 开始流式传输 React 内容
          pipe(res);

          console.log(`⚡ Shell 发送完成: ${itemId} (${Date.now() - perfStart}ms)`);
        },

        // 所有内容准备好后
        onAllReady() {
          // 发送 HTML 尾部（脚本等）
          res.write(generateStreamingHTMLTail(itemData, itemId));
          res.end();

          console.log(`✅ 流式渲染完成: ${itemId} (${Date.now() - perfStart}ms)`);
        },

        // 错误处理
        onError(error) {
          didError = true;
          console.error('流式渲染错误:', error);
        },

        // 引导脚本
        bootstrapScripts: ['/client.bundle.js']
      }
    );

    // 请求超时处理
    setTimeout(() => {
      abort();
    }, 10000); // 10 秒超时

  }).catch(error => {
    console.error('获取数据失败:', error);
    res.statusCode = 500;
    res.end('<h1>服务器错误</h1>');
  });
}

/**
 * 混合模式：缓存 + 流式渲染
 *
 * 策略：
 * 1. 先查缓存，命中则直接返回
 * 2. 未命中则使用流式渲染，但不缓存（因为流式渲染无法缓存完整 HTML）
 */
async function renderSSRHybrid(itemId, res) {
  const cacheKey = `ssr:hybrid:${itemId}`;

  try {
    // 1. 先查缓存
    const cachedHtml = await cacheHelper.getString(cacheKey, 'ssr');
    if (cachedHtml) {
      console.log(`✅ 缓存命中，直接返回: ${itemId}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Cache', 'HIT');
      res.end(cachedHtml);
      return;
    }

    // 2. 缓存未命中，使用流式渲染
    console.log(`⚠️ 缓存未命中，使用流式渲染: ${itemId}`);
    res.setHeader('X-Cache', 'MISS');
    renderSSRStreaming(itemId, res);

  } catch (error) {
    console.error('混合渲染失败:', error);
    res.statusCode = 500;
    res.end('<h1>服务器错误</h1>');
  }
}

/**
 * 获取商品数据（用于流式渲染）
 */
async function fetchItemDataForStreaming(itemId) {
  const cacheKey = `item:streaming:${itemId}`;

  try {
    // 先查缓存
    const cached = await cacheHelper.get(cacheKey, 'item');
    if (cached) {
      return cached;
    }

    // 并行获取数据
    const [basicInfo, stockInfo] = await Promise.all([
      fetchBasicInfo(itemId),
      fetchStockInfo(itemId)
    ]);

    const itemData = {
      essential: {
        itemId,
        title: basicInfo.title,
        price: basicInfo.price,
        originalPrice: basicInfo.originalPrice,
        stock: stockInfo.stock,
        description: basicInfo.description.substring(0, 200),
        images: basicInfo.images.slice(0, 5),
        specs: basicInfo.specs
      }
    };

    // 缓存数据
    await cacheHelper.set(cacheKey, itemData, 300);

    return itemData;

  } catch (error) {
    console.error('获取数据失败:', error);
    throw error;
  }
}

/**
 * Mock 函数
 */
async function fetchBasicInfo(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        title: `流式渲染商品 ${itemId}`,
        price: 199.99,
        originalPrice: 299.99,
        description: '这是一个支持流式渲染的商品描述'.repeat(5),
        images: Array(5).fill('/images/item.jpg').map((img, i) => `${img}?v=${i}`),
        specs: {
          brand: '品牌名称',
          model: '型号123',
          color: '黑色'
        }
      });
    }, 50);
  });
}

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
 * 生成流式 HTML 头部
 */
function generateStreamingHTMLHead(itemData) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${itemData.essential.title} - 商品详情</title>
  <meta name="description" content="${itemData.essential.description}">

  <link rel="preload" href="/client.bundle.js" as="script">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div id="root">`;
}

/**
 * 生成流式 HTML 尾部
 */
function generateStreamingHTMLTail(itemData, itemId) {
  return `
  </div>

  <script>
    window.__INITIAL_DATA__ = ${JSON.stringify(itemData.essential)};
    window.__ITEM_ID__ = "${itemId}";
    window.__RENDER_MODE__ = "streaming";
  </script>
</body>
</html>`;
}

module.exports = {
  renderSSRStreaming,
  renderSSRHybrid
};
