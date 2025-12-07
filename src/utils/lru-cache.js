const LRU = require('lru-cache');

/**
 * SSR 渲染结果的 LRU 缓存
 *
 * LRU (Least Recently Used) 最近最少使用算法
 * - 当缓存满时，自动淘汰最久未使用的数据
 * - 适合内存有限的场景
 */
class SSRCache {
  constructor(options = {}) {
    this.cache = new LRU({
      // 最多缓存 500 个页面
      max: options.max || 500,

      // 每个缓存项的最大存活时间（毫秒）
      ttl: options.ttl || 1000 * 60, // 默认 1 分钟

      // 计算缓存大小的函数（按 HTML 字符串长度）
      sizeCalculation: (value) => {
        return value.length;
      },

      // 最大缓存大小（字节）- 10MB
      maxSize: options.maxSize || 1024 * 1024 * 10,

      // 允许过期数据在被访问时返回（提升性能）
      allowStale: false,

      // 更新访问时间（LRU 的核心）
      updateAgeOnGet: true,

      // 更新访问时间（即使是 peek）
      updateAgeOnHas: false
    });

    // 统计信息
    this.stats = {
      hits: 0,      // 缓存命中次数
      misses: 0,    // 缓存未命中次数
      sets: 0,      // 写入缓存次数
      deletes: 0,   // 删除缓存次数
      evictions: 0  // 自动淘汰次数
    };

    // 监听淘汰事件
    this.cache.on('evict', () => {
      this.stats.evictions++;
    });
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键（通常是 itemId）
   * @returns {string|null} - HTML 字符串或 null
   */
  get(key) {
    const value = this.cache.get(key);

    if (value !== undefined) {
      this.stats.hits++;
      console.log(`✅ LRU 缓存命中: ${key} (命中率: ${this.getHitRate()}%)`);
      return value;
    }

    this.stats.misses++;
    console.log(`⚠️ LRU 缓存未命中: ${key} (命中率: ${this.getHitRate()}%)`);
    return null;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {string} value - HTML 字符串
   * @param {number} ttl - 可选的 TTL（毫秒）
   */
  set(key, value, ttl) {
    this.cache.set(key, value, { ttl });
    this.stats.sets++;

    const size = (value.length / 1024).toFixed(2);
    console.log(`📝 LRU 缓存已写入: ${key} (大小: ${size}KB, 总数: ${this.cache.size})`);
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除指定缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
      console.log(`🗑️ LRU 缓存已删除: ${key}`);
    }
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧹 LRU 缓存已清空: ${size} 项`);
  }

  /**
   * 获取缓存命中率
   * @returns {string} - 命中率百分比
   */
  getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return '0.00';
    return ((this.stats.hits / total) * 100).toFixed(2);
  }

  /**
   * 获取缓存统计信息
   * @returns {object}
   */
  getStats() {
    return {
      // 缓存统计
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${this.getHitRate()}%`,

      // 操作统计
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,

      // 缓存状态
      size: this.cache.size,
      maxSize: this.cache.max,

      // 内存使用
      calculatedSize: this.cache.calculatedSize,
      maxCalculatedSize: this.cache.maxSize
    };
  }

  /**
   * 获取所有缓存的键
   * @returns {Array<string>}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存项的剩余 TTL
   * @param {string} key - 缓存键
   * @returns {number} - 剩余毫秒数
   */
  getRemainingTTL(key) {
    return this.cache.getRemainingTTL(key);
  }

  /**
   * 预热缓存（批量加载热门商品）
   * @param {Array<{id: string, html: string}>} items
   */
  warmup(items) {
    console.log(`🔥 开始预热缓存: ${items.length} 项`);
    items.forEach(item => {
      this.set(item.id, item.html);
    });
    console.log(`✅ 缓存预热完成`);
  }

  /**
   * 导出缓存快照（用于持久化）
   * @returns {Array}
   */
  dump() {
    return this.cache.dump();
  }

  /**
   * 从快照恢复缓存
   * @param {Array} dump
   */
  load(dump) {
    this.cache.load(dump);
    console.log(`📥 缓存已恢复: ${this.cache.size} 项`);
  }
}

// 创建全局单例
const ssrCache = new SSRCache({
  max: 500,           // 最多缓存 500 个页面
  ttl: 1000 * 60,     // TTL 1 分钟
  maxSize: 1024 * 1024 * 10  // 最大 10MB
});

module.exports = {
  SSRCache,
  ssrCache
};
