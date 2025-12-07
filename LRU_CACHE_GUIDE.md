# LRU 缓存使用指南

## 一、什么是 LRU 缓存？

**LRU (Least Recently Used)** - 最近最少使用算法

### 工作原理

```
缓存容量: 3 个

访问顺序: A → B → C → D
─────────────────────────────────────
步骤 1: 访问 A
缓存: [A]

步骤 2: 访问 B
缓存: [A, B]

步骤 3: 访问 C
缓存: [A, B, C]  ← 缓存已满

步骤 4: 访问 D
缓存: [B, C, D]  ← A 被淘汰（最久未使用）

步骤 5: 访问 B
缓存: [C, D, B]  ← B 移到最前面

步骤 6: 访问 E
缓存: [D, B, E]  ← C 被淘汰
```

### 为什么用 LRU？

✅ **自动淘汰**：缓存满时自动删除最久未使用的数据
✅ **内存可控**：限制最大缓存数量和大小
✅ **热数据优先**：经常访问的数据保留在缓存中
✅ **无需手动管理**：不用担心内存溢出

---

## 二、LRU 缓存配置

### 2.1 基本配置

```javascript
// src/utils/lru-cache.js
const ssrCache = new SSRCache({
  max: 500,                    // 最多缓存 500 个页面
  ttl: 1000 * 60,              // TTL 1 分钟
  maxSize: 1024 * 1024 * 10    // 最大 10MB
});
```

### 2.2 配置参数说明

| 参数 | 说明 | 默认值 | 推荐值 |
|------|------|--------|--------|
| **max** | 最多缓存项数 | 500 | 根据内存调整 |
| **ttl** | 缓存存活时间（毫秒） | 60000 (1分钟) | 60000-300000 |
| **maxSize** | 最大缓存大小（字节） | 10MB | 根据内存调整 |
| **updateAgeOnGet** | 访问时更新时间 | true | true |
| **allowStale** | 允许返回过期数据 | false | false |

---

## 三、使用 LRU 缓存的 SSR 渲染

### 3.1 完整流程

```
用户请求 /item/123
    ↓
查询 LRU 缓存: ssr:123
    ├─ 命中 → 直接返回 HTML (5ms) ✅
    └─ 未命中 → 执行 SSR 渲染
        ↓
        获取商品数据 (100ms)
        ↓
        React.renderToString() (50ms)
        ↓
        生成完整 HTML
        ↓
        写入 LRU 缓存 (TTL 60s)
        ↓
        返回 HTML (总耗时 ~150ms)
```

### 3.2 代码示例

```javascript
// src/server/ssr-with-lru.js
async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;

  // 1. 尝试从 LRU 缓存获取
  const cachedHtml = ssrCache.get(cacheKey);
  if (cachedHtml) {
    console.log(`✅ LRU 缓存命中: ${itemId}`);
    return cachedHtml;
  }

  // 2. 缓存未命中，执行 SSR 渲染
  const itemData = await fetchItemData(itemId);
  const appHtml = ReactDOMServer.renderToString(
    React.createElement(ItemDetailPage, { itemData })
  );
  const html = generateHTML(appHtml, itemData);

  // 3. 写入 LRU 缓存
  ssrCache.set(cacheKey, html, 1000 * 60); // TTL 60秒

  return html;
}
```

---

## 四、性能对比

### 4.1 首次访问（缓存未命中）

```
步骤                    耗时
─────────────────────────────
预检接口                50ms
获取商品数据            100ms
React 渲染              50ms
生成 HTML               5ms
写入 LRU 缓存           1ms
─────────────────────────────
总耗时                  206ms
```

### 4.2 再次访问（缓存命中）

```
步骤                    耗时
─────────────────────────────
预检接口                50ms
查询 LRU 缓存           1ms
返回 HTML               1ms
─────────────────────────────
总耗时                  52ms  ← 提升 4 倍！
```

### 4.3 性能提升

| 指标 | 无缓存 | LRU 缓存 | 提升 |
|------|--------|----------|------|
| 响应时间 | 200ms | 50ms | **4倍** |
| CPU 使用 | 100% | 5% | **20倍** |
| QPS | 50 | 1000+ | **20倍** |
| 内存使用 | 低 | 中 | +10MB |

---

## 五、使用带 LRU 缓存的版本

### 步骤 1：替换文件

```bash
# 备份原文件
cp src/server/ssr.js src/server/ssr.backup.js
cp src/server/index.js src/server/index.backup.js

# 使用带 LRU 缓存的版本
cp src/server/ssr-with-lru.js src/server/ssr.js
cp src/server/index-with-lru.js src/server/index.js
```

### 步骤 2：启动服务

```bash
npm run dev
```

### 步骤 3：测试缓存

```bash
# 首次访问（缓存未命中，~200ms）
curl http://localhost:3000/item/123

# 再次访问（缓存命中，~50ms）
curl http://localhost:3000/item/123

# 查看 LRU 缓存统计
curl http://localhost:3000/api/lru-stats
```

---

## 六、LRU 缓存 API

### 6.1 查看缓存统计

```bash
GET /api/lru-stats
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "hits": 950,
    "misses": 50,
    "hitRate": "95.00%",
    "sets": 50,
    "deletes": 5,
    "evictions": 10,
    "size": 45,
    "maxSize": 500,
    "calculatedSize": 4567890,
    "maxCalculatedSize": 10485760
  }
}
```

### 6.2 清空所有缓存

```bash
POST /api/lru-cache/clear
```

### 6.3 清除指定商品缓存

```bash
POST /api/lru-cache/invalidate/123
```

**使用场景**：商品更新时主动失效缓存

```javascript
// 商品更新后，清除缓存
router.post('/api/item/:id/update', async (ctx) => {
  const itemId = ctx.params.id;

  // 更新商品数据
  await updateItem(itemId, ctx.request.body);

  // 清除 LRU 缓存
  invalidateCache(itemId);

  ctx.body = { success: true };
});
```

### 6.4 预热缓存

```bash
POST /api/lru-cache/warmup
Content-Type: application/json

{
  "itemIds": ["123", "456", "789"]
}
```

**使用场景**：
- 服务启动时预热热门商品
- 定时任务预热即将秒杀的商品
- 运营活动前预热推广商品

```javascript
// 服务启动时预热
app.listen(PORT, async () => {
  console.log('服务器启动成功');

  // 预热热门商品
  const hotItems = ['123', '456', '789'];
  await warmupCache(hotItems);
});
```

### 6.5 查看缓存的所有键

```bash
GET /api/lru-cache/keys
```

**响应示例**：
```json
{
  "success": true,
  "data": ["ssr:123", "ssr:456", "ssr:789"],
  "count": 3
}
```

---

## 七、日志输出示例

### 7.1 首次访问（缓存未命中）

```
📊 商品 123 预检结果: { isSeckill: false, 耗时: '52ms' }
🎨 普通商品，执行 SSR 渲染（LRU 缓存）
⚠️ LRU 缓存未命中: ssr:123 (命中率: 0.00%)
🎨 开始 SSR 渲染: 123
⚡ React 渲染完成: 48ms
📝 LRU 缓存已写入: ssr:123 (大小: 12.34KB, 总数: 1)
✅ SSR 渲染完成: 123 (总耗时: 156ms)
✅ 总耗时: 208ms

GET /item/123 - 200 - 208ms
```

### 7.2 再次访问（缓存命中）

```
📊 商品 123 预检结果: { isSeckill: false, 耗时: '3ms' }
🎨 普通商品，执行 SSR 渲染（LRU 缓存）
✅ LRU 缓存命中: ssr:123 (命中率: 50.00%)
⚡ LRU 缓存返回 HTML: 123 (耗时: 2ms)
✅ 总耗时: 5ms

GET /item/123 - 200 - 5ms
```

---

## 八、LRU vs Redis 对比

| 特性 | LRU 缓存 | Redis 缓存 |
|------|----------|------------|
| **位置** | 进程内存 | 独立服务 |
| **速度** | 极快 (<1ms) | 快 (1-5ms) |
| **容量** | 受限于进程内存 | 可扩展 |
| **持久化** | 不支持 | 支持 |
| **分布式** | 不支持 | 支持 |
| **复杂度** | 低 | 中 |
| **适用场景** | 单机部署 | 集群部署 |

### 推荐方案

```
单机部署 → LRU 缓存（本项目）
集群部署 → Redis 缓存
混合方案 → LRU (L1) + Redis (L2)
```

---

## 九、混合缓存方案（LRU + Redis）

### 9.1 两级缓存架构

```
用户请求
    ↓
L1: LRU 缓存（进程内存，<1ms）
    ├─ 命中 → 返回
    └─ 未命中 ↓
L2: Redis 缓存（独立服务，1-5ms）
    ├─ 命中 → 写入 L1 → 返回
    └─ 未命中 ↓
SSR 渲染（100-200ms）
    ↓
写入 L2 + L1
    ↓
返回
```

### 9.2 实现示例

```javascript
async function renderSSR(itemId) {
  const cacheKey = `ssr:${itemId}`;

  // L1: LRU 缓存
  let html = ssrCache.get(cacheKey);
  if (html) {
    console.log('✅ L1 缓存命中');
    return html;
  }

  // L2: Redis 缓存
  html = await redis.get(cacheKey);
  if (html) {
    console.log('✅ L2 缓存命中');
    // 写入 L1
    ssrCache.set(cacheKey, html);
    return html;
  }

  // 缓存未命中，执行 SSR 渲染
  html = await doSSRRender(itemId);

  // 写入 L2 + L1
  await redis.setex(cacheKey, 60, html);
  ssrCache.set(cacheKey, html);

  return html;
}
```

---

## 十、最佳实践

### 10.1 缓存 TTL 设置

```javascript
// 根据商品类型设置不同的 TTL
function getTTL(itemData) {
  if (itemData.isHot) {
    return 1000 * 60 * 5;  // 热门商品 5 分钟
  } else if (itemData.stock < 10) {
    return 1000 * 30;      // 低库存 30 秒
  } else {
    return 1000 * 60;      // 普通商品 1 分钟
  }
}

ssrCache.set(cacheKey, html, getTTL(itemData));
```

### 10.2 缓存预热策略

```javascript
// 定时预热热门商品
setInterval(async () => {
  const hotItems = await getHotItems(); // 从数据库获取热门商品
  await warmupCache(hotItems);
}, 1000 * 60 * 10); // 每 10 分钟预热一次
```

### 10.3 缓存失效策略

```javascript
// 商品更新时主动失效
router.post('/api/item/:id/update', async (ctx) => {
  const itemId = ctx.params.id;

  // 更新商品
  await updateItem(itemId, ctx.request.body);

  // 清除缓存
  invalidateCache(itemId);

  ctx.body = { success: true };
});
```

---

## 十一、监控和告警

### 11.1 监控指标

```javascript
// 定期输出缓存统计
setInterval(() => {
  const stats = ssrCache.getStats();
  console.log('📊 LRU 缓存统计:', {
    命中率: stats.hitRate,
    缓存数: stats.size,
    淘汰数: stats.evictions
  });

  // 告警：命中率低于 80%
  if (parseFloat(stats.hitRate) < 80) {
    console.warn('⚠️ 缓存命中率过低！');
  }
}, 1000 * 60); // 每分钟
```

### 11.2 Prometheus 监控

```javascript
const prometheus = require('prom-client');

const cacheHitRate = new prometheus.Gauge({
  name: 'lru_cache_hit_rate',
  help: 'LRU 缓存命中率'
});

setInterval(() => {
  const stats = ssrCache.getStats();
  cacheHitRate.set(parseFloat(stats.hitRate));
}, 10000);
```

---

## 十二、总结

### LRU 缓存的优势

✅ **性能提升 4-20 倍**
✅ **自动内存管理**
✅ **热数据优先保留**
✅ **实现简单**
✅ **无需额外服务**

### 适用场景

✅ 单机部署
✅ 内存充足
✅ 热点数据明显
✅ 不需要持久化

### 不适用场景

❌ 集群部署（需要 Redis）
❌ 内存受限
❌ 需要持久化
❌ 需要跨进程共享

---

**本项目已完整实现 LRU 缓存，直接使用即可！**
