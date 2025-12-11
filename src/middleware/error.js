const { logger } = require('../utils/logger');

/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误
 */
function errorMiddleware() {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const trace = ctx.state.trace || {};

      // 记录错误日志
      logger.error('未捕获的错误', {
        traceId: trace.traceId,
        requestId: trace.requestId,
        path: ctx.path,
        method: ctx.method,
        error: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode || error.status || 500
      });

      // 设置响应状态
      ctx.status = error.statusCode || error.status || 500;

      // 生产环境不暴露错误堆栈
      if (process.env.NODE_ENV === 'production') {
        ctx.body = {
          success: false,
          message: '服务器内部错误',
          requestId: trace.requestId,
          timestamp: Date.now()
        };
      } else {
        ctx.body = {
          success: false,
          message: error.message,
          stack: error.stack,
          requestId: trace.requestId,
          timestamp: Date.now()
        };
      }

      // 触发错误事件（可用于告警）
      ctx.app.emit('error', error, ctx);
    }
  };
}

module.exports = errorMiddleware;
