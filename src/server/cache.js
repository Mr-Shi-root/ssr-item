const LRU = require('lru-cache');
const Redis = require('ioredis');

/**
 * 三级缓存管理器
 * L1: 内存缓存（LRU）- 最快，但容量有限
 * L2: Redis 缓存 - 快速，跨进程共享
 * L3: 源数据（数据库/接口）- 最慢，缓存未命中时使用
 */
class CacheManager {
  constructor() {
    // L1: 内存缓存（LRU）
    this.memoryCache = new LRU({
      max: 1000,              // 最多缓存 1000 个页面
      maxSize: 50 * 1024 * 1024,  // 最大 50MB
      sizeCalculation: (value) => {
        return Buffer.byteLength(value, 'utf8');
      },
      ttl: 1000 * 60 * 5,     // 5 分钟过期
      updateAgeOnGet: true,   // 访问时更新过期时间
      updateAgeOnHas: false
    });

    // L2: Redis 缓存（可选，生产环境推荐）
    this.redis = null;
    if (process.env.REDIS_HOST) {
      try {
        this.redis = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD,
          db: 0,
          retryStrategy: (times) => {
            if (times > 3) return null; // 重试 3 次后放弃
            return Math.min(times * 200, 1000);
          }
        });

        this.redis.on('error', (err) => {
          console.error('Redis 连接错误:', err.message);
        });

        this.redis.on('connect', () => {
          console.log('✅ Redis 缓存已连接');
        });
      } catch (error) {
        console.warn('⚠️  Redis 初始化失败，仅使用内存缓存:', error.message);
        this.redis = null;
      }
    } else {
      console.log('ℹ️  未配置 Redis，仅使用内存缓存');
    }

    // 缓存统计
    this.stats = {
      l1Hits: 0,      // L1 命中次数
      l2Hits: 0,      // L2 命中次数
      misses: 0,      // 缓存未命中次数
      sets: 0         // 缓存写入次数
    };
  }

  /**
   * 生成缓存 key
   * @param {string} type - 缓存类型（ssr-html, item-data, precheck）
   * @param {string} id - 资源 ID
   */
  generateKey(type, id) {
    return `${type}:${id}`;
  }

  /**
   * 获取缓存（三级缓存策略）
   * @param {string} key - 缓存 key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    // L1: 内存缓存
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue) {
      this.stats.l1Hits++;
      return memoryValue;
    }

    // L2: Redis 缓存
    if (this.redis) {
      try {
        const redisValue = await this.redis.get(key);
        if (redisValue) {
          this.stats.l2Hits++;
          // 回填到 L1 缓存
          this.memoryCache.set(key, redisValue);
          return redisValue;
        }
      } catch (error) {
        console.error('Redis 读取失败:', error.message);
      }
    }

    // 缓存未命中
    this.stats.misses++;
    return null;
  }

  /**
   * 设置缓存（写入 L1 和 L2）
   * @param {string} key - 缓存 key
   * @param {string} value - 缓存值
   * @param {number} ttl - 过期时间（秒），默认 300 秒
   */
  async set(key, value, ttl = 300) {
    this.stats.sets++;

    // 写入 L1 缓存
    this.memoryCache.set(key, value, { ttl: ttl * 1000 });

    // 写入 L2 缓存
    if (this.redis) {
      try {
        await this.redis.setex(key, ttl, value);
      } catch (error) {
        console.error('Redis 写入失败:', error.message);
      }
    }
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存 key
   */
  async delete(key) {
    // 删除 L1 缓存
    this.memoryCache.delete(key);

    // 删除 L2 缓存
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        console.error('Redis 删除失败:', error.message);
      }
    }
  }

  /**
   * 批量删除缓存（支持通配符）
   * @param {string} pattern - 缓存 key 模式（如 "ssr-html:*"）
   */
  async deletePattern(pattern) {
    // 删除 L1 缓存（遍历所有 key）
    const keys = [...this.memoryCache.keys()];
    const regex = new RegExp(pattern.replace('*', '.*'));
    keys.forEach(key => {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    });

    // 删除 L2 缓存
    if (this.redis) {
      try {
        const redisKeys = await this.redis.keys(pattern);
        if (redisKeys.length > 0) {
          await this.redis.del(...redisKeys);
        }
      } catch (error) {
        console.error('Redis 批量删除失败:', error.message);
      }
    }
  }

  /**
   * 清空所有缓存
   */
  async clear() {
    this.memoryCache.clear();
    if (this.redis) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        console.error('Redis 清空失败:', error.message);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.misses;
    const hitRate = total > 0
      ? ((this.stats.l1Hits + this.stats.l2Hits) / total * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      total,
      hitRate: `${hitRate}%`,
      l1Size: this.memoryCache.size,
      l1Count: this.memoryCache.size
    };
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// 单例模式
const cacheManager = new CacheManager();

module.exports = cacheManager;
