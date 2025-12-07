/**
 * 商品更新消息发布示例
 *
 * 这个文件展示了商品管理服务如何发布商品更新消息
 * 商品管理服务和 SSR 服务可以在不同的项目、不同的服务器上
 * 只需要共享同一个 Redis 实例即可
 */

const Redis = require('ioredis');

// 创建 Redis 发布客户端
const publisher = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || ''
});

/**
 * 发布商品更新消息
 * @param {string} itemId - 商品ID
 */
async function publishItemUpdate(itemId) {
  try {
    const message = JSON.stringify({ itemId });
    await publisher.publish('item:updated', message);
    console.log(`✅ 已发布商品更新消息: ${itemId}`);
  } catch (error) {
    console.error('❌ 发布消息失败:', error);
  }
}

// ===== 使用示例 =====

// 示例 1: 在商品管理服务的更新接口中调用
async function updateItemHandler(itemId, updateData) {
  // 1. 更新数据库
  // await db.query('UPDATE items SET ... WHERE item_id = ?', [itemId]);
  console.log(`📝 更新商品数据: ${itemId}`);

  // 2. 发布消息通知所有 SSR 服务
  await publishItemUpdate(itemId);

  return { success: true };
}

// 示例 2: 批量更新商品
async function batchUpdateItems(itemIds) {
  for (const itemId of itemIds) {
    // 更新数据库
    // await db.query('UPDATE items SET ... WHERE item_id = ?', [itemId]);

    // 发布消息
    await publishItemUpdate(itemId);
  }

  console.log(`✅ 批量更新完成: ${itemIds.length} 个商品`);
}

// ===== 测试代码 =====
if (require.main === module) {
  console.log('🚀 开始测试消息发布...\n');

  // 模拟更新商品 123
  updateItemHandler('123', { price: 99.99 })
    .then(() => {
      console.log('\n✅ 测试完成');
      console.log('💡 提示: 如果 SSR 服务正在运行，它应该会收到这条消息并清除缓存');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ 测试失败:', err);
      process.exit(1);
    });
}

module.exports = {
  publishItemUpdate,
  updateItemHandler,
  batchUpdateItems
};
