# LRU 缓存核心概念详解

## 一、LRU 是什么？

### 1.1 基本概念

**LRU = Least Recently Used（最近最少使用）**

```javascript
// 是的，LRU 类似于 Map，但更智能
Map: key → value
LRU: key → value + 访问时间 + TTL + 自动淘汰
```

### 1.2 与 Map 的区别

| 特性 | Map | LRU |
|------|-----|-----|
| 存储数据 | ✅ | ✅ |
| 容量限制 | ❌ 无限制 | ✅ 有限制 |
| 自动淘汰 | ❌ 不会 | ✅ 自动淘汰旧数据 |
| TTL 过期 | ❌ 不支持 | ✅ 自动过期 |
| 访问顺序 | ❌ 不记录 | ✅ 记录并排序 |

---

## 二、TTL（Time To Live）详解

### 2.1 TTL 是什么？

**TTL = 缓存项的存活时间**

```javascript
const cache = new LRU({
  ttl: 1000 * 60  // TTL = 60 秒
});

cache.set('key1', 'value1');

// 时间线：
// 0s   → 写入缓存
// 30s  → 还在缓存中 ✅
// 60s  → TTL 到期
// 61s  → 自动删除 ❌
```

### 2.2 TTL 到期后会怎样？

**答案：自动删除（惰性删除）**

```javascript
const cache = new LRU({ ttl: 1000 * 60 }); // 60 秒

// 0 秒：写入缓存
cache.set('item:123', '<html>...</html>');

// 30 秒：访问缓存
cache.get('item:123');  // ✅ 返回 HTML

// 70 秒：TTL 已过期
cache.get('item:123');  // ❌ 返回 undefined（自动删除）
```

### 2.3 删除时机（惰性删除）

**LRU 不会主动定时扫描删除，而是在访问时检查**

```javascript
// 时间线示例
0s   → set('key1', 'value1', ttl: 60s)
      缓存: { key1: value1 }

30s  → get('key1')
      检查 TTL: 还剩 30s ✅
      返回: value1

70s  → get('key1')
      检查 TTL: 已过期 ❌
      自动删除 key1
      返回: undefined

// 如果 70s 时没有访问 key1，它会一直留在内存中
// 直到下次访问或缓存满时才会被删除
```

### 2.4 实际代码示例

```javascript
const { ssrCache } = require('./utils/lru-cache');

// 写入缓存，TTL 60 秒
ssrCache.set('ssr:123', '<html>...</html>', 1000 * 60);

// 30 秒后访问
setTimeout(() => {
  const html = ssrCache.get('ssr:123');
  console.log(html);  // ✅ 返回 HTML
}, 30000);

// 70 秒后访问
setTimeout(() => {
  const html = ssrCache.get('ssr:123');
  console.log(html);  // ❌ 返回 null（TTL 已过期）
}, 70000);
```

---

## 三、更新访问时间的作用

### 3.1 LRU 算法的核心

**LRU = 淘汰最久未使用的数据**

```javascript
// 缓存容量：3 个

// 步骤 1：访问 A
缓存: [A]
最近使用: A

// 步骤 2：访问 B
缓存: [A, B]
最近使用: B → A

// 步骤 3：访问 C
缓存: [A, B, C]
最近使用: C → B → A

// 步骤 4：访问 D（缓存已满）
缓存: [B, C, D]  ← A 被淘汰（最久未使用）
最近使用: D → C → B

// 步骤 5：访问 B（已存在）
缓存: [C, D, B]  ← B 移到最前面
最近使用: B → D → C
```

### 3.2 为什么要更新访问时间？

**目的：让热门数据保留在缓存中**

```javascript
// 场景：商品详情页缓存

// 商品 123 是热门商品，每秒被访问 100 次
// 商品 456 是冷门商品，1 小时才被访问 1 次

缓存容量：500 个

// 没有更新访问时间（错误）：
访问 123 → 不更新时间
访问 456 → 不更新时间
缓存满时 → 可能淘汰 123（热门商品）❌

// 有更新访问时间（正确）：
访问 123 → 更新时间（移到最前面）
访问 456 → 更新时间（移到最前面）
缓存满时 → 淘汰最久未访问的商品 ✅
         → 123 经常被访问，不会被淘汰 ✅
```

### 3.3 实际效果

```javascript
const cache = new LRU({ max: 3 });

// 初始状态
cache.set('A', 'valueA');
cache.set('B', 'valueB');
cache.set('C', 'valueC');
// 缓存: [C, B, A]  ← C 最新，A 最旧

// 访问 A（更新访问时间）
cache.get('A');
// 缓存: [A, C, B]  ← A 移到最前面

// 添加 D（缓存满，淘汰最旧的 B）
cache.set('D', 'valueD');
// 缓存: [D, A, C]  ← B 被淘汰

// 如果没有更新访问时间：
// 缓存: [D, C, B]  ← A 被淘汰（错误！A 刚被访问过）
```

### 3.4 配置选项

```javascript
const cache = new LRU({
  max: 500,
  ttl: 1000 * 60,

  // 是否在 get 时更新访问时间
  updateAgeOnGet: true,  // ← 默认 true（推荐）

  // 是否在 has 时更新访问时间
  updateAgeOnHas: false  // ← 默认 false
});

// updateAgeOnGet: true
cache.get('key1');  // 更新访问时间 ✅

// updateAgeOnGet: false
cache.get('key1');  // 不更新访问时间 ❌
```

---

## 四、最大缓存大小

### 4.1 两种限制方式

```javascript
const cache = new LRU({
  // 方式 1：限制缓存项数量
  max: 500,  // 最多 500 个缓存项

  // 方式 2：限制总大小（字节）
  maxSize: 1024 * 1024 * 10,  // 最大 10MB

  // 计算每个缓存项的大小
  sizeCalculation: (value) => {
    return value.length;  // HTML 字符串的长度
  }
});
```

### 4.2 达到最大值后会怎样？

**答案：自动淘汰最久未使用的数据，然后写入新数据**

```javascript
const cache = new LRU({ max: 3 });

// 步骤 1：写入 3 个缓存项（缓存满）
cache.set('A', 'valueA');
cache.set('B', 'valueB');
cache.set('C', 'valueC');
// 缓存: [C, B, A]  ← 已满

// 步骤 2：写入第 4 个缓存项
cache.set('D', 'valueD');
// 自动淘汰 A（最久未使用）
// 缓存: [D, C, B]  ← 仍然是 3 个

// 步骤 3：访问 B（更新访问时间）
cache.get('B');
// 缓存: [B, D, C]  ← B 移到最前面

// 步骤 4：写入第 5 个缓存项
cache.set('E', 'valueE');
// 自动淘汰 C（最久未使用）
// 缓存: [E, B, D]  ← 仍然是 3 个
```

### 4.3 不是"不缓存"，而是"淘汰旧数据"

```javascript
// ❌ 错误理解：缓存满了就不缓存新数据
cache.set('new', 'value');  // 被拒绝？NO！

// ✅ 正确理解：缓存满了就淘汰旧数据，然后缓存新数据
cache.set('new', 'value');
// 1. 找到最久未使用的数据
// 2. 删除它
// 3. 写入新数据
```

### 4.4 实际场景

```javascript
// 商品详情页缓存
const ssrCache = new LRU({
  max: 500,                    // 最多 500 个商品
  maxSize: 1024 * 1024 * 10   // 最大 10MB
});

// 缓存 500 个商品后
ssrCache.set('ssr:501', '<html>...</html>');
// 自动淘汰最久未访问的商品（比如 ssr:1）
// 然后缓存 ssr:501

// 热门商品（经常被访问）不会被淘汰
// 冷门商品（很久没访问）会被淘汰
```

---

## 五、完整工作流程

### 5.1 写入缓存

```javascript
cache.set('key1', 'value1', ttl: 60000);

// 内部流程：
1. 检查缓存是否已满
   ├─ 未满 → 直接写入
   └─ 已满 → 淘汰最久未使用的项 → 写入

2. 记录写入时间（用于 TTL）

3. 更新访问顺序（key1 移到最前面）

4. 触发 'set' 事件
```

### 5.2 读取缓存

```javascript
cache.get('key1');

// 内部流程：
1. 查找 key1

2. 检查 TTL 是否过期
   ├─ 未过期 → 继续
   └─ 已过期 → 删除 → 返回 undefined

3. 更新访问时间（key1 移到最前面）

4. 返回 value
```

### 5.3 自动淘汰

```javascript
// 场景：缓存已满，写入新数据
cache.set('newKey', 'newValue');

// 内部流程：
1. 检查缓存是否已满
   → 已满

2. 找到最久未使用的项
   → 遍历所有项，找到访问时间最早的

3. 删除该项
   → 触发 'evict' 事件

4. 写入新数据
```

---

## 六、实际代码示例

### 6.1 完整示例

```javascript
const LRU = require('lru-cache');

// 创建缓存
const cache = new LRU({
  max: 3,              // 最多 3 个缓存项
  ttl: 1000 * 10,      // TTL 10 秒
  updateAgeOnGet: true // 访问时更新时间
});

// ===== 步骤 1: 写入 3 个缓存项 =====
cache.set('A', 'valueA');
cache.set('B', 'valueB');
cache.set('C', 'valueC');
console.log('缓存:', Array.from(cache.keys()));
// 输出: ['C', 'B', 'A']  ← C 最新，A 最旧

// ===== 步骤 2: 访问 A（更新访问时间）=====
cache.get('A');
console.log('缓存:', Array.from(cache.keys()));
// 输出: ['A', 'C', 'B']  ← A 移到最前面

// ===== 步骤 3: 写入 D（缓存满，淘汰 B）=====
cache.set('D', 'valueD');
console.log('缓存:', Array.from(cache.keys()));
// 输出: ['D', 'A', 'C']  ← B 被淘汰

// ===== 步骤 4: 等待 11 秒（TTL 过期）=====
setTimeout(() => {
  console.log('A 是否存在:', cache.has('A'));
  // 输出: false  ← TTL 过期，自动删除

  const value = cache.get('A');
  console.log('A 的值:', value);
  // 输出: undefined
}, 11000);
```

### 6.2 监听淘汰事件

```javascript
const cache = new LRU({ max: 3 });

// 监听淘汰事件
cache.on('evict', (key, value) => {
  console.log(`淘汰: ${key} = ${value}`);
});

cache.set('A', 'valueA');
cache.set('B', 'valueB');
cache.set('C', 'valueC');

// 缓存满，写入 D 会淘汰 A
cache.set('D', 'valueD');
// 输出: 淘汰: A = valueA
```

---

## 七、常见问题

### Q1: TTL 过期后，数据还在内存中吗？

**A**: 是的，但下次访问时会被删除（惰性删除）

```javascript
cache.set('key1', 'value1', ttl: 1000);

// 2 秒后（TTL 已过期）
setTimeout(() => {
  // 数据还在内存中，但已标记为过期
  console.log(cache.size);  // 1

  // 访问时检查 TTL，发现过期，自动删除
  cache.get('key1');  // undefined

  // 现在数据被删除了
  console.log(cache.size);  // 0
}, 2000);
```

### Q2: 如果不访问过期数据，会一直占用内存吗？

**A**: 是的，但可以配置定期清理

```javascript
const cache = new LRU({
  max: 500,
  ttl: 1000 * 60,

  // 定期清理过期数据（可选）
  ttlAutopurge: true,  // 自动清理
  ttlResolution: 1000  // 每秒检查一次
});
```

### Q3: 缓存满了，新数据会被拒绝吗？

**A**: 不会，会自动淘汰旧数据

```javascript
const cache = new LRU({ max: 3 });

cache.set('A', 'valueA');
cache.set('B', 'valueB');
cache.set('C', 'valueC');
// 缓存满了

cache.set('D', 'valueD');  // ✅ 不会被拒绝
// 自动淘汰 A，然后写入 D
```

### Q4: 如何查看剩余 TTL？

```javascript
const cache = new LRU({ ttl: 1000 * 60 });

cache.set('key1', 'value1');

// 30 秒后
setTimeout(() => {
  const remainingTTL = cache.getRemainingTTL('key1');
  console.log(`剩余 TTL: ${remainingTTL}ms`);
  // 输出: 剩余 TTL: 30000ms
}, 30000);
```

---

## 八、总结

### 核心概念

| 概念 | 说明 | 行为 |
|------|------|------|
| **TTL** | 缓存存活时间 | 到期后自动删除（惰性） |
| **更新访问时间** | 记录最近使用 | 让热门数据保留 |
| **最大缓存** | 容量限制 | 满了自动淘汰旧数据 |
| **LRU 算法** | 淘汰策略 | 淘汰最久未使用的数据 |

### 关键点

✅ **TTL 到期** → 自动删除（下次访问时）
✅ **更新访问时间** → 热门数据不被淘汰
✅ **缓存满** → 淘汰旧数据，写入新数据
✅ **LRU 算法** → 保留热门数据，淘汰冷门数据

### 实际效果

```javascript
// 商品详情页缓存
const ssrCache = new LRU({
  max: 500,           // 最多 500 个商品
  ttl: 1000 * 60,     // 60 秒过期
  maxSize: 10 * 1024 * 1024  // 最大 10MB
});

// 热门商品（经常访问）
ssrCache.get('ssr:123');  // 每秒访问 100 次
// → 访问时间不断更新
// → 不会被淘汰 ✅

// 冷门商品（很少访问）
ssrCache.get('ssr:999');  // 1 小时才访问 1 次
// → 访问时间很旧
// → 缓存满时被淘汰 ✅

// 过期商品（TTL 到期）
ssrCache.get('ssr:456');  // 60 秒后访问
// → TTL 已过期
// → 自动删除 ✅
```

---

**LRU 缓存 = 智能的 Map，自动管理内存，保留热门数据！**
