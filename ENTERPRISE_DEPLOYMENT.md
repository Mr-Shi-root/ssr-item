# 企业级部署实践详解

## 一、公司项目的"一键部署"是什么？

### 1.1 部署平台架构

```
开发者
    ↓ 提交代码
Git 仓库（GitLab/GitHub）
    ↓ Webhook 触发
部署平台（核心）
    ├─ Jenkins
    ├─ GitLab CI/CD
    ├─ 阿里云 CloudPipeline
    ├─ 腾讯云 CODING DevOps
    └─ 自研部署平台
        ↓
        ├─ 1. 拉取代码
        ├─ 2. 执行构建脚本
        ├─ 3. 构建 Docker 镜像
        ├─ 4. 推送到镜像仓库
        ├─ 5. 部署到 K8s/服务器
        └─ 6. 健康检查
            ↓
生产环境
```

### 1.2 "一键部署"的本质

**用户视角**：
```
开发者 → 打开部署平台 → 点击"部署"按钮 → 完成
```

**实际流程**：
```
点击"部署"按钮
    ↓
部署平台执行脚本
    ├─ git pull
    ├─ npm install
    ├─ npm run build
    ├─ docker build
    ├─ docker push
    ├─ kubectl apply（K8s）或 docker run（单机）
    └─ 健康检查
```

---

## 二、Docker 配置在哪里？

### 2.1 三种常见方式

#### 方式 1：项目代码仓库（最常见）✅

```
your-project/
├── src/
├── package.json
├── Dockerfile              ← Docker 配置在项目里
├── docker-compose.yml
├── .dockerignore
└── .gitlab-ci.yml          ← CI/CD 配置也在项目里
```

**特点**：
- ✅ Docker 配置跟随项目代码
- ✅ 开发者可以自定义配置
- ✅ 版本控制，可以回滚
- ✅ 不同项目可以有不同配置

**部署平台的作用**：
- 读取项目中的 Dockerfile
- 执行 docker build
- 推送镜像
- 部署到服务器

---

#### 方式 2：脚手架内置（中等常见）

```
公司脚手架
├── templates/
│   ├── node-service/
│   │   ├── Dockerfile      ← 脚手架提供的模板
│   │   ├── docker-compose.yml
│   │   └── .gitlab-ci.yml
│   ├── bff-service/
│   │   ├── Dockerfile      ← BFF 专用模板
│   │   └── .gitlab-ci.yml
│   └── frontend/
│       ├── Dockerfile      ← 前端专用模板
│       └── nginx.conf

使用脚手架创建项目
    ↓
npx @company/cli create my-project --type=bff
    ↓
自动生成项目，包含 Dockerfile
```

**特点**：
- ✅ 统一的 Docker 配置
- ✅ 最佳实践内置
- ✅ 开发者无需关心 Docker
- ⚠️ 灵活性较低

---

#### 方式 3：部署平台内置（较少见）

```
部署平台
├── 项目配置
│   ├── 项目名称: my-bff-service
│   ├── 项目类型: Node.js BFF
│   ├── 构建命令: npm run build
│   └── 启动命令: npm start
└── 平台自动生成 Dockerfile
    ↓
    根据项目类型自动选择 Dockerfile 模板
```

**特点**：
- ✅ 开发者完全不需要写 Dockerfile
- ✅ 平台统一管理
- ❌ 灵活性最低
- ❌ 无法自定义配置

---

### 2.2 实际企业中的分布

| 方式 | 占比 | 适用场景 |
|------|------|----------|
| **项目代码仓库** | 70% | 大部分公司 |
| **脚手架内置** | 20% | 大厂、标准化程度高的公司 |
| **部署平台内置** | 10% | 小公司、内部工具 |

---

## 三、BFF 层服务的 Docker 配置

### 3.1 BFF 服务的特点

```
BFF (Backend For Frontend)
├── 特点 1: Node.js 服务
├── 特点 2: 轻量级，主要做数据聚合
├── 特点 3: 需要连接多个后端服务
└── 特点 4: 需要环境变量配置
```

### 3.2 通用的 BFF Dockerfile 模板

```dockerfile
# ===== 多阶段构建 =====

# 阶段 1: 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# ===== 阶段 2: 运行阶段 =====
FROM node:18-alpine

# 安装 PM2
RUN npm install -g pm2

WORKDIR /app

# 只复制生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 复制 PM2 配置
COPY ecosystem.config.js ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000

# 使用 PM2 启动
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

### 3.3 BFF 服务的 docker-compose.yml

```yaml
version: '3.8'

services:
  bff-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      # 环境变量
      - NODE_ENV=production
      - PORT=3000

      # 后端服务地址
      - USER_SERVICE_URL=http://user-service:8001
      - PRODUCT_SERVICE_URL=http://product-service:8002
      - ORDER_SERVICE_URL=http://order-service:8003

      # Redis 配置
      - REDIS_HOST=redis
      - REDIS_PORT=6379

    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - bff-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - bff-network

networks:
  bff-network:
    driver: bridge
```

---

## 四、企业级部署平台示例

### 4.1 阿里云 CloudPipeline

```yaml
# .aliyun-ci.yml（项目根目录）

version: 1.0

stages:
  - name: build
    steps:
      - name: install
        image: node:18
        commands:
          - npm ci

      - name: test
        image: node:18
        commands:
          - npm test

      - name: build
        image: node:18
        commands:
          - npm run build

      - name: docker-build
        image: docker:latest
        commands:
          - docker build -t registry.cn-hangzhou.aliyuncs.com/company/bff-service:$CI_COMMIT_SHA .
          - docker push registry.cn-hangzhou.aliyuncs.com/company/bff-service:$CI_COMMIT_SHA

  - name: deploy
    steps:
      - name: deploy-to-k8s
        image: kubectl:latest
        commands:
          - kubectl set image deployment/bff-service bff-service=registry.cn-hangzhou.aliyuncs.com/company/bff-service:$CI_COMMIT_SHA
          - kubectl rollout status deployment/bff-service
```

**使用方式**：
1. 开发者提交代码
2. 打开阿里云控制台
3. 点击"部署"按钮
4. 平台自动执行 `.aliyun-ci.yml` 中的流程

---

### 4.2 GitLab CI/CD

```yaml
# .gitlab-ci.yml（项目根目录）

stages:
  - build
  - test
  - docker
  - deploy

variables:
  DOCKER_IMAGE: registry.gitlab.com/company/bff-service

# 构建阶段
build:
  stage: build
  image: node:18
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 hour

# 测试阶段
test:
  stage: test
  image: node:18
  script:
    - npm ci
    - npm test

# Docker 构建阶段
docker:
  stage: docker
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $DOCKER_IMAGE:$CI_COMMIT_SHA .
    - docker push $DOCKER_IMAGE:$CI_COMMIT_SHA
    - docker tag $DOCKER_IMAGE:$CI_COMMIT_SHA $DOCKER_IMAGE:latest
    - docker push $DOCKER_IMAGE:latest

# 部署阶段
deploy:
  stage: deploy
  image: alpine:latest
  before_script:
    - apk add --no-cache openssh-client
  script:
    - ssh user@server "docker pull $DOCKER_IMAGE:latest && docker-compose up -d"
  only:
    - main
```

**使用方式**：
1. 开发者提交代码到 main 分支
2. GitLab 自动触发 CI/CD
3. 自动构建、测试、部署
4. 开发者可以在 GitLab 界面查看进度

---

### 4.3 自研部署平台（大厂常见）

```
部署平台 Web 界面
├── 项目列表
│   └── bff-service
│       ├── 基本信息
│       │   ├── 项目名称: bff-service
│       │   ├── 项目类型: Node.js BFF
│       │   ├── Git 仓库: git@gitlab.com:company/bff-service.git
│       │   └── 分支: main
│       ├── 构建配置
│       │   ├── 构建命令: npm run build
│       │   ├── 构建产物: dist/
│       │   └── Dockerfile: 项目根目录
│       ├── 部署配置
│       │   ├── 环境: 生产环境
│       │   ├── 实例数: 3
│       │   ├── CPU: 2 核
│       │   ├── 内存: 4GB
│       │   └── 环境变量: [配置列表]
│       └── 操作按钮
│           ├── [部署] ← 点击这里一键部署
│           ├── [回滚]
│           ├── [查看日志]
│           └── [监控]
```

**点击"部署"后的流程**：

```javascript
// 部署平台后端伪代码
async function deploy(projectId) {
  // 1. 拉取代码
  await git.clone(project.gitUrl, project.branch);

  // 2. 执行构建
  await exec('npm ci');
  await exec('npm run build');

  // 3. 构建 Docker 镜像
  const imageTag = `${project.name}:${Date.now()}`;
  await exec(`docker build -t ${imageTag} .`);

  // 4. 推送镜像
  await exec(`docker push ${imageTag}`);

  // 5. 部署到 K8s
  await k8s.updateDeployment({
    name: project.name,
    image: imageTag,
    replicas: project.replicas,
    env: project.envVars
  });

  // 6. 健康检查
  await waitForHealthy(project.name);

  // 7. 通知开发者
  await notify.success(`${project.name} 部署成功`);
}
```

---

## 五、不同类型服务的 Dockerfile

### 5.1 BFF 服务（你的场景）

```dockerfile
# BFF 服务 Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
RUN npm install -g pm2
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY ecosystem.config.js ./

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

---

### 5.2 前端项目（React/Vue）

```dockerfile
# 前端项目 Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 使用 Nginx 提供静态文件
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

### 5.3 后端 API 服务（Java/Go）

```dockerfile
# Java Spring Boot
FROM maven:3.8-openjdk-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

FROM openjdk:17-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
```

---

### 5.4 微服务（Node.js）

```dockerfile
# 微服务 Dockerfile（与 BFF 类似，但更轻量）
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 8080
CMD ["node", "index.js"]
```

---

## 六、企业级最佳实践

### 6.1 标准化的项目结构

```
company-bff-service/
├── src/                    # 源代码
├── dist/                   # 构建产物
├── package.json
├── Dockerfile              # ✅ 必须有
├── docker-compose.yml      # ✅ 本地开发用
├── .dockerignore           # ✅ 必须有
├── .gitlab-ci.yml          # ✅ CI/CD 配置
├── ecosystem.config.js     # ✅ PM2 配置
├── k8s/                    # K8s 配置（可选）
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
└── README.md
```

### 6.2 环境变量管理

```yaml
# docker-compose.yml
services:
  bff-service:
    build: .
    env_file:
      - .env.production      # 从文件读取环境变量
    environment:
      - NODE_ENV=production
```

```bash
# .env.production（不提交到 Git）
USER_SERVICE_URL=http://user-service:8001
PRODUCT_SERVICE_URL=http://product-service:8002
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=your-secret-key
```

**部署平台管理环境变量**：
```
部署平台界面
└── 环境变量配置
    ├── USER_SERVICE_URL: http://user-service:8001
    ├── REDIS_HOST: redis.company.com
    └── JWT_SECRET: ******（加密存储）
```

---

### 6.3 多环境部署

```yaml
# .gitlab-ci.yml
deploy-dev:
  stage: deploy
  script:
    - docker-compose -f docker-compose.dev.yml up -d
  only:
    - develop

deploy-staging:
  stage: deploy
  script:
    - docker-compose -f docker-compose.staging.yml up -d
  only:
    - staging

deploy-prod:
  stage: deploy
  script:
    - docker-compose -f docker-compose.prod.yml up -d
  only:
    - main
  when: manual  # 生产环境需要手动触发
```

---

## 七、总结

### 7.1 核心问题答案

**Q1: 一键部署是 Docker 部署吗？**
✅ 是的，底层都是 Docker，但用户只需点击按钮

**Q2: Docker 配置在哪里？**
✅ **最常见**：在项目代码仓库（70%）
✅ 其次：在脚手架模板（20%）
✅ 较少：在部署平台（10%）

**Q3: BFF 服务的 Docker 配置通用吗？**
✅ 是的，BFF 服务的 Dockerfile 基本通用
✅ 主要差异在环境变量和依赖配置
✅ 可以使用公司统一的模板

---

### 7.2 企业级部署架构

```
开发者
    ↓ 提交代码
Git 仓库
    ├─ Dockerfile（项目里）
    ├─ .gitlab-ci.yml（项目里）
    └─ docker-compose.yml（项目里）
        ↓ Webhook 触发
部署平台
    ├─ 读取项目配置
    ├─ 执行构建脚本
    ├─ 构建 Docker 镜像
    ├─ 推送到镜像仓库
    └─ 部署到 K8s/服务器
        ↓
生产环境
    └─ Docker 容器运行
```

---

### 7.3 简历表述

**推荐表述**：
```
使用 Docker 容器化部署，在项目中配置 Dockerfile 和 docker-compose.yml，
通过 GitLab CI/CD 实现自动化部署流程。代码提交后自动触发构建、测试、
镜像构建、推送和部署，实现一键部署。容器内使用 PM2 集群模式管理进程，
配合 K8s 实现弹性伸缩和高可用。
```

---

**核心要点**：
1. Docker 配置通常在项目代码里（70%）
2. 部署平台读取项目配置，执行自动化流程
3. BFF 服务的 Dockerfile 基本通用
4. "一键部署"是部署平台提供的界面，底层是 Docker + CI/CD
