const { v4: uuidv4 } = require('uuid');

/**
 * 全链路追踪工具
 * 用于生成和管理 Request ID、Trace ID
 */
class Tracer {
  /**
   * 生成 Request ID
   */
  static generateRequestId() {
    return `req-${Date.now()}-${uuidv4().substring(0, 8)}`;
  }

  /**
   * 生成 Trace ID
   */
  static generateTraceId() {
    return `trace-${uuidv4()}`;
  }

  /**
   * 从请求头中提取或生成 Trace ID
   */
  static getOrCreateTraceId(ctx) {
    // 优先使用上游传递的 Trace ID
    return ctx.headers['x-trace-id'] ||
           ctx.headers['x-request-id'] ||
           this.generateTraceId();
  }

  /**
   * 创建追踪上下文
   */
  static createTraceContext(ctx) {
    const traceId = this.getOrCreateTraceId(ctx);
    const requestId = this.generateRequestId();
    const spanId = uuidv4().substring(0, 8);

    return {
      traceId,
      requestId,
      spanId,
      startTime: Date.now(),
      path: ctx.path,
      method: ctx.method,
      ip: ctx.ip,
      userAgent: ctx.headers['user-agent'],
      referer: ctx.headers['referer']
    };
  }

  /**
   * 记录追踪信息到响应头
   */
  static setTraceHeaders(ctx, traceContext) {
    ctx.set('X-Trace-Id', traceContext.traceId);
    ctx.set('X-Request-Id', traceContext.requestId);
    ctx.set('X-Span-Id', traceContext.spanId);
  }
}

module.exports = Tracer;
