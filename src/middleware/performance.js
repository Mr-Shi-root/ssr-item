const { performanceLogger } = require('../utils/logger');

/**
 * 性能监控中间件
 * 记录每个请求的性能指标
 */
function performanceMiddleware() {
  return async (ctx, next) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    await next();

    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    const trace = ctx.state.trace || {};

    // 记录性能指标
    performanceLogger.info('请求性能', {
      traceId: trace.traceId,
      requestId: trace.requestId,
      path: ctx.path,
      method: ctx.method,
      status: ctx.status,
      duration,
      memory: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        rss: endMemory.rss
      },
      responseSize: ctx.length || 0
    });

    // 添加性能指标到响应头
    ctx.set('X-Response-Time', `${duration}ms`);
    ctx.set('Server-Timing', `total;dur=${duration}`);

    // 慢请求告警
    if (duration > 1000) {
      performanceLogger.warn('慢请求告警', {
        traceId: trace.traceId,
        requestId: trace.requestId,
        path: ctx.path,
        duration,
        threshold: 1000
      });
    }
  };
}

module.exports = performanceMiddleware;
