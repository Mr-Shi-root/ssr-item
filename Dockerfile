# ========================================
# 多阶段构建 Dockerfile
# ========================================

# 阶段 1: 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies）
RUN npm ci

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# ========================================
# 阶段 2: 生产运行阶段
FROM node:18-alpine

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 从构建阶段复制构建产物
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

# 创建日志目录
RUN mkdir -p logs && \
    chown -R nodejs:nodejs /app

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动应用
CMD ["npm", "start"]
