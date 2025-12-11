# SSR Item 生产环境部署指南

## 📋 目录

- [系统架构](#系统架构)
- [生产环境必备组件](#生产环境必备组件)
- [部署前准备](#部署前准备)
- [Docker 部署](#docker-部署)
- [Kubernetes 部署](#kubernetes-部署)
- [监控告警配置](#监控告警配置)
- [性能优化建议](#性能优化建议)
- [故障排查](#故障排查)
- [运维操作](#运维操作)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         负载均衡 / CDN                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Ingress / API Gateway                   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  SSR Service │      │  SSR Service │      │  SSR Service │
│   (Pod 1)    │      │   (Pod 2)    │      │   (Pod 3)    │
└──────────────┘      └──────────────┘      └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│    Redis     │      │  Prometheus  │      │   Grafana    │
│   (缓存)      │      │   (监控)      │      │  (可视化)     │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## 生产环境必备组件

### ✅ 已集成的核心组件

#### 1. **日志系统 (log4js)**
- ✅ 结构化日志输出
- ✅ 日志分级（error, warn, info, debug）
- ✅ 日志文件按日期滚动
- ✅ 日志压缩和自动清理
- ✅ 多种日志类型（访问日志、性能日志、业务日志、错误日志）

**日志位置**: `/app/logs/`
- `all-YYYY-MM-DD.log` - 所有日志
- `error-YYYY-MM-DD.log` - 错误日志
- `performance-YYYY-MM-DD.log` - 性能日志
- `business-YYYY-MM-DD.log` - 业务日志
- `access-YYYY-MM-DD.log` - 访问日志

#### 2. **全链路追踪 (Tracer)**
- ✅ 自动生成 Trace ID 和 Request ID
- ✅ 支持跨服务追踪（通过 HTTP Header 传递）
- ✅ 追踪信息自动注入响应头
- ✅ 与日志系统集成

**追踪 Headers**:
- `X-Trace-Id` - 全链路追踪 ID
- `X-Request-Id` - 请求唯一 ID
- `X-Span-Id` - 当前服务 Span ID

#### 3. **性能监控 (Performance Middleware)**
- ✅ 请求响应时间监控
- ✅ 内存使用监控
- ✅ 慢请求自动告警（>1s）
- ✅ 性能指标自动记录

**性能 Headers**:
- `X-Response-Time` - 响应时间
- `Server-Timing` - 服务器计时信息

#### 4. **Metrics 指标收集器**
- ✅ Prometheus 格式指标导出
- ✅ HTTP 请求指标（QPS、响应时间、错误率）
- ✅ 系统指标（CPU、内存、事件循环延迟）
- ✅ 业务指标（缓存命中率、熔断器状态）

**指标接口**:
- `GET /metrics` - Prometheus 格式
- `GET /metrics/json` - JSON 格式

#### 5. **熔断器 (Circuit Breaker)**
- ✅ 自动熔断保护
- ✅ 半开状态自动恢复
- ✅ 熔断状态实时监控
- ✅ 熔断事件自动告警

**熔断器接口**:
- `GET /admin/circuit-breakers` - 查看熔断器状态
- `POST /admin/circuit-breakers/reset` - 重置熔断器

#### 6. **限流保护 (Rate Limiter)**
- ✅ 基于 IP 的限流
- ✅ 滑动窗口算法
- ✅ 限流信息响应头
- ✅ 超限自动拒绝（429 状态码）

**限流 Headers**:
- `X-RateLimit-Limit` - 限流上限
- `X-RateLimit-Remaining` - 剩余配额
- `X-RateLimit-Reset` - 重置时间

#### 7. **健康检查 (Health Check)**
- ✅ Liveness 探针（存活检查）
- ✅ Readiness 探针（就绪检查）
- ✅ 详细健康检查（依赖服务状态）

**健康检查接口**:
- `GET /health` - 存活检查
- `GET /health/ready` - 就绪检查
- `GET /health/detail` - 详细健康状态

#### 8. **告警系统 (Alert Manager)**
- ✅ 钉钉机器人告警
- ✅ 企业微信告警
- ✅ 告警频率限制（防止告警风暴）
- ✅ 多级别告警（CRITICAL, ERROR, WARN, INFO）

#### 9. **优雅关闭 (Graceful Shutdown)**
- ✅ 信号监听（SIGTERM, SIGINT）
- ✅ 停止接收新请求
- ✅ 等待现有请求完成
- ✅ 资源清理（关闭数据库连接、日志系统等）

#### 10. **安全防护 (Helmet)**
- ✅ HTTP 安全头设置
- ✅ XSS 防护
- ✅ 点击劫持防护
- ✅ MIME 类型嗅探防护

---

## 部署前准备

### 1. 环境要求

- **Node.js**: >= 18.x
- **Redis**: >= 6.x
- **Docker**: >= 20.x (可选)
- **Kubernetes**: >= 1.24 (可选)

### 2. 配置环境变量

复制 `.env.production` 文件并填写实际值：

```bash
cp .env.production .env
```

**必填配置项**:

```bash
# Redis 配置（必填）
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# 告警配置（推荐）
ALERT_ENABLED=true
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN

# 预检接口（必填）
PRECHECK_API_URL=https://your-api.com/precheck
```

### 3. 构建项目

```bash
# 安装依赖
npm ci --only=production

# 构建项目
npm run build
```

---

## Docker 部署

### 方式一：使用 Docker Compose（推荐用于开发/测试）

```bash
# 启动所有服务（包括 Redis、Prometheus、Grafana）
docker-compose up -d

# 查看日志
docker-compose logs -f ssr-app

# 停止服务
docker-compose down
```

**访问地址**:
- 应用服务: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

### 方式二：单独构建和运行

```bash
# 构建镜像
docker build -t ssr-item:latest .

# 运行容器
docker run -d \
  --name ssr-item \
  -p 3000:3000 \
  --env-file .env.production \
  -v $(pwd)/logs:/app/logs \
  ssr-item:latest

# 查看日志
docker logs -f ssr-item

# 停止容器
docker stop ssr-item
docker rm ssr-item
```

---

## Kubernetes 部署

### 1. 创建命名空间

```bash
kubectl apply -f k8s/namespace.yml
```

### 2. 配置 Secrets

编辑 `k8s/deployment.yml` 中的 Secret，填写实际密码：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ssr-item-secrets
  namespace: production
type: Opaque
stringData:
  redis.password: "your-actual-redis-password"
  dingtalk.webhook: "your-actual-webhook-url"
```

### 3. 部署 Redis

```bash
kubectl apply -f k8s/redis.yml
```

### 4. 部署应用

```bash
# 部署应用（包括 Deployment、Service、ConfigMap、Secret、HPA、PDB）
kubectl apply -f k8s/deployment.yml

# 部署 Ingress
kubectl apply -f k8s/ingress.yml
```

### 5. 验证部署

```bash
# 查看 Pod 状态
kubectl get pods -n production

# 查看服务状态
kubectl get svc -n production

# 查看 HPA 状态
kubectl get hpa -n production

# 查看日志
kubectl logs -f deployment/ssr-item-service -n production
```

### 6. 更新部署

```bash
# 更新镜像
kubectl set image deployment/ssr-item-service \
  ssr-item=your-registry.com/ssr-item:v1.1.0 \
  -n production

# 查看滚动更新状态
kubectl rollout status deployment/ssr-item-service -n production

# 回滚（如果需要）
kubectl rollout undo deployment/ssr-item-service -n production
```

---

## 监控告警配置

### 1. Prometheus 配置

Prometheus 会自动抓取 `/metrics` 接口的指标。

**关键指标**:

| 指标名称 | 类型 | 说明 |
|---------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数 |
| `http_request_duration_milliseconds` | Histogram | 请求响应时间 |
| `http_errors_total` | Counter | HTTP 错误总数 |
| `circuit_breaker_state` | Gauge | 熔断器状态 (0=关闭, 0.5=半开, 1=打开) |
| `nodejs_memory_heap_used_bytes` | Gauge | Node.js 堆内存使用 |
| `nodejs_cpu_user_microseconds` | Gauge | CPU 用户态时间 |

### 2. Grafana 仪表盘

访问 Grafana (http://localhost:3001)，导入预配置的仪表盘：

1. 登录 Grafana (admin/admin)
2. 添加 Prometheus 数据源
3. 创建仪表盘，添加以下面板：
   - QPS 趋势图
   - 响应时间 P95/P99
   - 错误率
   - 内存使用率
   - 熔断器状态

### 3. 告警规则

告警规则已配置在 `monitoring/alerts.yml`：

- **ServiceDown**: 服务不可用超过 1 分钟
- **HighErrorRate**: 错误率过高
- **SlowRequests**: P95 响应时间超过 1 秒
- **HighMemoryUsage**: 内存使用率超过 90%
- **CircuitBreakerOpen**: 熔断器触发

### 4. 钉钉/企业微信告警

配置 Webhook 后，系统会自动发送告警：

```bash
# 在 .env.production 中配置
ALERT_ENABLED=true
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN
WECHAT_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY
```

**告警级别**:
- 🔴 CRITICAL - 严重故障，需要立即处理
- ❌ ERROR - 错误，需要尽快处理
- ⚠️ WARN - 警告，需要关注
- ℹ️ INFO - 信息，仅通知

---

## 性能优化建议

### 1. 缓存策略

```javascript
// 已实现的多级缓存
L1 Cache (内存) → L2 Cache (Redis) → 源数据
```

**优化建议**:
- 热点商品预热缓存
- 设置合理的 TTL（建议 5-10 分钟）
- 监控缓存命中率（目标 >80%）

### 2. 限流配置

根据实际 QPS 调整限流参数：

```bash
# .env.production
RATE_LIMIT_MAX=100        # 每个 IP 每分钟最大请求数
RATE_LIMIT_WINDOW=60000   # 时间窗口（毫秒）
```

### 3. 资源配置

**K8s 资源建议**:

```yaml
resources:
  requests:
    memory: "256Mi"  # 最小内存
    cpu: "250m"      # 最小 CPU
  limits:
    memory: "512Mi"  # 最大内存
    cpu: "500m"      # 最大 CPU
```

**HPA 自动扩缩容**:
- 最小副本数: 3
- 最大副本数: 10
- CPU 阈值: 70%
- 内存阈值: 80%

### 4. 日志优化

生产环境建议：

```bash
LOG_LEVEL=info  # 不要使用 debug
```

定期清理日志：

```bash
# 保留最近 7 天的日志
find /app/logs -name "*.log" -mtime +7 -delete
```

---

## 故障排查

### 1. 服务无法启动

**检查步骤**:

```bash
# 1. 查看日志
kubectl logs deployment/ssr-item-service -n production

# 2. 检查配置
kubectl get configmap ssr-item-config -n production -o yaml

# 3. 检查 Secret
kubectl get secret ssr-item-secrets -n production

# 4. 检查 Redis 连接
kubectl exec -it deployment/ssr-item-service -n production -- \
  node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_HOST); redis.ping().then(console.log)"
```

### 2. 内存泄漏

**排查方法**:

```bash
# 1. 查看内存使用趋势
curl http://localhost:3000/metrics | grep nodejs_memory

# 2. 生成堆快照（需要进入容器）
kubectl exec -it pod/ssr-item-xxx -n production -- node --expose-gc -e "global.gc(); console.log(process.memoryUsage())"

# 3. 重启 Pod（临时解决）
kubectl rollout restart deployment/ssr-item-service -n production
```

### 3. 响应时间过长

**排查步骤**:

```bash
# 1. 查看慢请求日志
kubectl logs deployment/ssr-item-service -n production | grep "慢请求"

# 2. 检查缓存命中率
curl http://localhost:3000/admin/cache/stats

# 3. 查看性能指标
curl http://localhost:3000/metrics/json | jq '.histograms'
```

### 4. 熔断器频繁触发

**排查步骤**:

```bash
# 1. 查看熔断器状态
curl http://localhost:3000/admin/circuit-breakers

# 2. 检查下游服务健康状态
curl http://localhost:3000/health/detail

# 3. 手动重置熔断器
curl -X POST http://localhost:3000/admin/circuit-breakers/reset
```

---

## 运维操作

### 1. 缓存管理

```bash
# 查看缓存统计
curl http://localhost:3000/admin/cache/stats

# 使单个商品缓存失效
curl -X POST http://localhost:3000/admin/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"itemId": "123"}'

# 清空所有缓存
curl -X POST http://localhost:3000/admin/cache/clear

# 预热缓存
curl -X POST http://localhost:3000/admin/cache/warmup \
  -H "Content-Type: application/json" \
  -d '{"itemIds": ["123", "456", "789"]}'
```

### 2. 健康检查

```bash
# 存活检查
curl http://localhost:3000/health

# 就绪检查
curl http://localhost:3000/health/ready

# 详细健康状态
curl http://localhost:3000/health/detail
```

### 3. 监控指标

```bash
# Prometheus 格式
curl http://localhost:3000/metrics

# JSON 格式
curl http://localhost:3000/metrics/json | jq .
```

### 4. 日志查看

```bash
# Docker
docker logs -f ssr-item

# Kubernetes
kubectl logs -f deployment/ssr-item-service -n production

# 查看特定类型日志
kubectl logs deployment/ssr-item-service -n production | grep ERROR
```

### 5. 扩缩容

```bash
# 手动扩容
kubectl scale deployment/ssr-item-service --replicas=5 -n production

# 查看 HPA 状态
kubectl get hpa -n production

# 修改 HPA 配置
kubectl edit hpa ssr-item-hpa -n production
```

### 6. 配置更新

```bash
# 更新 ConfigMap
kubectl edit configmap ssr-item-config -n production

# 更新 Secret
kubectl edit secret ssr-item-secrets -n production

# 重启 Pod 使配置生效
kubectl rollout restart deployment/ssr-item-service -n production
```

---

## 安全检查清单

- [ ] 所有敏感信息使用 Secret 存储
- [ ] Redis 配置密码认证
- [ ] 启用 Helmet 安全头
- [ ] 配置限流保护
- [ ] 启用 HTTPS（Ingress TLS）
- [ ] 使用非 root 用户运行容器
- [ ] 定期更新依赖包
- [ ] 配置网络策略（NetworkPolicy）
- [ ] 启用 Pod Security Policy
- [ ] 配置 RBAC 权限控制

---

## 性能基准

**目标指标**:

| 指标 | 目标值 | 说明 |
|-----|-------|------|
| QPS | > 1000 | 每秒请求数 |
| P95 响应时间 | < 200ms | 95% 请求响应时间 |
| P99 响应时间 | < 500ms | 99% 请求响应时间 |
| 错误率 | < 0.1% | 错误请求占比 |
| 缓存命中率 | > 80% | 缓存命中比例 |
| 可用性 | > 99.9% | 服务可用时间 |

---

## 联系方式

如有问题，请联系：
- 技术支持: tech-support@example.com
- 紧急联系: on-call@example.com

---

## 附录

### A. 常用命令速查

```bash
# Docker
docker-compose up -d              # 启动服务
docker-compose logs -f ssr-app    # 查看日志
docker-compose down               # 停止服务

# Kubernetes
kubectl get pods -n production                    # 查看 Pod
kubectl logs -f deployment/ssr-item-service -n production  # 查看日志
kubectl exec -it pod/xxx -n production -- sh      # 进入容器
kubectl rollout restart deployment/ssr-item-service -n production  # 重启

# 监控
curl http://localhost:3000/health                 # 健康检查
curl http://localhost:3000/metrics                # 指标
curl http://localhost:3000/admin/cache/stats      # 缓存统计
```

### B. 环境变量完整列表

参考 [.env.production](.env.production) 文件。

### C. API 接口文档

| 接口 | 方法 | 说明 |
|-----|------|------|
| `/health` | GET | 存活检查 |
| `/health/ready` | GET | 就绪检查 |
| `/health/detail` | GET | 详细健康状态 |
| `/metrics` | GET | Prometheus 指标 |
| `/metrics/json` | GET | JSON 格式指标 |
| `/admin/cache/stats` | GET | 缓存统计 |
| `/admin/cache/invalidate` | POST | 缓存失效 |
| `/admin/cache/clear` | POST | 清空缓存 |
| `/admin/cache/warmup` | POST | 预热缓存 |
| `/admin/circuit-breakers` | GET | 熔断器状态 |
| `/admin/circuit-breakers/reset` | POST | 重置熔断器 |

---

**最后更新**: 2025-12-08
**版本**: v1.0.0
