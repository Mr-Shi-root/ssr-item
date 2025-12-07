const React = require('react');
const ReactDOMServer = require('react-dom/server');
const ItemDetailPage = require('../pages/ItemDetailPage').default;

/**
 * SSR 渲染函数 - 用于普通商品
 * @param {string} itemId - 商品ID
 * @returns {Promise<string>} - 渲染后的 HTML 字符串
 */
async function renderSSR(itemId) {
  try {
    // 1. 获取商品数据（实际项目中应该调用真实接口）
    const itemData = await fetchItemData(itemId);

    // 2. 使用 React 渲染组件为 HTML 字符串
    const appHtml = ReactDOMServer.renderToString(
      React.createElement(ItemDetailPage, { itemData })
    );

    // 3. 生成完整的 HTML 页面
    const html = generateHTML(appHtml, itemData);

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

module.exports = {
  renderSSR
};
