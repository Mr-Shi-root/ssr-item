# 部署指南

## 一、构建和部署流程

### 1.1 本地构建

```bash
# 安装依赖
npm install

# 生产环境构建
npm run build
```

**构建产物说明**：

```
ssr-item/
├── build/
│   └── server.js              # 服务端代码（Koa + SSR 渲染逻辑）
├── public/
│   ├── client.bundle.js       # SSR 页面的客户端 hydration 代码
│   └── skeleton/
│       ├── index.html         # 秒杀骨架页 HTML（可选，实际由服务端动态生成）
│       └── skeleton.bundle.js # 秒杀页面的客户端渲染代码
```

### 1.2 部署到服务器

#### 方案一：单服务器部署（推荐入门）

```bash
# 1. 上传构建产物到服务器
scp -r build/ public/ package.json user@your-server:/var/www/ssr-item/

# 2. SSH 登录服务器
ssh user@your-server

# 3. 进入项目目录
cd /var/www/ssr-item

# 4. 安装生产依赖
npm install --production

# 5. 启动服务（使用 PM2 管理进程）
npm install -g pm2
pm2 start build/server.js --name ssr-item

# 6. 查看日志
pm2 logs ssr-item

# 7. 设置开机自启
pm2 startup
pm2 save
```

#### 方案二：Nginx + Node.js（推荐生产）

**架构图**：
```
用户请求
    ↓
Nginx (80/443)
    ├─ 静态资源 → /public/* (直接返回)
    └─ 动态请求 → 反向代理到 Node.js (3000)
```

**Nginx 配置** (`/etc/nginx/sites-available/ssr-item`):

```nginx
upstream nodejs_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # 静态资源直接由 Nginx 提供（性能更好）
    location /public/ {
        alias /var/www/ssr-item/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 秒杀骨架页静态资源（可选 CDN）
    location /skeleton/ {
        alias /var/www/ssr-item/public/skeleton/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # 动态请求转发到 Node.js
    location / {
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

**启动服务**：
```bash
# 启用 Nginx 配置
sudo ln -s /etc/nginx/sites-available/ssr-item /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 启动 Node.js 服务
cd /var/www/ssr-item
PORT=3000 NODE_ENV=production pm2 start build/server.js --name ssr-item
```

#### 方案三：Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制构建产物
COPY build/ ./build/
COPY public/ ./public/

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "build/server.js"]
```

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ssr-item:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

**部署命令**：
```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 二、访问方式详解

### 2.1 URL 路由规则

**这是单页面应用，但使用动态路由**：

| URL 路径 | 商品类型 | 渲染方式 | 说明 |
|---------|---------|---------|------|
| `/item/123` | 普通商品 | SSR | 服务端完整渲染 |
| `/item/456` | 普通商品 | SSR | 服务端完整渲染 |
| `/item/SK001` | 秒杀商品 | CSR 骨架页 | 客户端渲染 |
| `/item/SK999` | 秒杀商品 | CSR 骨架页 | 客户端渲染 |
| `/api/item/:id` | API 接口 | JSON | 返回商品数据 |
| `/health` | 健康检查 | JSON | 服务状态 |

### 2.2 实际访问示例

部署后，假设你的域名是 `shop.example.com`：

```bash
# 访问普通商品（SSR 渲染）
https://shop.example.com/item/123
https://shop.example.com/item/product-abc

# 访问秒杀商品（CSR 骨架页）
https://shop.example.com/item/SK001
https://shop.example.com/item/SK-flash-sale-2024

# API 接口（用于客户端获取数据）
https://shop.example.com/api/item/123

# 健康检查
https://shop.example.com/health
```

### 2.3 如何区分普通商品和秒杀商品？

**核心机制：预检接口**

当用户访问 `/item/:id` 时，服务端会：

1. **调用预检接口** `precheckItem(itemId)`
2. **根据返回结果决定渲染方式**

**当前实现**（Mock 版本）：

在 [src/api/precheck.js](src/api/precheck.js#L32-L42) 中：

```javascript
function mockPrecheckAPI(itemId) {
  // 规则：itemId 以 'SK' 开头的为秒杀商品
  const isSeckill = itemId.startsWith('SK');

  return {
    isSeckill,
    data: {
      itemId,
      type: isSeckill ? 'seckill' : 'normal'
    }
  };
}
```

**生产环境实现**：

你需要替换为真实的预检接口：

```javascript
// src/api/precheck.js
async function precheckItem(itemId) {
  try {
    // 调用你的后端预检接口
    const response = await axios.get(`https://api.example.com/precheck/${itemId}`, {
      timeout: 100 // 超时时间 100ms，保证快速响应
    });

    return {
      isSeckill: response.data.isSeckill,
      data: response.data
    };
  } catch (error) {
    console.error('预检接口失败:', error);
    // 降级策略：失败时默认走 SSR
    return { isSeckill: false, data: {} };
  }
}
```

**预检接口设计建议**：

你的后端预检接口应该：

```javascript
// GET /precheck/:itemId
// 响应示例
{
  "isSeckill": true,
  "data": {
    "itemId": "SK001",
    "type": "seckill",
    "startTime": 1701234567890,
    "endTime": 1701238167890
  }
}
```

**判断逻辑可以基于**：
- 商品 ID 前缀（如 `SK` 开头）
- 数据库字段（`item.type === 'seckill'`）
- 时间范围（当前时间在秒杀时间段内）
- Redis 缓存标记

---

## 三、单页面 vs 多页面说明

### 3.1 这是单页面应用吗？

**是的，但是是特殊的单页面应用**：

- **单一入口**：所有商品详情都通过 `/item/:id` 访问
- **动态路由**：根据 `itemId` 动态决定渲染方式
- **混合渲染**：不是传统的纯 SPA，而是 SSR + CSR 混合

### 3.2 与传统 SPA 的区别

| 特性 | 传统 SPA | 本项目 |
|-----|---------|--------|
| 路由方式 | 客户端路由 | 服务端动态路由 |
| 首屏渲染 | 客户端渲染 | SSR 或 CSR 骨架页 |
| SEO | 需要额外处理 | SSR 天然支持 |
| 页面切换 | 无刷新 | 每次访问都是新请求 |

### 3.3 为什么这样设计？

**优势**：
1. **灵活性**：不同商品类型可以用不同渲染策略
2. **性能**：秒杀商品用 CSR 减轻服务端压力
3. **SEO**：普通商品用 SSR 保证搜索引擎收录
4. **简单**：无需复杂的客户端路由管理

---

## 四、CDN 部署（可选，推荐）

### 4.1 为什么要用 CDN？

秒杀骨架页的静态资源可以部署到 CDN，获得：
- 更快的加载速度
- 减轻源站压力
- 支持更高并发

### 4.2 CDN 部署步骤

**1. 上传静态资源到 CDN**

```bash
# 构建后，上传这些文件到 CDN
public/skeleton/skeleton.bundle.js
public/client.bundle.js
```

**2. 修改 Webpack 配置**

编辑 [config/webpack.skeleton.js](config/webpack.skeleton.js):

```javascript
output: {
  path: path.resolve(__dirname, '../public/skeleton'),
  filename: 'skeleton.bundle.js',
  publicPath: 'https://cdn.example.com/ssr-item/skeleton/' // 改为你的 CDN 地址
}
```

编辑 [config/webpack.client.js](config/webpack.client.js):

```javascript
output: {
  path: path.resolve(__dirname, '../public'),
  filename: 'client.bundle.js',
  publicPath: 'https://cdn.example.com/ssr-item/' // 改为你的 CDN 地址
}
```

**3. 修改服务端代码**

编辑 [src/server/ssr.js](src/server/ssr.js#L67):

```javascript
<!-- 加载客户端 bundle -->
<script src="https://cdn.example.com/ssr-item/client.bundle.js"></script>
```

编辑 [src/server/skeleton.js](src/server/skeleton.js#L82):

```javascript
<!-- 加载秒杀页面的客户端脚本 -->
<script src="https://cdn.example.com/ssr-item/skeleton/skeleton.bundle.js"></script>
```

**4. 重新构建并部署**

```bash
npm run build
# 上传新的构建产物到服务器
```

---

## 五、环境变量配置

创建 `.env` 文件（生产环境）：

```bash
# 服务端口
PORT=3000

# 运行环境
NODE_ENV=production

# API 地址
API_BASE_URL=https://api.example.com

# CDN 地址（可选）
CDN_URL=https://cdn.example.com/ssr-item

# 预检接口地址
PRECHECK_API_URL=https://api.example.com/precheck
```

修改 [src/api/precheck.js](src/api/precheck.js) 使用环境变量：

```javascript
const PRECHECK_API_URL = process.env.PRECHECK_API_URL || 'http://localhost:3000/api/precheck';

async function precheckItem(itemId) {
  const response = await axios.get(`${PRECHECK_API_URL}/${itemId}`);
  // ...
}
```

---

## 六、监控和日志

### 6.1 添加访问日志

编辑 [src/server/index.js](src/server/index.js)，添加中间件：

```javascript
const Koa = require('koa');
const app = new Koa();

// 访问日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ctx.status} - ${ms}ms`);
});
```

### 6.2 性能监控

```javascript
router.get('/item/:id', async (ctx) => {
  const startTime = Date.now();
  const itemId = ctx.params.id;

  const { isSeckill, data } = await precheckItem(itemId);
  const precheckTime = Date.now() - startTime;

  console.log(`预检耗时: ${precheckTime}ms`);

  if (isSeckill) {
    ctx.body = renderSkeleton(itemId, data);
    console.log(`骨架页渲染耗时: ${Date.now() - startTime}ms`);
  } else {
    const html = await renderSSR(itemId);
    console.log(`SSR 渲染耗时: ${Date.now() - startTime}ms`);
    ctx.body = html;
  }
});
```

---

## 七、常见问题

### Q1: 部署后访问 404？

**A**: 检查：
1. Node.js 服务是否启动：`pm2 status`
2. 端口是否正确：`netstat -tlnp | grep 3000`
3. Nginx 配置是否正确：`sudo nginx -t`

### Q2: 静态资源加载失败？

**A**: 检查：
1. `public/` 目录是否上传
2. Nginx 静态资源路径是否正确
3. 浏览器控制台查看具体错误

### Q3: 如何更新代码？

```bash
# 1. 本地构建
npm run build

# 2. 上传到服务器
scp -r build/ public/ user@server:/var/www/ssr-item/

# 3. 重启服务
pm2 restart ssr-item
```

### Q4: 如何查看服务日志？

```bash
# PM2 日志
pm2 logs ssr-item

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 八、快速部署检查清单

- [ ] 本地构建成功：`npm run build`
- [ ] 上传构建产物到服务器
- [ ] 安装生产依赖：`npm install --production`
- [ ] 配置环境变量（`.env` 或环境变量）
- [ ] 启动 Node.js 服务：`pm2 start build/server.js`
- [ ] 配置 Nginx 反向代理（可选）
- [ ] 测试访问：`curl http://localhost:3000/health`
- [ ] 测试普通商品：`curl http://localhost:3000/item/123`
- [ ] 测试秒杀商品：`curl http://localhost:3000/item/SK001`
- [ ] 配置 CDN（可选）
- [ ] 设置监控和日志

---

## 九、性能优化建议

1. **启用 Gzip 压缩**（Nginx 配置中已包含）
2. **使用 CDN 加速静态资源**
3. **添加 Redis 缓存**（缓存预检结果和商品数据）
4. **使用 PM2 集群模式**：`pm2 start build/server.js -i max`
5. **配置 HTTP/2**（Nginx + SSL）

---

完整的架构设计请参考 [ARCHITECTURE.md](ARCHITECTURE.md)
