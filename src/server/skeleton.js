/**
 * CSR 骨架页渲染函数 - 用于秒杀商品
 * @param {string} itemId - 商品ID
 * @param {object} precheckData - 预检接口返回的数据
 * @returns {string} - 骨架页 HTML
 */
function renderSkeleton(itemId, precheckData) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>秒杀商品 - 加载中</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: white;
    }

    /* 骨架屏样式 */
    .skeleton {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton-header {
      height: 60px;
      margin-bottom: 20px;
      border-radius: 4px;
    }

    .skeleton-image {
      width: 100%;
      height: 400px;
      margin-bottom: 20px;
      border-radius: 8px;
    }

    .skeleton-title {
      height: 32px;
      width: 70%;
      margin-bottom: 16px;
      border-radius: 4px;
    }

    .skeleton-price {
      height: 48px;
      width: 200px;
      margin-bottom: 20px;
      border-radius: 4px;
    }

    .skeleton-button {
      height: 50px;
      width: 100%;
      max-width: 300px;
      border-radius: 4px;
      margin-top: 20px;
    }

    /* 秒杀标识 */
    .seckill-badge {
      display: inline-block;
      background: #ff4d4f;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 16px;
    }

    /* 实际内容容器（初始隐藏） */
    #app-content {
      display: none;
    }

    #app-content.loaded {
      display: block;
    }

    .skeleton-wrapper.loaded {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- 骨架屏 -->
    <div class="skeleton-wrapper" id="skeleton">
      <div class="seckill-badge">⚡ 秒杀进行中</div>
      <div class="skeleton skeleton-header"></div>
      <div class="skeleton skeleton-image"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-price"></div>
      <div class="skeleton skeleton-button"></div>
    </div>

    <!-- 实际内容容器 -->
    <div id="app-content"></div>
  </div>

  <!-- 注入预检数据 -->
  <script>
    window.__PRECHECK_DATA__ = ${JSON.stringify(precheckData)};
    window.__ITEM_ID__ = "${itemId}";
  </script>

  <!-- 加载秒杀页面的客户端脚本 -->
  <script src="/skeleton/skeleton.bundle.js"></script>
</body>
</html>
  `.trim();
}

module.exports = {
  renderSkeleton
};
