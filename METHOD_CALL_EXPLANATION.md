# LRU 缓存方法调用关系详解

## 一、核心问题

在 `src/utils/lru-cache.js` 第 58 行：

```javascript
get(key) {
  const value = this.cache.get(key);  // ← 这里的 get 是谁的？
  // ...
}
```

**答案**：`this.cache.get(key)` 调用的是 **LRU 库的 get 方法**，不是 SSRCache 类的 get 方法。

---

## 二、详细分析

### 2.1 类结构

```javascript
const LRU = require('lru-cache');

class SSRCache {
  constructor() {
    // this.cache 是 LRU 库的实例
    this.cache = new LRU({
      max: 500,
      ttl: 1000 * 60
    });
  }

  // SSRCache 类的 get 方法（外层封装）
  get(key) {
    // 调用 LRU 库实例的 get 方法（底层实现）
    const value = this.cache.get(key);

    // 添加统计逻辑
    if (value !== undefined) {
      this.stats.hits++;
      return value;
    }

    this.stats.misses++;
    return null;
  }
}
```

### 2.2 调用链路

```
外部调用
    ↓
ssrCache.get('ssr:123')  ← SSRCache 类的 get 方法
    ↓
this.cache.get('ssr:123')  ← LRU 库的 get 方法
    ↓
返回缓存的值或 undefined
```

---

## 三、完整示例

### 3.1 代码结构

```javascript
// ===== LRU 库（第三方库）=====
class LRU {
  constructor(options) {
    this.data = new Map();
    this.max = options.max;
  }

  // LRU 库的 get 方法
  get(key) {
    if (this.data.has(key)) {
      // 更新访问时间（LRU 算法核心）
      const value = this.data.get(key);
      this.data.delete(key);
      this.data.set(key, value);
      return value;
    }
    return undefined;
  }

  // LRU 库的 set 方法
  set(key, value) {
    if (this.data.size >= this.max) {
      // 删除最久未使用的项
      const firstKey = this.data.keys().next().value;
      this.data.delete(firstKey);
    }
    this.data.set(key, value);
  }
}

// ===== SSRCache 类（我们的封装）=====
class SSRCache {
  constructor() {
    // this.cache 是 LRU 库的实例
    this.cache = new LRU({ max: 500 });

    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  // SSRCache 类的 get 方法（封装层）
  get(key) {
    // 调用 LRU 库实例的 get 方法
    const value = this.cache.get(key);  // ← 这里！

    // 添加统计功能
    if (value !== undefined) {
      this.stats.hits++;
      console.log('缓存命中');
      return value;
    }

    this.stats.misses++;
    console.log('缓存未命中');
    return null;
  }

  // SSRCache 类的 set 方法（封装层）
  set(key, value) {
    // 调用 LRU 库实例的 set 方法
    this.cache.set(key, value);  // ← 同理

    // 添加统计功能
    this.stats.sets++;
    console.log('已写入缓存');
  }
}
```

### 3.2 使用示例

```javascript
// 创建 SSRCache 实例
const ssrCache = new SSRCache();

// 外部调用
ssrCache.set('key1', 'value1');
// ↓ 调用 SSRCache.set()
//   ↓ 内部调用 this.cache.set()
//     ↓ 实际调用 LRU.set()

const value = ssrCache.get('key1');
// ↓ 调用 SSRCache.get()
//   ↓ 内部调用 this.cache.get()
//     ↓ 实际调用 LRU.get()
//       ↓ 返回 'value1'
```

---

## 四、为什么要这样设计？

### 4.1 设计模式：装饰器模式（Decorator Pattern）

```javascript
// LRU 库提供基础功能
LRU.get(key)  → 返回值或 undefined

// SSRCache 在 LRU 基础上添加功能
SSRCache.get(key) →
  1. 调用 LRU.get(key)
  2. 统计命中率
  3. 打印日志
  4. 返回值或 null
```

### 4.2 好处

✅ **职责分离**：
- LRU 库：负责缓存算法（淘汰策略、容量管理）
- SSRCache：负责业务逻辑（统计、日志、错误处理）

✅ **易于扩展**：
```javascript
// 可以轻松添加新功能
get(key) {
  const value = this.cache.get(key);

  // 添加监控
  this.monitor.record('cache_get', key);

  // 添加告警
  if (this.getHitRate() < 80) {
    this.alert('缓存命中率过低');
  }

  return value;
}
```

✅ **统一接口**：
```javascript
// 外部只需要知道 SSRCache 的接口
ssrCache.get(key);
ssrCache.set(key, value);
ssrCache.getStats();

// 不需要关心底层是 LRU 还是其他实现
```

---

## 五、对比：如果不封装

### 5.1 直接使用 LRU 库

```javascript
// ❌ 不好的做法
const LRU = require('lru-cache');
const cache = new LRU({ max: 500 });

// 每次使用都要手动统计
function getFromCache(key) {
  const value = cache.get(key);

  if (value !== undefined) {
    stats.hits++;  // 手动统计
    console.log('命中');  // 手动打印
    return value;
  }

  stats.misses++;  // 手动统计
  console.log('未命中');  // 手动打印
  return null;
}

// 代码重复，容易出错
```

### 5.2 使用封装后的 SSRCache

```javascript
// ✅ 好的做法
const { ssrCache } = require('./utils/lru-cache');

// 简单调用，自动统计
const value = ssrCache.get(key);

// 所有功能都封装好了
```

---

## 六、实际调用流程

### 6.1 完整的调用链

```javascript
// 1. 外部调用
const html = ssrCache.get('ssr:123');

// 2. 进入 SSRCache.get() 方法
get(key) {
  // 3. 调用 LRU 实例的 get 方法
  const value = this.cache.get(key);
  //              ↑
  //              这是 LRU 库的 get 方法

  // 4. LRU 库内部执行
  // - 查找 Map 中的数据
  // - 更新访问时间（LRU 算法）
  // - 返回值或 undefined

  // 5. SSRCache 处理返回值
  if (value !== undefined) {
    this.stats.hits++;  // 统计命中
    return value;
  }

  this.stats.misses++;  // 统计未命中
  return null;
}
```

### 6.2 方法对应关系

| 调用 | 实际执行的方法 | 说明 |
|------|---------------|------|
| `ssrCache.get(key)` | `SSRCache.get()` | 外层封装 |
| `this.cache.get(key)` | `LRU.get()` | 底层实现 |
| `ssrCache.set(key, value)` | `SSRCache.set()` | 外层封装 |
| `this.cache.set(key, value)` | `LRU.set()` | 底层实现 |
| `ssrCache.delete(key)` | `SSRCache.delete()` | 外层封装 |
| `this.cache.delete(key)` | `LRU.delete()` | 底层实现 |

---

## 七、类比理解

### 7.1 生活中的例子

```
你（外部调用者）
    ↓
前台接待员（SSRCache）
    ↓
仓库管理员（LRU 库）
```

**场景**：你去图书馆借书

1. **你**：我要借《JavaScript 高级程序设计》
2. **前台接待员（SSRCache）**：
   - 记录你的借阅请求
   - 调用仓库管理员查询
   - 统计借阅次数
   - 打印借阅记录
3. **仓库管理员（LRU）**：
   - 在仓库中查找书籍
   - 更新书籍位置（最近使用的放前面）
   - 返回书籍或"没找到"
4. **前台接待员**：
   - 收到仓库管理员的反馈
   - 告诉你结果
   - 更新统计数据

### 7.2 代码对应

```javascript
// 你
const book = library.borrowBook('JavaScript 高级程序设计');

// 前台接待员（SSRCache）
borrowBook(bookName) {
  console.log('记录借阅请求');

  // 调用仓库管理员
  const book = this.warehouse.findBook(bookName);

  if (book) {
    this.stats.borrowed++;
    console.log('借阅成功');
    return book;
  }

  this.stats.notFound++;
  console.log('书籍不在');
  return null;
}

// 仓库管理员（LRU）
findBook(bookName) {
  // 在仓库中查找
  // 更新书籍位置
  // 返回书籍
}
```

---

## 八、总结

### 关键点

1. **`this.cache`** 是 LRU 库的实例
2. **`this.cache.get(key)`** 调用的是 **LRU 库的 get 方法**
3. **`SSRCache.get(key)`** 是对 LRU 的封装，添加了统计和日志功能

### 调用关系

```
外部调用: ssrCache.get('key')
    ↓
SSRCache 类: get(key) { ... }
    ↓
LRU 实例: this.cache.get(key)
    ↓
LRU 库: get(key) { ... }
    ↓
返回: value 或 undefined
```

### 设计优势

✅ **封装**：隐藏 LRU 库的实现细节
✅ **扩展**：可以添加统计、日志、监控等功能
✅ **维护**：如果要换其他缓存库，只需修改 SSRCache 类
✅ **统一**：提供一致的接口给外部使用

---

**简单记忆**：
- `this.cache.get()` = LRU 库的方法（底层）
- `ssrCache.get()` = SSRCache 类的方法（封装）
- SSRCache 是对 LRU 的增强版，添加了统计和日志功能
