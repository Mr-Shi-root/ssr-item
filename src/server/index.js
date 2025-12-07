const Koa = require('koa');
const Router = require('koa-router');
const serve = require('koa-static');
const path = require('path');
const { precheckItem } = require('../api/precheck');
const { renderSSR } = require('./ssr');
const { renderSkeleton } = require('./skeleton');

const app = new Koa();
const router = new Router();

// 静态资源服务
app.use(serve(path.join(__dirname, '../../public')));

/**
 * 核心路由 - 商品详情页
 * 根据预检接口判断渲染方式
 */
router.get('/item/:id', async (ctx) => {
  const itemId = ctx.params.id;

  try {
    // 1. 调用轻量级预检接口
    const { isSeckill, data } = await precheckItem(itemId);

    console.log(`商品 ${itemId} 预检结果:`, { isSeckill, data });

    // 2. 根据预检结果选择渲染策略
    if (isSeckill) {
      // 秒杀商品 - 返回 CSR 骨架页
      ctx.type = 'html';
      ctx.body = renderSkeleton(itemId, data);
    } else {
      // 普通商品 - SSR 渲染
      const html = await renderSSR(itemId);
      ctx.type = 'html';
      ctx.body = html;
    }
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

app.use(router.routes());
app.use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 服务器启动成功: http://localhost:${PORT}`);
  console.log(`📦 环境: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
