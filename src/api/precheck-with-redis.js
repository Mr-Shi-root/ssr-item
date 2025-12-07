const axios = require('axios');
const { cacheHelper } = require('../utils/redis');

/**
 * 轻量级预检接口 - 判断商品是否为秒杀商品
 * 支持 Redis 缓存，TTL 60 秒
 * @param {string} itemId - 商品ID
 * @returns {Promise<{isSeckill: boolean, data: object}>}
 */
async function precheckItem(itemId) {
  const cacheKey = `precheck:${itemId}`;

  try {
    // 1. 先查 Redis 缓存
    const cached = await cacheHelper.get(cacheKey, 'precheck');
    if (cached) {
      return cached;
    }

    // 2. 缓存未命中，调用预检接口
    console.log(`⚠️ 预检缓存未命中: ${itemId}，调用接口`);

    // 实际项目中这里应该调用真实的预检接口
    // const response = await axios.get(`https://api.example.com/precheck/${itemId}`);
    // const result = {
    //   isSeckill: response.data.isSeckill,
    //   data: response.data
    // };

    // Mock 数据 - 开发时使用
    const mockResponse = await mockPrecheckAPI(itemId);
    const result = {
      isSeckill: mockResponse.isSeckill,
      data: mockResponse.data
    };

    // 3. 写入 Redis 缓存，TTL 60 秒
    await cacheHelper.set(cacheKey, result, 60);
    console.log(`📝 预检结果已缓存: ${itemId}`);

    return result;
  } catch (error) {
    console.error('预检接口调用失败:', error);
    // 降级策略：失败时默认走 SSR 渲染
    return {
      isSeckill: false,
      data: {}
    };
  }
}

/**
 * Mock 预检接口
 * 实际项目中删除此函数，使用真实接口
 */
function mockPrecheckAPI(itemId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 模拟：itemId 以 'SK' 开头的为秒杀商品
      const isSeckill = itemId.startsWith('SK');

      resolve({
        isSeckill,
        data: {
          itemId,
          type: isSeckill ? 'seckill' : 'normal',
          timestamp: Date.now()
        }
      });
    }, 50); // 模拟 50ms 的网络延迟
  });
}

module.exports = {
  precheckItem
};
