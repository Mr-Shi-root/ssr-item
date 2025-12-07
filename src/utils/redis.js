const Redis = require('ioredis');

/**
 * Redis 客户端配置
 * 用于缓存预检结果、SSR 渲染结果、商品数据
 */
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

// 连接成功
redis.on('connect', () => {
  console.log('✅ Redis 连接成功');
});

// 连接就绪
redis.on('ready', () => {
  console.log('✅ Redis 就绪');
});

// 连接错误
redis.on('error', (err) => {
  console.error('❌ Redis 连接失败:', err.message);
});

// 连接关闭
redis.on('close', () => {
  console.log('⚠️ Redis 连接关闭');
});

/**
 * 缓存工具类
 */
class CacheHelper {
  constructor(redisClient) {
    this.redis = redisClient;
    this.stats = {
      precheck: { hit: 0, miss: 0 },
      ssr: { hit: 0, miss: 0 },
      item: { hit: 0, miss: 0 }
    };
  }

  /**
   * 获取缓存（带统计）
   */
  async get(key, type = 'item') {
    try {
      const value = await this.redis.get(key);
      if (value) {
        this.stats[type].hit++;
        return JSON.parse(value);
      }
      this.stats[type].miss++;
      return null;
    } catch (error) {
      console.error(`Redis GET 失败 [${key}]:`, error.message);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set(key, value, ttl = 60) {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Redis SET 失败 [${key}]:`, error.message);
      return false;
    }
  }

  /**
   * 获取字符串缓存（用于 HTML）
   */
  async getString(key, type = 'ssr') {
    try {
      const value = await this.redis.get(key);
      if (value) {
        this.stats[type].hit++;
        return value;
      }
      this.stats[type].miss++;
      return null;
    } catch (error) {
      console.error(`Redis GET 失败 [${key}]:`, error.message);
      return null;
    }
  }

  /**
   * 设置字符串缓存（用于 HTML）
   */
  async setString(key, value, ttl = 60) {
    try {
      await this.redis.setex(key, ttl, value);
      return true;
    } catch (error) {
      console.error(`Redis SET 失败 [${key}]:`, error.message);
      return false;
    }
  }

  /**
   * 删除缓存
   */
  async del(key) {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error(`Redis DEL 失败 [${key}]:`, error.message);
      return false;
    }
  }

  /**
   * 批量删除缓存（支持通配符）
   */
  async delPattern(pattern) {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error(`Redis DEL Pattern 失败 [${pattern}]:`, error.message);
      return 0;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const result = ;
    for (const [type, stats] of Object.entries(this.stats)) {
      const total = stats.hit + stats.miss;
      const hitRate = total === 0 ? 0 : ((stats.hit / total) * 100).toFixed(2);
      result[type] = {
        hit: stats.hit,
        miss: stats.miss,
        total,
        hitRate: `${hitRate}%`
      };
    }
    return result;
  }

  /**
   * 重置统计
   */
  resetStats() {
    for (const type in this.stats) {
      this.stats[type] = { hit: 0, miss: 0 };
    }
  }
}

const cacheHelper = new CacheHelper(redis);

module.exports = {
  redis,
  cacheHelper
};
