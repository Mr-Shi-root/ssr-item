const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const path = require('path');
const { precheckItem } = require('../api/precheck');
const { renderSSR, invalidateCache, warmupCache, ssrCache } = require('./ssr-with-lru');
const { renderSkeleton } = require('./skeleton');
const Redis = require('ioredis');

const app = new Koa();
const router = new Router();

// ===== Redis 订阅客户端（用于接收缓存失效通知）=====
const subscriber = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || ''
});

/**
 * 订阅商品更新消息
 * 当商品管理服务更新商品时，会发布消息到 'item:updated' 频道
 * SSR 服务收到消息后，立即清除对应的缓存
 */
subscriber.subscribe('item:updated', (err) => {
  if (err) {
    console.error('❌ 订阅失败:', err);
  } else {
    console.log('✅ 已订阅商品更新通知: item:updated');
  }
});

subscriber.on('message', (channel, message) => {
  try {
    const { itemId } = JSON.parse(message);
    console.log(`📢 收到商品更新通知: ${itemId}`);

    // 清除 LRU 缓存
    invalidateCache(itemId);

    console.log(`✅ 缓存已更新: ${itemId}`);
  } catch (error) {
    console.error('❌ 处理消息失败:', error);
  }
});

// 静态资源服务
app.use(serve(path.join(__dirname, '../../public')));

// 请求日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ctx.status} - ${ms}ms`);
});

/**
 * 核心路由 - 商品详情页
 * 使用 LRU 缓存优化 SSR 性能
 */
router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const startTime = Date.now();

  try {
    // 1. 调用轻量级预检接口
    const { isSeckill, data } = await precheckItem(itemId);
    const precheckTime = Date.now() - startTime;

    console.log(`\n📊 商品 ${itemId} 预检结果:`, { isSeckill, 耗时: `${precheckTime}ms` });

    // 2. 根据预检结果选择渲染策略
    if (isSeckill) {
      // 秒杀商品 - 返回 CSR 骨架页
      console.log(`⚡ 秒杀商品，返回骨架页`);
      ctx.type = 'html';
      ctx.body = renderSkeleton(itemId, data);
      console.log(`✅ 总耗时: ${Date.now() - startTime}ms\n`);
    } else {
      // 普通商品 - SSR 渲染（带 LRU 缓存）
      console.log(`🎨 普通商品，执行 SSR 渲染（LRU 缓存）`);
      const html = await renderSSR(itemId);
      ctx.type = 'html';
      ctx.body = html;
      console.log(`✅ 总耗时: ${Date.now() - startTime}ms\n`);
    }
  } catch (error) {
    console.error('❌ 渲染失败:', error);
    ctx.status = 500;
    ctx.body = '页面加载失败';
  }
});

/**
 * API 路由 - 获取商品详情数据
 */
router.get('/api/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  // Mock 数据
  ctx.body = {
    success: true,
    data: {
      itemId,
      title: `秒杀商品 ${itemId}`,
      price: 99.99,
      stock: 100,
      description: '这是秒杀商品描述',
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
 * LRU 缓存统计接口
 */
router.get('/api/lru-stats', (ctx) => {
  const stats = ssrCache.getStats();
  ctx.body = {
    success: true,
    data: stats,
    timestamp: Date.now()
  };
});

/**
 * 清除 LRU 缓存接口
 */
router.post('/api/lru-cache/clear', (ctx) => {
  ssrCache.clear();
  ctx.body = {
    success: true,
    message: 'LRU 缓存已清空'
  };
});

/**
 * 清除指定商品的 LRU 缓存
 */
router.post('/api/lru-cache/invalidate/:id', (ctx) => {
  const itemId = ctx.params.id;
  invalidateCache(itemId);
  ctx.body = {
    success: true,
    message: `商品 ${itemId} 的缓存已清除`
  };
});

/**
 * 预热 LRU 缓存接口
 */
router.post('/api/lru-cache/warmup', async (ctx) => {
  const { itemIds } = ctx.request.body || {};

  if (!itemIds || !Array.isArray(itemIds)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      message: '请提供 itemIds 数组'
    };
    return;
  }

  const results = await warmupCache(itemIds);

  ctx.body = {
    success: true,
    message: '缓存预热完成',
    results
  };
});

/**
 * 获取 LRU 缓存的所有键
 */
router.get('/api/lru-cache/keys', (ctx) => {
  const keys = ssrCache.keys();
  ctx.body = {
    success: true,
    data: keys,
    count: keys.length
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 服务器启动成功: http://localhost:${PORT}`);
  console.log(`📦 环境: ${process.env.NODE_ENV || 'development'}`);

  // 可选：启动时预热热门商品缓存
  // const hotItems = ['123', '456', '789'];
  // await warmupCache(hotItems);
});

module.exports = app;
