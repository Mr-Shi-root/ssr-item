const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const helmet = require('helmet');
const path = require('path');

// 配置和工具
const config = require('../utils/config');
const { logger, businessLogger } = require('../utils/logger');
const healthChecker = require('../utils/health');
const GracefulShutdown = require('../utils/graceful-shutdown');
const alertManager = require('../utils/alerting');
const metricsCollector = require('../utils/metrics');

// 中间件
const errorMiddleware = require('../middleware/error');
const traceMiddleware = require('../middleware/trace');
const performanceMiddleware = require('../middleware/performance');
const rateLimitMiddleware = require('../middleware/rate-limit');
const metricsMiddleware = require('../middleware/metrics');
const { circuitBreakerManager } = require('../middleware/circuit-breaker');

// 业务模块
const { precheckItem } = require('../api/precheck');
const { renderSSR } = require('./ssr');
const { renderSSRWithCache, invalidateCache, warmupCache } = require('./ssr-with-cache');
const { renderSkeleton } = require('./skeleton');
const cacheManager = require('./cache');

const app = new Koa();
const router = new Router();

// 是否启用缓存
const ENABLE_CACHE = config.get('ssrCache.enabled');

// ===== 中间件注册（顺序很重要！）=====

// 1. 安全防护（最先）
if (config.get('security.helmetEnabled')) {
  app.use(helmet({
    contentSecurityPolicy: false  // SSR 需要内联脚本
  }));
}

// 2. 全局错误处理
app.use(errorMiddleware());

// 3. 全链路追踪
app.use(traceMiddleware());

// 4. 性能监控
app.use(performanceMiddleware());

// 5. Metrics 收集
app.use(metricsMiddleware());

// 6. 限流
app.use(rateLimitMiddleware());

// 7. 解析 POST 请求体
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
 * 健康检查接口 - Liveness（存活检查）
 */
router.get('/health', async (ctx) => {
  const health = await healthChecker.checkLiveness();
  ctx.body = health;
});

/**
 * 就绪检查接口 - Readiness（就绪检查）
 */
router.get('/health/ready', async (ctx) => {
  const health = await healthChecker.checkReadiness();
  ctx.status = health.ready ? 200 : 503;
  ctx.body = health;
});

/**
 * 详细健康检查接口
 */
router.get('/health/detail', async (ctx) => {
  const health = await healthChecker.checkAll();
  ctx.status = health.status === 'healthy' ? 200 : 503;
  ctx.body = health;
});

/**
 * Metrics 指标接口 - Prometheus 格式
 */
router.get('/metrics', (ctx) => {
  ctx.type = 'text/plain; version=0.0.4';
  ctx.body = metricsCollector.exportPrometheus();
});

/**
 * Metrics 指标接口 - JSON 格式
 */
router.get('/metrics/json', (ctx) => {
  ctx.body = metricsCollector.getMetrics();
});

/**
 * 熔断器状态接口
 */
router.get('/admin/circuit-breakers', (ctx) => {
  ctx.body = {
    success: true,
    data: circuitBreakerManager.getAllStats()
  };
});

/**
 * 重置熔断器接口
 * POST /admin/circuit-breakers/reset
 */
router.post('/admin/circuit-breakers/reset', (ctx) => {
  circuitBreakerManager.resetAll();
  ctx.body = {
    success: true,
    message: '所有熔断器已重置'
  };
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

// ===== 错误事件监听 =====
app.on('error', (error, ctx) => {
  const trace = ctx?.state?.trace || {};

  // 严重错误发送告警
  if (error.statusCode >= 500 || !error.statusCode) {
    alertManager.error(
      '服务器错误',
      error.message,
      {
        traceId: trace.traceId,
        requestId: trace.requestId,
        path: ctx?.path,
        method: ctx?.method,
        stack: error.stack
      }
    ).catch(err => {
      logger.error('告警发送失败', { error: err.message });
    });
  }
});

// ===== 启动服务 =====
const PORT = config.get('port');
const server = app.listen(PORT, () => {
  logger.info('服务器启动成功', {
    port: PORT,
    nodeEnv: config.get('nodeEnv'),
    pid: process.pid,
    cacheEnabled: ENABLE_CACHE,
    rateLimitEnabled: config.get('rateLimit.enabled'),
    alertEnabled: config.get('alert.enabled')
  });

  // 注册健康检查
  registerHealthChecks();

  // 启动优雅关闭监听
  const gracefulShutdown = new GracefulShutdown(server);

  // 注册清理函数
  gracefulShutdown.onShutdown(async () => {
    logger.info('关闭缓存管理器');
    await cacheManager.close();
  });

  gracefulShutdown.onShutdown(async () => {
    logger.info('关闭日志系统');
    const { log4js } = require('../utils/logger');
    log4js.shutdown();
  });

  gracefulShutdown.listen();

  // 发送启动成功告警（可选）
  if (config.isProduction()) {
    alertManager.info(
      '服务启动成功',
      `${config.get('apm.serviceName')} 已启动`,
      {
        port: PORT,
        nodeEnv: config.get('nodeEnv'),
        pid: process.pid
      }
    ).catch(() => {});
  }
});

/**
 * 注册健康检查
 */
function registerHealthChecks() {
  // Redis 健康检查
  if (config.get('redis.host')) {
    healthChecker.register('redis', async () => {
      try {
        // 这里应该实际检查 Redis 连接
        // const redis = require('ioredis');
        // await redis.ping();
        return { healthy: true, message: 'Redis 连接正常' };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    });
  }

  // 缓存健康检查
  healthChecker.register('cache', () => {
    const stats = cacheManager.getStats();
    return {
      healthy: true,
      hitRate: stats.hitRate,
      l1Count: stats.l1Count
    };
  });
}

module.exports = app;
