const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const path = require('path');
const { precheckItem } = require('../api/precheck');
const { renderSSR } = require('./ssr');
const { renderSSRWithCache, invalidateCache, warmupCache } = require('./ssr-with-cache');
const { renderSkeleton } = require('./skeleton');
const cacheManager = require('./cache');

const app = new Koa();
const router = new Router();

// 是否启用缓存（通过环境变量控制）
const ENABLE_CACHE = process.env.ENABLE_SSR_CACHE !== 'false';

// 解析 POST 请求体
app.use(bodyParser());

// 静态资源服务
app.use(serve(path.join(__dirname, '../../public')));
// 为静态资源添加缓存控制
app.use(async (ctx, next) => {
  await next();
  
  // 静态资源缓存策略
  if (ctx.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
    // 长期缓存（1年）- 适用于带版本号/hash的文件
    ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ctx.path.startsWith('/skeleton/')) {
    // 骨架屏资源缓存（1小时）
    ctx.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  }
});

/**
 * 核心路由 - 商品详情页
 * 根据预检接口判断渲染方式
 */
router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const startTime = Date.now();

  try {
    // 1. 调用轻量级预检接口
    const { isSeckill, data } = await precheckItem(itemId);

    console.log(`商品 ${itemId} 预检结果:`, { isSeckill, data });

    // 2. 根据预检结果选择渲染策略
    if (isSeckill) {
      // 秒杀商品 - 返回 CSR 骨架页（不缓存，因为库存实时变化）
      ctx.type = 'html';
      ctx.body = renderSkeleton(itemId, data);
      ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // 普通商品 - SSR 渲染（带缓存）
      const html = ENABLE_CACHE
        ? await renderSSRWithCache(itemId)
        : await renderSSR(itemId);

      ctx.type = 'html';
      ctx.body = html;

      // 设置浏览器缓存（CDN 和浏览器都可以缓存）
      ctx.set('Cache-Control', 'public, max-age=60, s-maxage=300');  // 浏览器 1 分钟，CDN 5 分钟
      ctx.set('X-Cache-Enabled', ENABLE_CACHE ? 'true' : 'false');
    }

    // 添加性能指标
    const renderTime = Date.now() - startTime;
    ctx.set('X-Render-Time', `${renderTime}ms`);
    ctx.set('X-Render-Type', isSeckill ? 'CSR-Skeleton' : 'SSR');

  } catch (error) {
    console.error('渲染失败:', error);
    ctx.status = 500;
    ctx.body = '页面加载失败';
  }
});

/**
 * API 路由 - 获取商品详情数据
 * 用于 CSR 骨架页的数据获取
 */
router.get('/api/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  // Mock 数据 - 实际项目中应该调用真实的商品详情接口
  ctx.body = {
    success: true,
    data: {
      itemId,
      title: `商品标题 ${itemId}`,
      price: 99.99,
      stock: 100,
      description: '这是商品描述',
      images: ['/images/placeholder.jpg']
    }
  };
});

/**
 * 健康检查接口
 */
router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() };
});

/**
 * 缓存管理接口 - 获取缓存统计
 */
router.get('/admin/cache/stats', (ctx) => {
  const stats = cacheManager.getStats();
  ctx.body = {
    success: true,
    data: stats,
    cacheEnabled: ENABLE_CACHE
  };
});

/**
 * 缓存管理接口 - 使单个商品缓存失效
 * POST /admin/cache/invalidate
 * Body: { itemId: "123" }
 */
router.post('/admin/cache/invalidate', async (ctx) => {
  const { itemId } = ctx.request.body || {};

  if (!itemId) {
    ctx.status = 400;
    ctx.body = { success: false, message: '缺少 itemId 参数' };
    return;
  }

  try {
    await invalidateCache(itemId);
    ctx.body = {
      success: true,
      message: `商品 ${itemId} 缓存已失效`
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

/**
 * 缓存管理接口 - 清空所有缓存
 * POST /admin/cache/clear
 */
router.post('/admin/cache/clear', async (ctx) => {
  try {
    await cacheManager.clear();
    ctx.body = {
      success: true,
      message: '所有缓存已清空'
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

/**
 * 缓存管理接口 - 预热缓存
 * POST /admin/cache/warmup
 * Body: { itemIds: ["123", "456", "789"] }
 */
router.post('/admin/cache/warmup', async (ctx) => {
  const { itemIds } = ctx.request.body || {};

  if (!itemIds || !Array.isArray(itemIds)) {
    ctx.status = 400;
    ctx.body = { success: false, message: '缺少 itemIds 参数或格式错误' };
    return;
  }

  try {
    // 异步预热，不阻塞响应
    warmupCache(itemIds).catch(err => {
      console.error('缓存预热失败:', err);
    });

    ctx.body = {
      success: true,
      message: `开始预热 ${itemIds.length} 个商品的缓存`
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 服务器启动成功: http://localhost:${PORT}`);
  console.log(`📦 环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
