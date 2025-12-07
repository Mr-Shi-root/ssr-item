const axios = require('axios');
const { cacheHelper } = require('../utils/redis');

/**
 * 增强版轻量级预检接口
 *
 * 新增功能：
 * 1. 性能监控
 * 2. 多级降级策略
 * 3. 智能决策（不只是秒杀判断）
 * 4. 熔断机制
 */

// 熔断器状态
let circuitBreaker = {
  failureCount: 0,
  lastFailureTime: 0,
  state: 'CLOSED' // CLOSED | OPEN | HALF_OPEN
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,      // 失败 5 次后熔断
  timeout: 30000,           // 熔断 30 秒
  halfOpenRequests: 3       // 半开状态允许 3 次尝试
};

/**
 * 增强版预检接口
 */
async function precheckItemEnhanced(itemId) {
  const cacheKey = `precheck:${itemId}`;
  const perfStart = Date.now();

  try {
    // 1. 检查熔断器状态
    if (circuitBreaker.state === 'OPEN') {
      const now = Date.now();
      if (now - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_CONFIG.timeout) {
        // 进入半开状态
        circuitBreaker.state = 'HALF_OPEN';
        console.log('🔄 熔断器进入半开状态');
      } else {
        // 熔断中，直接降级
        console.log('⚠️ 熔断器开启，使用降级策略');
        return getFallbackStrategy(itemId);
      }
    }

    // 2. 查询 Redis 缓存
    const cached = await cacheHelper.get(cacheKey, 'precheck');
    if (cached) {
      const perfTime = Date.now() - perfStart;
      console.log(`✅ 预检缓存命中: ${itemId} (${perfTime}ms)`);

      // 记录性能指标
      recordMetrics('precheck', 'cache_hit', perfTime);

      return cached;
    }

    // 3. 调用预检 API
    console.log(`⚠️ 预检缓存未命中: ${itemId}，调用接口`);

    const apiStart = Date.now();
    const result = await callPrecheckAPI(itemId);
    const apiTime = Date.now() - apiStart;

    console.log(`📡 预检 API 响应: ${itemId} (${apiTime}ms)`);

    // 4. 智能决策：根据商品特征选择渲染策略
    const strategy = determineRenderStrategy(result);

    // 5. 写入缓存（根据商品类型设置不同 TTL）
    const ttl = strategy.cacheStrategy.ttl;
    await cacheHelper.set(cacheKey, strategy, ttl);
    console.log(`📝 预检结果已缓存: ${itemId}, TTL: ${ttl}s`);

    // 6. 记录性能指标
    const totalTime = Date.now() - perfStart;
    recordMetrics('precheck', 'api_call', totalTime);

    // 7. 熔断器恢复
    if (circuitBreaker.state === 'HALF_OPEN') {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;
      console.log('✅ 熔断器恢复正常');
    }

    return strategy;

  } catch (error) {
    console.error('预检接口调用失败:', error);

    // 熔断器计数
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();

    if (circuitBreaker.failureCount >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      circuitBreaker.state = 'OPEN';
      console.log('🔴 熔断器开启');
    }

    // 记录错误指标
    recordMetrics('precheck', 'error', Date.now() - perfStart);

    // 降级策略
    return getFallbackStrategy(itemId);
  }
}

/**
 * 调用预检 API
 */
async function callPrecheckAPI(itemId) {
  // 实际项目中替换为真实接口
  // const response = await axios.get(`https://api.example.com/precheck/${itemId}`, {
  //   timeout: 3000 // 3 秒超时
  // });
  // return response.data;

  // Mock 实现
  return mockPrecheckAPI(itemId);
}

/**
 * Mock 预检 API（增强版）
 */
function mockPrecheckAPI(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const isSeckill = itemId.startsWith('SK');
      const isHot = itemId.includes('HOT');
      const stockLevel = Math.random() > 0.7 ? 'low' : 'high';

      resolve({
        itemId,
        isSeckill,
        isHot,
        stockLevel,

        // 商品基本信息
        basicInfo: {
          title: `商品 ${itemId}`,
          price: 199.99,
          status: 'active'
        },

        // 秒杀信息（如果是秒杀商品）
        seckillInfo: isSeckill ? {
          startTime: Date.now(),
          endTime: Date.now() + 3600000,
          seckillPrice: 99.99,
          totalStock: 1000,
          remainStock: 500
        } : null
      });
    }, 50);
  });
}

/**
 * 智能决策：根据商品特征选择渲染策略
 */
function determineRenderStrategy(precheckData) {
  const { isSeckill, isHot, stockLevel } = precheckData;

  // 策略 1: 秒杀商品 → CSR 骨架页
  if (isSeckill) {
    return {
      renderStrategy: 'csr',
      cacheStrategy: {
        enabled: false, // 秒杀商品不缓存（数据实时变化）
        ttl: 0
      },
      metadata: {
        ...precheckData,
        reason: '秒杀商品，使用 CSR 保证实时性'
      }
    };
  }

  // 策略 2: 热门商品 + 低库存 → 流式渲染 + 短缓存
  if (isHot && stockLevel === 'low') {
    return {
      renderStrategy: 'streaming',
      cacheStrategy: {
        enabled: true,
        ttl: 30 // 30 秒短缓存
      },
      metadata: {
        ...precheckData,
        reason: '热门低库存商品，流式渲染 + 短缓存'
      }
    };
  }

  // 策略 3: 热门商品 → SSR + 短缓存
  if (isHot) {
    return {
      renderStrategy: 'ssr',
      cacheStrategy: {
        enabled: true,
        ttl: 60 // 1 分钟缓存
      },
      metadata: {
        ...precheckData,
        reason: '热门商品，SSR + 短缓存'
      }
    };
  }

  // 策略 4: 普通商品 → SSR + 长缓存
  return {
    renderStrategy: 'ssr',
    cacheStrategy: {
      enabled: true,
      ttl: 300 // 5 分钟缓存
    },
    metadata: {
      ...precheckData,
      reason: '普通商品，SSR + 长缓存'
    }
  };
}

/**
 * 降级策略：预检接口失败时的兜底方案
 */
function getFallbackStrategy(itemId) {
  console.log(`🔧 使用降级策略: ${itemId}`);

  // 根据 itemId 的特征进行简单判断
  const isSeckill = itemId.startsWith('SK');

  if (isSeckill) {
    // 秒杀商品降级：使用 CSR
    return {
      renderStrategy: 'csr',
      cacheStrategy: { enabled: false, ttl: 0 },
      metadata: {
        itemId,
        isSeckill: true,
        fallback: true,
        reason: '预检接口失败，降级为 CSR'
      }
    };
  } else {
    // 普通商品降级：使用 SSR + 中等缓存
    return {
      renderStrategy: 'ssr',
      cacheStrategy: { enabled: true, ttl: 180 },
      metadata: {
        itemId,
        isSeckill: false,
        fallback: true,
        reason: '预检接口失败，降级为 SSR'
      }
    };
  }
}

/**
 * 性能指标记录
 */
function recordMetrics(service, type, duration) {
  // 实际项目中应该上报到监控系统（如 Prometheus、DataDog）
  const metrics = {
    service,
    type,
    duration,
    timestamp: Date.now()
  };

  // 简单的日志记录
  if (duration > 100) {
    console.warn(`⚠️ 性能告警: ${service}.${type} 耗时 ${duration}ms`);
  }

  // TODO: 上报到监控系统
  // prometheus.histogram('precheck_duration', duration, { type });
}

/**
 * 获取熔断器状态（用于监控）
 */
function getCircuitBreakerStatus() {
  return {
    ...circuitBreaker,
    config: CIRCUIT_BREAKER_CONFIG
  };
}

/**
 * 重置熔断器（用于运维）
 */
function resetCircuitBreaker() {
  circuitBreaker = {
    failureCount: 0,
    lastFailureTime: 0,
    state: 'CLOSED'
  };
  console.log('🔄 熔断器已重置');
}

module.exports = {
  precheckItemEnhanced,
  getCircuitBreakerStatus,
  resetCircuitBreaker
};
