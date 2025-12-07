const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const path = require('path');
const { precheckItem } = require('../api/precheck');
const { renderSSR } = require('./ssr');
const { renderSkeleton } = require('./skeleton');
const { cacheHelper } = require('../utils/redis');

const app = new Koa();
const router = new Router();

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
 * 根据预检接口判断渲染方式
 * 支持 Redis 多级缓存
 */
router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const startTime = Date.now();

  try {
    // 1. 调用轻量级预检接口（带 Redis 缓存）
    const { isSeckill, data } = await precheckItem(itemId);
    const precheckTime = Date.now() - startTime;

    console.log(`\n📊 商品 ${itemId} 预检结果:`, { isSeckill, 耗时: `${precheckTime}ms` });

    // 2. 根据预检结果选择渲染策略
    if (isSeckill) {
      // 秒杀商品 - 返回 CSR 骨架页（不需要缓存，直接返回静态 HTML）
      console.log(`⚡ 秒杀商品，返回骨架页`);
      ctx.type = 'html';
      ctx.body = renderSkeleton(itemId, data);
      console.log(`✅ 总耗时: ${Date.now() - startTime}ms\n`);
    } else {
      // 普通商品 - SSR 渲染（带 Redis 缓存）
      console.log(`🎨 普通商品，执行 SSR 渲染`);
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
 * 用于 CSR 骨架页的数据获取
 * 支持 Redis 缓存
 */
router.get('/api/item/:id', async (ctx) => {
  const itemId = ctx.params.id;
  const cacheKey = `item:${itemId}`;

  try {
    // 1. 先查 Redis 缓存
    let itemData = await cacheHelper.get(cacheKey, 'item');

    if (itemData) {
      console.log(`✅ API 商品数据缓存命中: ${itemId}`);
    } else {
      console.log(`⚠️ API 商品数据缓存未命中: ${itemId}`);

      // 2. 缓存未命中，获取数据
      // 实际项目中应该调用真实的商品详情接口
      // const response = await axios.get(`https://api.example.com/item/${itemId}`);
      // itemData = response.data;

      // Mock 数据 - 开发时使用
      itemData = {
        itemId,
        title: `秒杀商品 ${itemId}`,
        price: 99.99,
        stock: 100,
        description: '这是秒杀商品描述',
        images: ['/images/placeholder.jpg']
      };

      // 3. 写入 Redis 缓存，TTL 300 秒
      await cacheHelper.set(cacheKey, itemData, 300);
      console.log(`📝 API 商品数据已缓存: ${itemId}`);
    }

    ctx.body = {
      success: true,
      data: itemData
    };
  } catch (error) {
    console.error('API 获取商品数据失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '获取商品数据失败'
    };
  }
});

/**
 * 健康检查接口
 */
router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() };
});

/**
 * 缓存统计接口
 */
router.get('/api/cache-stats', (ctx) => {
  const stats = cacheHelper.getStats();
  ctx.body = {
    success: true,
    data: stats,
    timestamp: Date.now()
  };
});

/**
 * 清除缓存接口
 */
router.post('/api/cache/clear/:type?', async (ctx) => {
  const type = ctx.params.type;

  try {
    let count = 0;

    if (type === 'precheck') {
      count = await cacheHelper.delPattern('precheck:*');
    } else if (type === 'ssr') {
      count = await cacheHelper.delPattern('ssr:*');
    } else if (type === 'item') {
      count = await cacheHelper.delPattern('item:*');
    } else {
      // 清除所有缓存
      count += await cacheHelper.delPattern('precheck:*');
      count += await cacheHelper.delPattern('ssr:*');
      count += await cacheHelper.delPattern('item:*');
    }

    ctx.body = {
      success: true,
      message: `已清除 ${count} 个缓存`,
      type: type || 'all'
    };
  } catch (error) {
    console.error('清除缓存失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '清除缓存失败'
    };
  }
});

/**
 * 清除指定商品的所有缓存
 */
router.post('/api/cache/clear/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  try {
    await cacheHelper.del(`precheck:${itemId}`);
    await cacheHelper.del(`ssr:${itemId}`);
    await cacheHelper.del(`item:${itemId}`);

    ctx.body = {
      success: true,
      message: `已清除商品 ${itemId} 的所有缓存`
    };
  } catch (error) {
    console.error('清除商品缓存失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '清除商品缓存失败'
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
