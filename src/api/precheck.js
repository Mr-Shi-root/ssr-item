const axios = require('axios');

/**
 * 轻量级预检接口 - 判断商品是否为秒杀商品
 * @param {string} itemId - 商品ID
 * @returns {Promise<{isSeckill: boolean, data: object}>}
 */
async function precheckItem(itemId) {
  try {
    // 实际项目中这里应该调用真实的预检接口
    // const response = await axios.get(`/api/precheck/${itemId}`);

    // Mock 数据 - 开发时使用
    const mockResponse = await mockPrecheckAPI(itemId);

    return {
      isSeckill: mockResponse.isSeckill,
      data: mockResponse.data
    };
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
