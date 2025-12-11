const Tracer = require('../utils/tracer');
const { accessLogger } = require('../utils/logger');

/**
 * 全链路追踪中间件
 * 为每个请求生成唯一的追踪 ID
 */
function traceMiddleware() {
  return async (ctx, next) => {
    // 创建追踪上下文
    const traceContext = Tracer.createTraceContext(ctx);

    // 将追踪上下文挂载到 ctx.state，供后续中间件使用
    ctx.state.trace = traceContext;

    // 设置响应头
    Tracer.setTraceHeaders(ctx, traceContext);

    try {
      await next();

      // 记录访问日志
      const duration = Date.now() - traceContext.startTime;
      accessLogger.info('请求完成', {
        ...traceContext,
        status: ctx.status,
        duration,
        responseSize: ctx.length || 0
      });
    } catch (error) {
      // 记录错误日志
      const duration = Date.now() - traceContext.startTime;
      accessLogger.error('请求失败', {
        ...traceContext,
        status: ctx.status || 500,
        duration,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  };
}

module.exports = traceMiddleware;
