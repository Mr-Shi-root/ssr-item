# SSR 商品详情页架构设计文档

## 一、架构概述

本项目实现了一个支持 **SSR（服务端渲染）** 和 **CSR（客户端渲染）** 混合渲染的商品详情页系统，专门针对普通商品和秒杀商品的不同性能需求进行优化。

### 核心特性

- **智能路由判断**：通过轻量级预检接口判断商品类型
- **双渲染模式**：普通商品走 SSR，秒杀商品走 CSR 骨架页
- **极致性能**：秒杀页面采用骨架屏 + 最小化渲染策略
- **单页面架构**：统一入口，动态路由分发

---

## 二、技术栈

### 后端
- **Koa**: 轻量级 Node.js 服务端框架
- **Koa Router**: 路由管理
- **React Server**: 服务端渲染

### 前端
- **React 18**: UI 组件库
- **React DOM**: 客户端渲染和 hydration

### 构建工具
- **Webpack 5**: 模块打包
- **Babel**: JavaScript 编译
- **Nodemon**: 开发环境热重载

---

## 三、目录结构

```
ssr-item/
├── config/                      # Webpack 配置
│   ├── webpack.client.js        # 客户端打包配置
│   ├── webpack.server.js        # 服务端打包配置
│   └── webpack.skeleton.js      # 骨架页打包配置
├── src/
│   ├── server/                  # 服务端代码
│   │   ├── index.js            # Koa 服务入口
│   │   ├── ssr.js              # SSR 渲染逻辑
│   │   └── skeleton.js         # CSR 骨架页渲染
│   ├── client/                  # 客户端代码
│   │   ├── index.js            # SSR 页面 hydration 入口
│   │   ├── skeleton.js         # 秒杀页面 CSR 入口
│   │   └── skeleton.html       # 骨架页 HTML 模板
│   ├── pages/                   # React 页面组件
│   │   ├── ItemDetailPage.jsx  # 普通商品详情页
│   │   └── SeckillItemPage.jsx # 秒杀商品详情页
│   ├── api/                     # API 接口
│   │   └── precheck.js         # 预检接口
│   ├── components/              # 公共组件（待扩展）
│   ├── utils/                   # 工具函数（待扩展）
│   └── shared/                  # 共享代码（待扩展）
├── public/                      # 静态资源
│   └── skeleton/               # 骨架页构建产物
├── build/                       # 服务端构建产物
├── package.json
└── .babelrc
```

---

## 四、核心流程

### 4.1 请求处理流程

```
用户请求 /item/:id
    ↓
Koa 路由接收请求
    ↓
调用预检接口 precheckItem(itemId)
    ↓
    ├─→ isSeckill = true  → 返回 CSR 骨架页 HTML
    │                        ↓
    │                     客户端加载 skeleton.bundle.js
    │                        ↓
    │                     React 渲染秒杀页面
    │                        ↓
    │                     调用 /api/item/:id 获取数据
    │
    └─→ isSeckill = false → 服务端 SSR 渲染
                             ↓
                          获取商品数据
                             ↓
                          React.renderToString()
                             ↓
                          返回完整 HTML（含数据）
                             ↓
                          客户端 hydration
```

### 4.2 预检接口设计

**接口职责**：快速判断商品类型，决定渲染策略

**设计原则**：
- 轻量级：只返回必要的判断信息
- 高性能：响应时间 < 50ms
- 可缓存：支持 CDN 缓存

**返回数据结构**：
```javascript
{
  isSeckill: boolean,    // 是否秒杀商品
  data: {
    itemId: string,
    type: 'seckill' | 'normal',
    timestamp: number
  }
}
```

**实现位置**：[src/api/precheck.js](src/api/precheck.js)

---

## 五、渲染策略详解

### 5.1 SSR 渲染（普通商品）

**适用场景**：
- 普通商品详情页
- 需要 SEO 优化
- 首屏内容丰富

**渲染流程**：
1. 服务端获取商品完整数据
2. 使用 `ReactDOMServer.renderToString()` 渲染组件
3. 生成完整 HTML，注入初始数据到 `window.__INITIAL_DATA__`
4. 返回 HTML 给客户端
5. 客户端加载 `client.bundle.js` 进行 hydration

**优势**：
- 首屏渲染快，SEO 友好
- 用户立即看到完整内容
- 支持无 JS 环境访问

**实现位置**：[src/server/ssr.js](src/server/ssr.js)

### 5.2 CSR 骨架页（秒杀商品）

**适用场景**：
- 秒杀商品详情页
- 高并发场景
- 追求极致性能

**渲染流程**：
1. 服务端直接返回预构建的骨架页 HTML
2. 骨架页包含加载动画和基础结构
3. 客户端加载 `skeleton.bundle.js`
4. React 在客户端渲染秒杀页面
5. 异步调用 `/api/item/:id` 获取数据
6. 隐藏骨架屏，显示实际内容

**优势**：
- 服务端压力小，无需渲染
- HTML 可以 CDN 缓存
- 支持高并发访问
- 关键按钮优先渲染

**实现位置**：[src/server/skeleton.js](src/server/skeleton.js)

---

## 六、性能优化策略

### 6.1 秒杀页面优化

1. **骨架屏预加载**
   - 服务端直接返回静态 HTML
   - 包含 CSS 动画，提升感知性能

2. **最小化渲染**
   - 只渲染关键信息：标题、价格、库存、按钮
   - 延迟加载非关键内容

3. **CDN 部署**
   - 骨架页 HTML 可部署到 CDN
   - `skeleton.bundle.js` 使用 CDN 加速

4. **接口优化**
   - 预检接口响应时间 < 50ms
   - 商品详情接口只返回必要字段

### 6.2 SSR 页面优化

1. **数据预取**
   - 服务端并行获取所有数据
   - 避免客户端瀑布流请求

2. **Hydration 优化**
   - 使用 `hydrateRoot` 而非 `createRoot`
   - 避免重复渲染

3. **代码分割**
   - 按需加载非首屏组件
   - 减小初始 bundle 体积

---

## 七、部署方案

### 7.1 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器（并发启动客户端和服务端）
npm run dev

# 访问
# 普通商品: http://localhost:3000/item/123
# 秒杀商品: http://localhost:3000/item/SK001
```

### 7.2 生产环境

```bash
# 构建
npm run build

# 启动生产服务器
npm start
```

**构建产物**：
- `build/server.js` - 服务端代码
- `public/client.bundle.js` - 客户端 SSR hydration 代码
- `public/skeleton/` - 骨架页静态资源

### 7.3 CDN 部署建议

**可 CDN 化的资源**：
- `public/skeleton/index.html` - 骨架页 HTML
- `public/skeleton/skeleton.bundle.js` - 骨架页 JS
- `public/client.bundle.js` - 客户端 JS

**CDN 配置**：
```javascript
// 修改 webpack.skeleton.js 的 publicPath
output: {
  publicPath: 'https://cdn.example.com/skeleton/'
}
```

---

## 八、扩展方案

### 8.1 支持更多商品类型

在 [src/api/precheck.js](src/api/precheck.js) 中扩展判断逻辑：

```javascript
return {
  renderType: 'ssr' | 'csr' | 'hybrid',
  data: { ... }
}
```

### 8.2 添加缓存层

```javascript
// 在 src/server/index.js 中添加
const cache = new Map();

router.get('/item/:id', async (ctx) => {
  const cacheKey = `item_${ctx.params.id}`;

  if (cache.has(cacheKey)) {
    ctx.body = cache.get(cacheKey);
    return;
  }

  // ... 渲染逻辑
  cache.set(cacheKey, html);
});
```

### 8.3 监控和日志

```javascript
// 添加性能监控
const startTime = Date.now();
// ... 渲染逻辑
console.log(`渲染耗时: ${Date.now() - startTime}ms`);
```

---

## 九、测试方案

### 9.1 功能测试

```bash
# 测试普通商品（SSR）
curl http://localhost:3000/item/123

# 测试秒杀商品（CSR）
curl http://localhost:3000/item/SK001

# 测试 API 接口
curl http://localhost:3000/api/item/123

# 健康检查
curl http://localhost:3000/health
```

### 9.2 性能测试

使用 Apache Bench 或 wrk 进行压测：

```bash
# 测试 SSR 性能
ab -n 1000 -c 100 http://localhost:3000/item/123

# 测试 CSR 骨架页性能
ab -n 1000 -c 100 http://localhost:3000/item/SK001
```

---

## 十、常见问题

### Q1: 如何判断商品是否为秒杀？

**A**: 在 [src/api/precheck.js](src/api/precheck.js) 中实现判断逻辑。当前 Mock 实现是：itemId 以 'SK' 开头的为秒杀商品。实际项目中应该调用真实的预检接口。

### Q2: 骨架页可以部署到 CDN 吗？

**A**: 可以。骨架页是静态 HTML + JS，完全可以部署到 CDN。只需修改 `webpack.skeleton.js` 的 `publicPath` 配置。

### Q3: 如何添加新的页面类型？

**A**:
1. 在 [src/pages/](src/pages/) 创建新的 React 组件
2. 在 [src/server/index.js](src/server/index.js) 添加路由逻辑
3. 根据需要选择 SSR 或 CSR 渲染方式

### Q4: 如何优化首屏加载速度？

**A**:
- SSR 页面：优化数据获取速度，使用缓存
- CSR 骨架页：减小 bundle 体积，使用 CDN
- 通用：启用 gzip 压缩，使用 HTTP/2

---

## 十一、关键代码说明

### 11.1 服务端入口

[src/server/index.js](src/server/index.js) - 核心路由逻辑：

```javascript
router.get('/item/:id', async (ctx) => {
  const { isSeckill, data } = await precheckItem(itemId);

  if (isSeckill) {
    ctx.body = renderSkeleton(itemId, data);  // CSR
  } else {
    ctx.body = await renderSSR(itemId);       // SSR
  }
});
```

### 11.2 SSR 渲染

[src/server/ssr.js](src/server/ssr.js) - React 服务端渲染：

```javascript
const appHtml = ReactDOMServer.renderToString(
  React.createElement(ItemDetailPage, { itemData })
);
```

### 11.3 客户端 Hydration

[src/client/index.js](src/client/index.js) - SSR 页面激活：

```javascript
ReactDOM.hydrateRoot(
  document.getElementById('root'),
  <ItemDetailPage itemData={initialData} />
);
```

### 11.4 秒杀页面 CSR

[src/client/skeleton.js](src/client/skeleton.js) - 纯客户端渲染：

```javascript
const root = ReactDOM.createRoot(container);
root.render(<SeckillItemPage />);
```

---

## 十二、总结

本架构通过 **智能路由 + 双渲染模式** 的设计，实现了：

✅ **普通商品**：完整的 SSR 渲染，SEO 友好，首屏快速
✅ **秒杀商品**：轻量级 CSR 骨架页，高并发支持，服务端压力小
✅ **统一入口**：单页面架构，动态路由分发
✅ **易扩展**：支持添加更多商品类型和渲染策略

这种架构特别适合电商场景中需要同时支持普通商品和高并发秒杀商品的需求。
