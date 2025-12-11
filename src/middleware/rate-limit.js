const { logger } = require('../utils/logger');
const config = require('../utils/config');

/**
 * 简单的内存限流器
 * 生产环境建议使用 Redis 实现分布式限流
 */
class RateLimiter {
  constructor(options = {}) {
    this.max = options.max || 100;  // 最大请求数
    this.window = options.window || 60000;  // 时间窗口（毫秒）
    this.store = new Map();  // IP -> { count, resetTime }

    // 定期清理过期数据
    setInterval(() => this.cleanup(), this.window);
  }

  /**
   * 检查是否超过限流
   */
  check(key) {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      // 新的时间窗口
      this.store.set(key, {
        count: 1,
        resetTime: now + this.window
      });
      return { allowed: true, remaining: this.max - 1 };
    }

    if (record.count >= this.max) {
      // 超过限流
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      };
    }

    // 增加计数
    record.count++;
    return {
      allowed: true,
      remaining: this.max - record.count
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// 创建限流器实例
const rateLimiter = new RateLimiter({
  max: config.get('rateLimit.max'),
  window: config.get('rateLimit.window')
});

/**
 * 限流中间件
 */
function rateLimitMiddleware() {
  const enabled = config.get('rateLimit.enabled');

  return async (ctx, next) => {
    if (!enabled) {
      return await next();
    }

    const key = ctx.ip;  // 使用 IP 作为限流 key
    const result = rateLimiter.check(key);
    const trace = ctx.state.trace || {};

    // 设置限流响应头
    ctx.set('X-RateLimit-Limit', rateLimiter.max.toString());
    ctx.set('X-RateLimit-Remaining', result.remaining.toString());

    if (!result.allowed) {
      // 超过限流
      ctx.set('X-RateLimit-Reset', result.retryAfter.toString());
      ctx.set('Retry-After', result.retryAfter.toString());

      logger.warn('请求被限流', {
        traceId: trace.traceId,
        requestId: trace.requestId,
        ip: ctx.ip,
        path: ctx.path,
        retryAfter: result.retryAfter
      });

      ctx.status = 429;
      ctx.body = {
        success: false,
        message: '请求过于频繁，请稍后再试',
        retryAfter: result.retryAfter,
        requestId: trace.requestId
      };
      return;
    }

    await next();
  };
}

module.exports = rateLimitMiddleware;
