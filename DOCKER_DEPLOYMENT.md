# Docker 部署详解

## 一、Docker 在项目中的位置

### 1.1 完整的部署流程

```
本地开发
    ↓ git push
代码仓库（GitHub/GitLab）
    ↓ CI/CD 触发
自动化构建（GitHub Actions / Jenkins）
    ├─ npm install
    ├─ npm run build
    └─ docker build
        ↓
Docker 镜像
    ↓ docker push
镜像仓库（Docker Hub / 私有仓库）
    ↓ 拉取镜像
服务器
    ├─ docker pull
    ├─ docker run
    └─ 容器运行
        ├─ Node.js 进程
        └─ PM2 管理进程
```

---

## 二、Docker 的作用

### 2.1 为什么要用 Docker？

**问题 1：环境不一致**
```
开发环境：macOS + Node.js 18
测试环境：Ubuntu + Node.js 16
生产环境：CentOS + Node.js 14

→ 可能出现"在我机器上能跑"的问题
```

**Docker 解决方案**：
```
Docker 镜像包含：
- 操作系统（Ubuntu）
- Node.js 18
- 项目代码
- 依赖包

→ 所有环境运行相同的镜像，保证一致性
```

**问题 2：部署复杂**
```
传统部署：
1. SSH 登录服务器
2. 安装 Node.js
3. 安装依赖
4. 配置环境变量
5. 启动服务
6. 配置 Nginx
7. 配置 PM2

→ 步骤多，容易出错
```

**Docker 解决方案**：
```
Docker 部署：
1. docker pull image
2. docker run

→ 一条命令启动
```

---

## 三、Docker 配置文件

### 3.1 Dockerfile（已创建）

```dockerfile
# /Users/mrshi/Documents/Project/ssr-item/Dockerfile

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

**解释**：
```
FROM node:18-alpine
↓ 基于 Node.js 18 的 Alpine Linux 镜像（体积小）

WORKDIR /app
↓ 设置工作目录为 /app

COPY package*.json ./
↓ 复制 package.json 和 package-lock.json

RUN npm ci --only=production
↓ 安装生产依赖（不包括 devDependencies）

COPY build/ ./build/
COPY public/ ./public/
↓ 复制构建产物（不复制源代码）

EXPOSE 3000
↓ 声明容器监听 3000 端口

CMD ["node", "build/server.js"]
↓ 启动 Node.js 服务
```

---

### 3.2 docker-compose.yml（已创建）

```yaml
# /Users/mrshi/Documents/Project/ssr-item/docker-compose.yml

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

**解释**：
```yaml
services:
  ssr-item:           # 服务名称
    build: .          # 从当前目录的 Dockerfile 构建
    ports:
      - "3000:3000"   # 映射端口：宿主机:容器
    environment:      # 环境变量
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped  # 自动重启策略
    volumes:
      - ./logs:/app/logs     # 挂载日志目录
```

---

### 3.3 .dockerignore

```
# .dockerignore
node_modules/
src/
config/
.git/
.gitignore
README.md
*.md
.env
.DS_Store
npm-debug.log
```

**作用**：构建镜像时忽略这些文件，减小镜像体积

---

## 四、Docker 部署流程

### 4.1 本地构建镜像

```bash
# 步骤 1：本地构建项目
npm install
npm run build

# 步骤 2：构建 Docker 镜像
docker build -t ssr-item:latest .

# 步骤 3：查看镜像
docker images
# REPOSITORY   TAG       IMAGE ID       SIZE
# ssr-item     latest    abc123def456   150MB

# 步骤 4：运行容器
docker run -d \
  --name ssr-item \
  -p 3000:3000 \
  -e NODE_ENV=production \
  ssr-item:latest

# 步骤 5：查看运行状态
docker ps
# CONTAINER ID   IMAGE              STATUS         PORTS
# xyz789abc123   ssr-item:latest    Up 2 minutes   0.0.0.0:3000->3000/tcp

# 步骤 6：查看日志
docker logs ssr-item

# 步骤 7：停止容器
docker stop ssr-item

# 步骤 8：删除容器
docker rm ssr-item
```

---

### 4.2 使用 docker-compose

```bash
# 步骤 1：构建并启动
docker-compose up -d

# 步骤 2：查看状态
docker-compose ps

# 步骤 3：查看日志
docker-compose logs -f

# 步骤 4：停止服务
docker-compose down

# 步骤 5：重启服务
docker-compose restart
```

---

## 五、自动化部署（CI/CD）

### 5.1 GitHub Actions 配置

```yaml
# .github/workflows/deploy.yml

name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      # 1. 检出代码
      - name: Checkout code
        uses: actions/checkout@v3

      # 2. 设置 Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      # 3. 安装依赖
      - name: Install dependencies
        run: npm ci

      # 4. 运行测试
      - name: Run tests
        run: npm test

      # 5. 构建项目
      - name: Build project
        run: npm run build

      # 6. 登录 Docker Hub
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      # 7. 构建 Docker 镜像
      - name: Build Docker image
        run: docker build -t username/ssr-item:latest .

      # 8. 推送镜像到 Docker Hub
      - name: Push Docker image
        run: docker push username/ssr-item:latest

      # 9. 部署到服务器
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            # 拉取最新镜像
            docker pull username/ssr-item:latest

            # 停止旧容器
            docker stop ssr-item || true
            docker rm ssr-item || true

            # 启动新容器
            docker run -d \
              --name ssr-item \
              -p 3000:3000 \
              -e NODE_ENV=production \
              --restart unless-stopped \
              username/ssr-item:latest

            # 清理旧镜像
            docker image prune -f
```

---

### 5.2 完整的自动化流程

```
开发者提交代码
    ↓ git push origin main
GitHub 仓库
    ↓ 触发 GitHub Actions
CI/CD 流水线
    ├─ 1. 检出代码
    ├─ 2. 安装依赖
    ├─ 3. 运行测试
    ├─ 4. 构建项目（npm run build）
    ├─ 5. 构建 Docker 镜像
    ├─ 6. 推送镜像到 Docker Hub
    └─ 7. SSH 连接服务器
        ↓
服务器
    ├─ 拉取最新镜像
    ├─ 停止旧容器
    ├─ 启动新容器
    └─ 清理旧镜像
        ↓
服务运行
    └─ Docker 容器
        └─ Node.js 进程
            └─ PM2 管理（可选）
```

---

## 六、Docker vs PM2

### 6.1 两种进程管理方式

**方式 1：Docker + Node.js（简单）**

```dockerfile
# Dockerfile
CMD ["node", "build/server.js"]
```

```bash
# 启动
docker run -d --name ssr-item ssr-item:latest

# 优点：
✅ 简单，容器自动重启
✅ Docker 负责进程管理

# 缺点：
❌ 单进程，无法利用多核 CPU
❌ 无法查看进程状态
```

---

**方式 2：Docker + PM2（推荐）**

```dockerfile
# Dockerfile
FROM node:18-alpine

# 安装 PM2
RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY build/ ./build/
COPY public/ ./public/

# 复制 PM2 配置
COPY ecosystem.config.js ./

EXPOSE 3000

# 使用 PM2 启动
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ssr-item',
    script: './build/server.js',
    instances: 'max',  // 使用所有 CPU 核心
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

```bash
# 启动
docker run -d --name ssr-item ssr-item:latest

# 优点：
✅ 多进程，充分利用多核 CPU
✅ 自动重启
✅ 负载均衡
✅ 可以查看进程状态

# 查看 PM2 状态
docker exec ssr-item pm2 list
docker exec ssr-item pm2 logs
```

---

### 6.2 对比表格

| 特性 | Docker + Node.js | Docker + PM2 |
|------|-----------------|--------------|
| **进程数** | 单进程 | 多进程（集群） |
| **CPU 利用** | 单核 | 多核 |
| **自动重启** | Docker 负责 | PM2 + Docker |
| **负载均衡** | ❌ | ✅ |
| **进程监控** | ❌ | ✅ |
| **日志管理** | Docker logs | PM2 logs |
| **复杂度** | 低 | 中 |
| **推荐场景** | 开发/测试 | 生产环境 |

---

## 七、Docker 在服务器上的运行

### 7.1 服务器架构

```
服务器（Ubuntu）
    ↓
Docker Engine
    ↓
Docker 容器（ssr-item）
    ├─ 操作系统：Alpine Linux
    ├─ Node.js 18
    ├─ PM2（可选）
    └─ 应用进程
        ├─ Worker 1（端口 3000）
        ├─ Worker 2（端口 3000）
        ├─ Worker 3（端口 3000）
        └─ Worker 4（端口 3000）
            ↓
Nginx（宿主机）
    ↓ 反向代理到容器的 3000 端口
用户请求
```

---

### 7.2 完整的服务器配置

**步骤 1：安装 Docker**

```bash
# 在服务器上安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
```

**步骤 2：拉取镜像并运行**

```bash
# 拉取镜像
docker pull username/ssr-item:latest

# 运行容器
docker run -d \
  --name ssr-item \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  --restart unless-stopped \
  -v /var/log/ssr-item:/app/logs \
  username/ssr-item:latest

# 查看运行状态
docker ps

# 查看日志
docker logs -f ssr-item
```

**步骤 3：配置 Nginx**

```nginx
# /etc/nginx/sites-available/ssr-item

upstream docker_backend {
    server 127.0.0.1:3000;  # Docker 容器的端口
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://docker_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/ssr-item /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 八、Docker 常用命令

### 8.1 镜像管理

```bash
# 构建镜像
docker build -t ssr-item:latest .

# 查看镜像
docker images

# 删除镜像
docker rmi ssr-item:latest

# 推送镜像
docker push username/ssr-item:latest

# 拉取镜像
docker pull username/ssr-item:latest

# 清理未使用的镜像
docker image prune -f
```

### 8.2 容器管理

```bash
# 运行容器
docker run -d --name ssr-item -p 3000:3000 ssr-item:latest

# 查看运行中的容器
docker ps

# 查看所有容器（包括停止的）
docker ps -a

# 停止容器
docker stop ssr-item

# 启动容器
docker start ssr-item

# 重启容器
docker restart ssr-item

# 删除容器
docker rm ssr-item

# 强制删除运行中的容器
docker rm -f ssr-item

# 查看容器日志
docker logs ssr-item
docker logs -f ssr-item  # 实时查看

# 进入容器
docker exec -it ssr-item sh

# 查看容器资源使用
docker stats ssr-item
```

### 8.3 docker-compose 命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps

# 重新构建并启动
docker-compose up -d --build
```

---

## 九、总结

### 9.1 Docker 的作用

✅ **环境一致性**：开发、测试、生产环境完全一致
✅ **简化部署**：一条命令启动服务
✅ **隔离性**：容器之间互不影响
✅ **可移植性**：可以在任何支持 Docker 的平台运行
✅ **版本管理**：通过镜像标签管理不同版本
✅ **自动化**：配合 CI/CD 实现自动化部署

### 9.2 完整流程

```
1. 开发者提交代码
   ↓
2. CI/CD 自动构建
   ├─ npm run build
   └─ docker build
   ↓
3. 推送镜像到仓库
   ↓
4. 服务器拉取镜像
   ↓
5. Docker 运行容器
   ├─ 自动重启
   └─ 进程管理（PM2）
   ↓
6. Nginx 反向代理
   ↓
7. 用户访问
```

### 9.3 简历表述

**推荐表述**：
```
使用 Docker 容器化部署，配合 GitHub Actions 实现 CI/CD 自动化流水线。
代码提交后自动构建 Docker 镜像并推送到镜像仓库，服务器自动拉取最新
镜像并重启容器，实现零停机部署。容器内使用 PM2 集群模式管理进程，
配合 Nginx 反向代理实现高可用架构。
```

---

**Docker 是容器化部署的核心工具，负责打包、分发、运行应用，配合 PM2 管理进程，实现自动化部署和高可用！**
