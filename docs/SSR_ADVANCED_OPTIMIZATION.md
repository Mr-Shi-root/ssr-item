# SSR 高级优化技巧详解

## 🎯 问题 1：组件级缓存

### 什么是组件级缓存？

**场景**：一个商品列表页，包含 20 个商品卡片，每个卡片的渲染逻辑相同，只是数据不同。

```javascript
// 商品列表页
function ProductListPage({ products }) {
  return (
    <div>
      <Header />
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
      <Footer />
    </div>
  );
}

// 问题：每次渲染都要渲染 20 个 ProductCard，很耗时！
// 解决：缓存单个 ProductCard 的渲染结果
```

---

## 📊 组件级缓存的实现

### 方案 1：手动缓存组件 HTML

```javascript
const LRU = require('lru-cache');

// 创建组件级缓存
const componentCache = new LRU({
  max: 10000,      // 缓存 10000 个组件
  ttl: 300000      // 5 分钟过期
});

/**
 * 可缓存的商品卡片组件
 */
function CachedProductCard({ product }) {
  const cacheKey = `product-card:${product.id}:${product.updatedAt}`;

  // 1. 尝试从缓存读取
  let html = componentCache.get(cacheKey);

  if (html) {
    console.log(`组件缓存命中: ${product.id}`);
    // 返回缓存的 HTML（使用 dangerouslySetInnerHTML）
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // 2. 缓存未命中，渲染组件
  console.log(`组件缓存未命中: ${product.id}`);

  // 渲染单个组件为 HTML 字符串
  const component = <ProductCard product={product} />;
  html = ReactDOMServer.renderToStaticMarkup(component);

  // 3. 写入缓存
  componentCache.set(cacheKey, html);

  // 4. 返回组件
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// 使用
function ProductListPage({ products }) {
  return (
    <div>
      <Header />
      {products.map(product => (
        <CachedProductCard key={product.id} product={product} />
      ))}
      <Footer />
    </div>
  );
}
```

**工作原理**：

```
第一次渲染商品 A：
├─ 检查缓存：未命中
├─ 渲染 ProductCard：100ms
├─ 生成 HTML：<div class="card">...</div>
├─ 写入缓存
└─ 返回 HTML

第二次渲染商品 A（相同商品）：
├─ 检查缓存：命中！✅
├─ 读取缓存：0.1ms
└─ 返回 HTML

性能提升：100ms → 0.1ms（1000 倍）
```

### 方案 2：使用 React 的缓存 API（React 18+）

```javascript
import { cache } from 'react';

// 创建缓存函数
const getCachedProductCard = cache((product) => {
  console.log(`渲染商品卡片: ${product.id}`);
  return <ProductCard product={product} />;
});

// 使用
function ProductListPage({ products }) {
  return (
    <div>
      <Header />
      {products.map(product => (
        <React.Fragment key={product.id}>
          {getCachedProductCard(product)}
        </React.Fragment>
      ))}
      <Footer />
    </div>
  );
}
```

**注意**：React 18 的 `cache` API 只在单次请求内有效，不能跨请求缓存。

### 方案 3：使用第三方库（react-ssr-prepass）

```javascript
const ssrPrepass = require('react-ssr-prepass');
const { renderToString } = require('react-dom/server');

// 带缓存的渲染
async function renderWithComponentCache(element) {
  // 1. 预处理（收集需要缓存的组件）
  await ssrPrepass(element);

  // 2. 渲染为 HTML
  const html = renderToString(element);

  return html;
}
```

---

## 🔍 组件级缓存的完整示例

### 实际项目中的实现

```javascript
// ========== 1. 创建缓存工具 ==========
const LRU = require('lru-cache');

class ComponentCache {
  constructor() {
    this.cache = new LRU({
      max: 10000,
      ttl: 300000
    });
    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  /**
   * 缓存组件渲染结果
   */
  cacheComponent(cacheKey, renderFn) {
    // 检查缓存
    let html = this.cache.get(cacheKey);

    if (html) {
      this.stats.hits++;
      return html;
    }

    // 渲染组件
    this.stats.misses++;
    const component = renderFn();
    html = ReactDOMServer.renderToStaticMarkup(component);

    // 写入缓存
    this.cache.set(cacheKey, html);

    return html;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: `${hitRate}%`
    };
  }
}

const componentCache = new ComponentCache();

// ========== 2. 创建可缓存组件 ==========
function ProductCard({ product }) {
  return (
    <div className="product-card">
      <img src={product.image} alt={product.title} />
      <h3>{product.title}</h3>
      <p className="price">¥{product.price}</p>
      <button>加入购物车</button>
    </div>
  );
}

// 包装为可缓存组件
function CachedProductCard({ product }) {
  // 缓存 key：商品 ID + 更新时间
  const cacheKey = `product-card:${product.id}:${product.updatedAt}`;

  // 使用缓存
  const html = componentCache.cacheComponent(cacheKey, () => (
    <ProductCard product={product} />
  ));

  // 返回缓存的 HTML
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ========== 3. 在页面中使用 ==========
function ProductListPage({ products }) {
  return (
    <div className="product-list">
      <Header />
      <div className="products">
        {products.map(product => (
          <CachedProductCard key={product.id} product={product} />
        ))}
      </div>
      <Footer />
    </div>
  );
}

// ========== 4. 服务端渲染 ==========
app.get('/products', async (req, res) => {
  // 获取商品列表
  const products = await fetchProducts();

  // 渲染页面（会自动使用组件缓存）
  const html = ReactDOMServer.renderToString(
    <ProductListPage products={products} />
  );

  // 输出缓存统计
  console.log('组件缓存统计:', componentCache.getStats());

  res.send(html);
});
```

### 性能对比

```
场景：渲染 100 个商品卡片

不使用组件缓存：
├─ 渲染 100 个 ProductCard
├─ 每个耗时：10ms
└─ 总耗时：1000ms

使用组件缓存（第一次）：
├─ 渲染 100 个 ProductCard
├─ 每个耗时：10ms
├─ 写入缓存：100 * 0.1ms = 10ms
└─ 总耗时：1010ms

使用组件缓存（第二次，相同商品）：
├─ 读取缓存：100 * 0.1ms = 10ms
└─ 总耗时：10ms

性能提升：1000ms → 10ms（100 倍）
```

---

## 🎯 问题 2：代码分割（Code Splitting）

### 你的理解是对的！

> "在渲染过程中，如果判断是 lazy 的话，就不会渲染到 html 中？在客户端激活过程中再去加载？"

**答：完全正确！✅**

---

## 📊 代码分割的工作原理

### 传统方式（无代码分割）

```javascript
// ========== 组件定义 ==========
import HeavyComponent from './HeavyComponent'; // 500KB

function ItemPage({ item }) {
  return (
    <div>
      <Header />
      <ProductInfo item={item} />
      <HeavyComponent />  {/* 很大的组件，但不是首屏必需 */}
      <Footer />
    </div>
  );
}

// ========== 服务端渲染 ==========
const html = renderToString(<ItemPage item={itemData} />);

// 问题：
// 1. 服务端要渲染 HeavyComponent（耗时 200ms）
// 2. 客户端要下载 HeavyComponent 的代码（500KB）
// 3. 即使用户可能不会用到这个组件
```

### 使用代码分割

```javascript
// ========== 组件定义 ==========
import React, { lazy, Suspense } from 'react';

// 使用 lazy 动态导入
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function ItemPage({ item }) {
  return (
    <div>
      <Header />
      <ProductInfo item={item} />

      {/* 使用 Suspense 包裹 lazy 组件 */}
      <Suspense fallback={<div>加载中...</div>}>
        <HeavyComponent />
      </Suspense>

      <Footer />
    </div>
  );
}

// ========== 服务端渲染 ==========
const html = renderToString(<ItemPage item={itemData} />);

// 结果：
// 服务端渲染的 HTML：
// <div>
//   <header>...</header>
//   <div class="product-info">...</div>
//   <div>加载中...</div>  ← 只渲染 fallback！
//   <footer>...</footer>
// </div>

// HeavyComponent 不会在服务端渲染！
```

### 客户端激活过程

```javascript
// ========== 客户端代码 ==========
// 1. Hydration（激活）
ReactDOM.hydrate(<ItemPage item={itemData} />, root);

// 2. 激活后，React 发现有 lazy 组件
//    自动加载 HeavyComponent.js

// 3. 加载完成后，替换 fallback
//    <div>加载中...</div> → <HeavyComponent />

// 时间线：
// 0ms    - Hydration 完成（不包括 HeavyComponent）
// 100ms  - 开始加载 HeavyComponent.js
// 500ms  - HeavyComponent.js 加载完成
// 550ms  - 渲染 HeavyComponent
```

---

## 🔬 代码分割的完整示例

### 示例 1：基础用法

```javascript
// ========== 1. 定义 lazy 组件 ==========
import React, { lazy, Suspense } from 'react';

// 重量级组件（500KB）
const Reviews = lazy(() => import('./Reviews'));
const Recommendations = lazy(() => import('./Recommendations'));

// ========== 2. 使用 lazy 组件 ==========
function ItemPage({ item }) {
  return (
    <div className="item-page">
      {/* 首屏必需的内容（会在服务端渲染） */}
      <Header />
      <ProductImages images={item.images} />
      <ProductInfo item={item} />
      <BuyButton itemId={item.id} />

      {/* 非首屏必需的内容（不会在服务端渲染） */}
      <Suspense fallback={<div className="loading">加载评论中...</div>}>
        <Reviews itemId={item.id} />
      </Suspense>

      <Suspense fallback={<div className="loading">加载推荐中...</div>}>
        <Recommendations itemId={item.id} />
      </Suspense>

      <Footer />
    </div>
  );
}

// ========== 3. 服务端渲染 ==========
app.get('/item/:id', async (req, res) => {
  const itemData = await fetchItemData(req.params.id);

  const html = renderToString(<ItemPage item={itemData} />);

  res.send(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root">${html}</div>
        <script src="/main.js"></script>
        <!-- Reviews 和 Recommendations 的代码不会在这里 -->
      </body>
    </html>
  `);
});
```

### 服务端渲染的 HTML

```html
<div class="item-page">
  <!-- ✅ 首屏内容（已渲染） -->
  <header>...</header>
  <div class="product-images">...</div>
  <div class="product-info">
    <h1>iPhone 15 Pro Max</h1>
    <p class="price">¥9999</p>
  </div>
  <button class="buy-btn">立即购买</button>

  <!-- ❌ lazy 组件（只渲染 fallback） -->
  <div class="loading">加载评论中...</div>
  <div class="loading">加载推荐中...</div>

  <footer>...</footer>
</div>
```

### 客户端加载过程

```javascript
// 时间线：
// 0ms    - 用户看到页面（包括 fallback）
// 0ms    - Hydration 开始
// 100ms  - Hydration 完成（不包括 lazy 组件）
// 100ms  - 用户可以点击"立即购买"按钮 ✅

// 100ms  - React 发现 lazy 组件，开始加载
// 200ms  - Reviews.js 加载完成（300KB）
// 250ms  - 渲染 Reviews 组件
// 250ms  - 用户看到评论内容 ✅

// 300ms  - Recommendations.js 加载完成（200KB）
// 350ms  - 渲染 Recommendations 组件
// 350ms  - 用户看到推荐商品 ✅
```

---

## 📊 性能对比

### 不使用代码分割

```
服务端渲染：
├─ 渲染 Header: 10ms
├─ 渲染 ProductInfo: 20ms
├─ 渲染 Reviews: 100ms  ← 耗时！
├─ 渲染 Recommendations: 80ms  ← 耗时！
├─ 渲染 Footer: 10ms
└─ 总耗时: 220ms

客户端加载：
├─ 下载 main.js: 1MB（包含所有组件）
├─ 下载时间: 2000ms
├─ Hydration: 200ms
└─ 总耗时: 2200ms

首屏可交互时间：2200ms
```

### 使用代码分割

```
服务端渲染：
├─ 渲染 Header: 10ms
├─ 渲染 ProductInfo: 20ms
├─ 渲染 Reviews fallback: 1ms  ← 只渲染 fallback！
├─ 渲染 Recommendations fallback: 1ms  ← 只渲染 fallback！
├─ 渲染 Footer: 10ms
└─ 总耗时: 42ms  ← 快了 5 倍！

客户端加载：
├─ 下载 main.js: 500KB（不包含 lazy 组件）
├─ 下载时间: 1000ms
├─ Hydration: 100ms
└─ 总耗时: 1100ms  ← 快了 2 倍！

首屏可交互时间：1100ms  ← 快了 2 倍！

后续加载（按需）：
├─ 下载 Reviews.js: 300KB
├─ 下载时间: 600ms
├─ 渲染: 50ms
└─ 总耗时: 650ms

├─ 下载 Recommendations.js: 200KB
├─ 下载时间: 400ms
├─ 渲染: 50ms
└─ 总耗时: 450ms
```

**性能提升**：
- 服务端渲染时间：220ms → 42ms（快 5 倍）
- 首屏可交互时间：2200ms → 1100ms（快 2 倍）
- 初始 JS 体积：1MB → 500KB（减少 50%）

---

## 🎯 代码分割的最佳实践

### 1. 什么组件适合代码分割？

```javascript
// ✅ 适合代码分割的组件：
// 1. 非首屏必需的组件
const Reviews = lazy(() => import('./Reviews'));
const Recommendations = lazy(() => import('./Recommendations'));

// 2. 体积大的组件
const RichTextEditor = lazy(() => import('./RichTextEditor')); // 500KB

// 3. 低频使用的组件
const AdminPanel = lazy(() => import('./AdminPanel'));

// 4. 条件渲染的组件
const VideoPlayer = lazy(() => import('./VideoPlayer'));

// ❌ 不适合代码分割的组件：
// 1. 首屏必需的组件
import Header from './Header';  // 不要 lazy
import ProductInfo from './ProductInfo';  // 不要 lazy

// 2. 体积小的组件
import Button from './Button';  // 只有 2KB，不值得分割

// 3. 高频使用的组件
import Icon from './Icon';  // 到处都用，不要分割
```

### 2. Suspense 的最佳实践

```javascript
// ✅ 好的做法：为每个 lazy 组件单独包裹 Suspense
function ItemPage() {
  return (
    <div>
      <Header />

      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews />
      </Suspense>

      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations />
      </Suspense>

      <Footer />
    </div>
  );
}

// ⚠️ 不好的做法：多个 lazy 组件共享一个 Suspense
function ItemPage() {
  return (
    <div>
      <Header />

      <Suspense fallback={<div>加载中...</div>}>
        <Reviews />  {/* 如果 Reviews 加载慢，会阻塞 Recommendations */}
        <Recommendations />
      </Suspense>

      <Footer />
    </div>
  );
}
```

### 3. 服务端渲染的注意事项

```javascript
// ❌ 错误：服务端不支持 lazy
import { lazy } from 'react';
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// 服务端渲染会报错！
const html = renderToString(<HeavyComponent />);

// ✅ 正确：使用 Suspense 包裹
const html = renderToString(
  <Suspense fallback={<div>加载中...</div>}>
    <HeavyComponent />
  </Suspense>
);

// 服务端会渲染 fallback，不会报错
```

---

## 🔍 实际项目示例

### 完整的商品详情页

```javascript
// ========== 1. 组件定义 ==========
import React, { lazy, Suspense } from 'react';

// 首屏组件（不分割）
import Header from './Header';
import ProductImages from './ProductImages';
import ProductInfo from './ProductInfo';
import BuyButton from './BuyButton';
import Footer from './Footer';

// 非首屏组件（代码分割）
const ProductDescription = lazy(() => import('./ProductDescription'));
const Reviews = lazy(() => import('./Reviews'));
const QA = lazy(() => import('./QA'));
const Recommendations = lazy(() => import('./Recommendations'));

// 骨架屏组件
function DescriptionSkeleton() {
  return <div className="skeleton" style={{ height: 200 }} />;
}

function ReviewsSkeleton() {
  return (
    <div>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton" style={{ height: 100, marginBottom: 10 }} />
      ))}
    </div>
  );
}

// ========== 2. 页面组件 ==========
function ItemPage({ item }) {
  return (
    <div className="item-page">
      {/* ===== 首屏内容（立即渲染）===== */}
      <Header />

      <div className="main-content">
        <ProductImages images={item.images} />

        <div className="product-details">
          <ProductInfo item={item} />
          <BuyButton itemId={item.id} />
        </div>
      </div>

      {/* ===== 非首屏内容（懒加载）===== */}
      <Suspense fallback={<DescriptionSkeleton />}>
        <ProductDescription description={item.description} />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews itemId={item.id} />
      </Suspense>

      <Suspense fallback={<div className="skeleton" style={{ height: 150 }} />}>
        <QA itemId={item.id} />
      </Suspense>

      <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
        <Recommendations itemId={item.id} />
      </Suspense>

      <Footer />
    </div>
  );
}

// ========== 3. 服务端渲染 ==========
app.get('/item/:id', async (req, res) => {
  const itemData = await fetchItemData(req.params.id);

  const html = renderToString(<ItemPage item={itemData} />);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${itemData.title}</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div id="root">${html}</div>
        <script>
          window.__INITIAL_STATE__ = ${JSON.stringify({ item: itemData })};
        </script>
        <script src="/main.js"></script>
        <!-- lazy 组件的代码会按需加载 -->
      </body>
    </html>
  `);
});
```

### Webpack 配置

```javascript
// webpack.config.js
module.exports = {
  // ... 其他配置

  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // 将 lazy 组件分割成单独的文件
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        },
        // 自动分割 lazy 组件
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true
        }
      }
    }
  },

  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].js',  // lazy 组件的文件名
    path: path.resolve(__dirname, 'dist')
  }
};
```

---

## 📝 总结

### 组件级缓存

**原理**：
- 缓存单个组件的渲染结果（HTML 字符串）
- 下次渲染相同组件时，直接返回缓存的 HTML
- 使用 `dangerouslySetInnerHTML` 插入缓存的 HTML

**适用场景**：
- 重复的组件（如商品卡片、评论卡片）
- 渲染耗时的组件
- 数据不常变化的组件

**性能提升**：
- 单个组件：10ms → 0.1ms（100 倍）
- 100 个组件：1000ms → 10ms（100 倍）

### 代码分割

**原理**：
- 使用 `React.lazy()` 动态导入组件
- 服务端只渲染 `Suspense` 的 `fallback`
- 客户端 hydration 后，按需加载 lazy 组件

**适用场景**：
- 非首屏必需的组件
- 体积大的组件
- 低频使用的组件

**性能提升**：
- 服务端渲染时间：220ms → 42ms（5 倍）
- 首屏可交互时间：2200ms → 1100ms（2 倍）
- 初始 JS 体积：1MB → 500KB（50%）

### 记忆口诀

```
组件级缓存：
- 缓存 HTML 字符串
- 相同组件复用缓存
- 性能提升一百倍

代码分割：
- lazy 动态导入
- 服务端渲染 fallback
- 客户端按需加载
- 首屏快两倍
```

完整的文档已保存，包含所有代码示例和性能数据！🎯