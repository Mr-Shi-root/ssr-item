const { logger } = require('../utils/logger');
const metricsCollector = require('../utils/metrics');
const alertManager = require('../utils/alerting');

/**
 * 熔断器状态
 */
const CircuitState = {
  CLOSED: 'CLOSED',       // 关闭状态（正常）
  OPEN: 'OPEN',           // 打开状态（熔断）
  HALF_OPEN: 'HALF_OPEN'  // 半开状态（尝试恢复）
};

/**
 * 熔断器
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;  // 失败阈值
    this.successThreshold = options.successThreshold || 2;  // 成功阈值（半开状态）
    this.timeout = options.timeout || 60000;  // 熔断超时时间（毫秒）
    this.monitoringPeriod = options.monitoringPeriod || 10000;  // 监控周期

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.lastStateChange = Date.now();

    // 统计信息
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      lastFailureTime: null,
      lastSuccessTime: null
    };
  }

  /**
   * 执行请求
   */
  async execute(fn) {
    this.stats.totalRequests++;

    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        // 熔断中，拒绝请求
        this.stats.rejectedRequests++;
        metricsCollector.incrementCounter('circuit_breaker_rejected_total', {
          name: this.name
        });

        const error = new Error('Circuit breaker is OPEN');
        error.code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      } else {
        // 尝试半开
        this.toHalfOpen();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 请求成功
   */
  onSuccess() {
    this.stats.successfulRequests++;
    this.stats.lastSuccessTime = Date.now();

    metricsCollector.incrementCounter('circuit_breaker_success_total', {
      name: this.name
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        // 恢复到关闭状态
        this.toClosed();
      }
    } else {
      // 重置失败计数
      this.failureCount = 0;
    }
  }

  /**
   * 请求失败
   */
  onFailure() {
    this.stats.failedRequests++;
    this.stats.lastFailureTime = Date.now();
    this.failureCount++;

    metricsCollector.incrementCounter('circuit_breaker_failure_total', {
      name: this.name
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态失败，立即打开
      this.toOpen();
    } else if (this.failureCount >= this.failureThreshold) {
      // 失败次数达到阈值，打开熔断器
      this.toOpen();
    }
  }

  /**
   * 切换到关闭状态
   */
  toClosed() {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();

    logger.info('熔断器恢复', {
      name: this.name,
      previousState,
      currentState: this.state
    });

    metricsCollector.setGauge('circuit_breaker_state', {
      name: this.name
    }, 0);

    // 发送恢复告警
    alertManager.info(
      '熔断器恢复',
      `熔断器 ${this.name} 已恢复正常`,
      { stats: this.getStats() }
    ).catch(() => {});
  }

  /**
   * 切换到打开状态
   */
  toOpen() {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.timeout;
    this.lastStateChange = Date.now();

    logger.error('熔断器打开', {
      name: this.name,
      previousState,
      currentState: this.state,
      failureCount: this.failureCount,
      nextAttempt: new Date(this.nextAttempt).toISOString()
    });

    metricsCollector.setGauge('circuit_breaker_state', {
      name: this.name
    }, 1);

    // 发送熔断告警
    alertManager.error(
      '熔断器触发',
      `熔断器 ${this.name} 已打开，服务降级`,
      {
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        stats: this.getStats()
      }
    ).catch(() => {});
  }

  /**
   * 切换到半开状态
   */
  toHalfOpen() {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.lastStateChange = Date.now();

    logger.info('熔断器半开', {
      name: this.name,
      previousState,
      currentState: this.state
    });

    metricsCollector.setGauge('circuit_breaker_state', {
      name: this.name
    }, 0.5);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const successRate = this.stats.totalRequests > 0
      ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: {
        ...this.stats,
        successRate: `${successRate}%`
      },
      config: {
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.timeout
      },
      lastStateChange: new Date(this.lastStateChange).toISOString()
    };
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      lastFailureTime: null,
      lastSuccessTime: null
    };

    logger.info('熔断器已重置', { name: this.name });
  }
}

/**
 * 熔断器管理器
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * 获取或创建熔断器
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ ...options, name }));
    }
    return this.breakers.get(name);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStats() {
    const stats = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// 创建全局熔断器管理器
const circuitBreakerManager = new CircuitBreakerManager();

/**
 * 熔断器中间件工厂
 */
function createCircuitBreakerMiddleware(name, options = {}) {
  const breaker = circuitBreakerManager.getBreaker(name, options);

  return async (ctx, next) => {
    try {
      await breaker.execute(async () => {
        await next();

        // 根据响应状态判断成功或失败
        if (ctx.status >= 500) {
          throw new Error(`Server error: ${ctx.status}`);
        }
      });
    } catch (error) {
      if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        // 熔断器打开，返回降级响应
        ctx.status = 503;
        ctx.body = {
          success: false,
          message: '服务暂时不可用，请稍后重试',
          code: 'SERVICE_UNAVAILABLE',
          requestId: ctx.state.trace?.requestId
        };
        return;
      }
      throw error;
    }
  };
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  createCircuitBreakerMiddleware,
  CircuitState
};
