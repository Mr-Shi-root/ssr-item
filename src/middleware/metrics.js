const metricsCollector = require('../utils/metrics');

/**
 * Metrics 收集中间件
 * 自动收集 HTTP 请求指标
 */
function metricsMiddleware() {
  return async (ctx, next) => {
    const startTime = Date.now();
    const path = ctx.path;
    const method = ctx.method;

    // 增加请求计数
    metricsCollector.incrementCounter('http_requests_total', {
      method,
      path,
    });

    // 增加进行中的请求数
    metricsCollector.incrementGauge('http_requests_in_progress', { method, path });

    try {
      await next();

      const duration = Date.now() - startTime;
      const status = ctx.status;

      // 记录请求时长
      metricsCollector.observeHistogram('http_request_duration_milliseconds', {
        method,
        path,
        status: String(status)
      }, duration);

      // 记录响应大小
      if (ctx.length) {
        metricsCollector.observeHistogram('http_response_size_bytes', {
          method,
          path,
          status: String(status)
        }, ctx.length);
      }

      // 按状态码计数
      metricsCollector.incrementCounter('http_responses_total', {
        method,
        path,
        status: String(status)
      });

    } catch (error) {
      // 记录错误
      metricsCollector.incrementCounter('http_errors_total', {
        method,
        path,
        error: error.name || 'Error'
      });

      throw error;
    } finally {
      // 减少进行中的请求数
      metricsCollector.decrementGauge('http_requests_in_progress', { method, path });
    }
  };
}

module.exports = metricsMiddleware;
