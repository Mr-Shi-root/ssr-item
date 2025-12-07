const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const path = require('path');
const { precheckItemEnhanced, getCircuitBreakerStatus } = require('../api/precheck-enhanced');
const { renderSSROptimized } = require('./ssr-optimized');
const { renderSSRStreaming } = require('./ssr-streaming');
const { renderSkeleton } = require('./skeleton');

const app = new Koa();
const router = new Router();

// 静态资源服务
app.use(serve(path.join(__dirname, '../../public')));

/**
 * 增强版智能路由分发
 *
 * 核心改进：
 * 1. 根据预检结果动态选择渲染策略
 * 2. 支持多种渲染模式（SSR、CSR、Streaming）
 * 3. 智能缓存策略
 * 4. 性能监控和日志
 */
router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const requestStart = Date.now();

  try {
    // ========================================
    // 第一步：轻量级预检（1-50ms）
    // ========================================
    const precheckStart = Date.now();
    const strategy = await precheckItemEnhanced(itemId);
    const precheckTime = Date.now() - precheckStart;

    console.log(`\n📋 商品 ${itemId} 预检结果:`);
    console.log(`   渲染策略: ${strategy.renderStrategy}`);
    console.log(`   缓存策略: ${strategy.cacheStrategy.enabled ? `启用 (TTL ${strategy.cacheStrategy.ttl}s)` : '禁用'}`);
    console.log(`   决策原因: ${strategy.metadata.reason}`);
    console.log(`   预检耗时: ${precheckTime}ms\n`);

    // ========================================
    // 第二步：根据策略选择渲染方式
    // ========================================
    let html;
    let renderTime;
    const renderStart = Date.now();

    switch (strategy.renderStrategy) {
      case 'ssr':
        // 策略 1: SSR 渲染（普通商品、热门商品）
        html = await renderSSRWithStrategy(itemId, strategy);
        renderTime = Date.now() - renderStart;

        ctx.type = 'html';
        ctx.body = html;

        // 设置响应头
        ctx.set('X-Render-Strategy', 'SSR');
        ctx.set('X-Cache-TTL', strategy.cacheStrategy.ttl.toString());
        break;

      case 'csr':
        // 策略 2: CSR 骨架页（秒杀商品）
        html = renderSkeleton(itemId, strategy.metadata);
        renderTime = Date.now() - renderStart;

        ctx.type = 'html';
        ctx.body = html;

        ctx.set('X-Render-Strategy', 'CSR');
        ctx.set('X-Cache-Enabled', 'false');
        break;

      case 'streaming':
        // 策略 3: 流式渲染（热门低库存商品）
        ctx.set('X-Render-Strategy', 'Streaming');
        ctx.set('Content-Type', 'text/html; charset=utf-8');

        // 流式渲染直接写入响应
        await renderSSRStreaming(itemId, ctx.res);
        renderTime = Date.now() - renderStart;

        // 流式渲染已经结束响应，直接返回
        return;

      default:
        throw new Error(`未知的渲染策略: ${strategy.renderStrategy}`);
    }

    // ========================================
    // 第三步：性能监控和日志
    // ========================================
    const totalTime = Date.now() - requestStart;

    console.log(`✅ 渲染完成: ${itemId}`);
    console.log(`   渲染耗时: ${renderTime}ms`);
    console.log(`   总耗时: ${totalTime}ms`);
    console.log(`   HTML 大小: ${Buffer.byteLength(html || '')} bytes\n`);

    // 设置性能响应头
    ctx.set('X-Render-Time', `${renderTime}ms`);
    ctx.set('X-Total-Time', `${totalTime}ms`);
    ctx.set('Server-Timing', `precheck;dur=${precheckTime},render;dur=${renderTime}`);

    // 性能告警
    if (totalTime > 500) {
      console.warn(`⚠️ 性能告警: ${itemId} 总耗时 ${totalTime}ms 超过阈值`);
    }

  } catch (error) {
    console.error(`❌ 渲染失败: ${itemId}`, error);

    // 错误响应
    ctx.status = 500;
    ctx.type = 'html';
    ctx.body = generateErrorPage(itemId, error);

    // 错误监控
    ctx.set('X-Error', error.message);
  }
});

/**
 * SSR 渲染（带缓存策略）
 */
async function renderSSRWithStrategy(itemId, strategy) {
  const { cacheStrategy } = strategy;

  if (!cacheStrategy.enabled) {
    // 不使用缓存，直接渲染
    console.log(`⚠️ 缓存已禁用，直接渲染: ${itemId}`);
    return await renderSSROptimized(itemId);
  }

  // 使用缓存（renderSSROptimized 内部已实现缓存逻辑）
  return await renderSSROptimized(itemId);
}

/**
 * 生成错误页面
 */
function generateErrorPage(itemId, error) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>页面加载失败</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .error-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    h1 { color: #ff4d4f; margin-bottom: 16px; }
    p { color: #666; margin-bottom: 24px; }
    .error-code {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #999;
      margin-bottom: 24px;
    }
    button {
      background: #1890ff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #40a9ff; }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>😔 页面加载失败</h1>
    <p>抱歉，商品详情页暂时无法加载</p>
    <div class="error-code">
      商品ID: ${itemId}<br>
      错误信息: ${error.message}
    </div>
    <button onclick="location.reload()">重新加载</button>
    <button onclick="history.back()" style="background: #fff; color: #666; border: 1px solid #d9d9d9; margin-left: 12px;">返回上一页</button>
  </div>
</body>
</html>
  `.trim();
}

/**
 * API 路由 - 获取商品详情数据（用于 CSR）
 */
router.get('/api/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  try {
    // Mock 数据 - 实际项目中应该调用真实的商品详情接口
    const itemData = {
      success: true,
      data: {
        itemId,
        title: `商品标题 ${itemId}`,
        price: 99.99,
        stock: 100,
        description: '这是商品描述',
        images: ['/images/placeholder.jpg'],
        specs: {
          brand: '品牌名称',
          model: '型号123'
        }
      }
    };

    ctx.body = itemData;
  } catch (error) {
    console.error('获取商品数据失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * API 路由 - 评论懒加载
 */
router.get('/api/item/:id/reviews', async (ctx) => {
  const itemId = ctx.params.id;
  const { page = 1, pageSize = 20 } = ctx.query;

  try {
    // Mock 数据
    const reviews = Array(parseInt(pageSize)).fill(null).map((_, i) => ({
      user: `用户${i + 1}`,
      rating: Math.floor(Math.random() * 2) + 4,
      comment: `这是第 ${i + 1} 条评论，商品质量很好！`,
      time: Date.now() - Math.random() * 86400000
    }));

    ctx.body = {
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: 500
      }
    };
  } catch (error) {
    console.error('获取评论失败:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

/**
 * API 路由 - 推荐商品懒加载
 */
router.get('/api/item/:id/recommendations', async (ctx) => {
  const itemId = ctx.params.id;

  try {
    // Mock 数据
    const items = Array(20).fill(null).map((_, i) => ({
      itemId: `REC${i + 1}`,
      title: `推荐商品 ${i + 1}`,
      price: 99.99 + i * 10,
      image: `/images/rec${i}.jpg`
    }));

    ctx.body = {
      success: true,
      items
    };
  } catch (error) {
    console.error('获取推荐失败:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

/**
 * 健康检查接口
 */
router.get('/health', (ctx) => {
  ctx.body = {
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
});

/**
 * 监控接口 - 熔断器状态
 */
router.get('/monitor/circuit-breaker', (ctx) => {
  ctx.body = {
    success: true,
    data: getCircuitBreakerStatus()
  };
});

/**
 * 监控接口 - 性能指标
 */
router.get('/monitor/metrics', (ctx) => {
  ctx.body = {
    success: true,
    data: {
      // 实际项目中应该从监控系统获取
      requests: {
        total: 10000,
        success: 9950,
        error: 50
      },
      performance: {
        avgTTFB: 45,
        avgRenderTime: 120,
        p95: 200,
        p99: 350
      },
      cache: {
        hitRate: 0.96,
        missRate: 0.04
      }
    }
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n🚀 增强版服务器启动成功\n');
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   进程: ${process.pid}\n`);
  console.log('📊 可用端点:');
  console.log(`   商品详情: http://localhost:${PORT}/item/:id`);
  console.log(`   健康检查: http://localhost:${PORT}/health`);
  console.log(`   熔断监控: http://localhost:${PORT}/monitor/circuit-breaker`);
  console.log(`   性能指标: http://localhost:${PORT}/monitor/metrics\n`);
  console.log('💡 测试示例:');
  console.log(`   普通商品: http://localhost:${PORT}/item/NORMAL123`);
  console.log(`   秒杀商品: http://localhost:${PORT}/item/SK12345`);
  console.log(`   热门商品: http://localhost:${PORT}/item/HOT999\n`);
});

module.exports = app;
