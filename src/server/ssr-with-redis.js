const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;
const { cacheHelper } = require('../utils/redis');

/**
 * SSR 渲染函数 - 用于普通商品
 * 支持 Redis 缓存，TTL 60 秒
 * @param {string} itemId - 商品ID
 * @returns {Promise<string>} - 渲染后的 HTML 字符串
 */
async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;

  try {
    // 1. 先查 Redis 缓存
    const cachedHtml = await cacheHelper.getString(cacheKey, 'ssr');
    if (cachedHtml) {
      console.log(`✅ SSR 缓存命中: ${itemId}`);
      return cachedHtml;
    }

    // 2. 缓存未命中，执行 SSR 渲染
    console.log(`⚠️ SSR 缓存未命中: ${itemId}，执行渲染`);

    // 2.1 获取商品数据（带缓存）
    const itemData = await fetchItemData(itemId);

    // 2.2 使用 React 渲染组件为 HTML 字符串
    const renderStart = Date.now();
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, { itemData })
    );
    console.log(`⚡ React 渲染耗时: ${Date.now() - renderStart}ms`);

    // 2.3 生成完整的 HTML 页面
    const html = generateHTML(appHtml, itemData);

    // 3. 写入 Redis 缓存，TTL 60 秒
    await cacheHelper.setString(cacheKey, html, 60);
    console.log(`📝 SSR 结果已缓存: ${itemId}`);

    return html;
  } catch (error) {
    console.error('SSR 渲染失败:', error);
    throw error;
  }
}

/**
 * 获取商品数据
 * 支持 Redis 缓存，TTL 300 秒（5 分钟）
 * Mock 函数 - 实际项目中替换为真实的数据获取逻辑
 */
async function fetchItemData(itemId) {
  const cacheKey = `item:${itemId}`;

  try {
    // 1. 先查 Redis 缓存
    const cached = await cacheHelper.get(cacheKey, 'item');
    if (cached) {
      console.log(`✅ 商品数据缓存命中: ${itemId}`);
      return cached;
    }

    // 2. 缓存未命中，获取数据
    console.log(`⚠️ 商品数据缓存未命中: ${itemId}，获取数据`);

    // 实际项目中应该调用真实的商品详情接口
    // const response = await axios.get(`https://api.example.com/item/${itemId}`);
    // const itemData = response.data;

    // Mock 数据 - 开发时使用
    const itemData = await new Promise((resolve) => {
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

    // 3. 写入 Redis 缓存，TTL 300 秒（5 分钟）
    await cacheHelper.set(cacheKey, itemData, 300);
    console.log(`📝 商品数据已缓存: ${itemId}`);

    return itemData;
  } catch (error) {
    console.error('获取商品数据失败:', error);
    throw error;
  }
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

module.exports = {
  renderSSR
};
