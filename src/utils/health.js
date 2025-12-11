/**
 * 健康检查工具
 * 用于检查服务和依赖的健康状态
 */
class HealthChecker {
  constructor() {
    this.checks = new Map();
  }

  /**
   * 注册健康检查
   */
  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * 执行所有健康检查
   */
  async checkAll() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {}
    };

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);

        results.checks[name] = {
          status: 'healthy',
          ...result
        };
      } catch (error) {
        results.status = 'unhealthy';
        results.checks[name] = {
          status: 'unhealthy',
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * 快速健康检查（只检查服务是否存活）
   */
  async checkLiveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  /**
   * 就绪检查（检查服务是否准备好接收流量）
   */
  async checkReadiness() {
    const results = await this.checkAll();
    return {
      ready: results.status === 'healthy',
      ...results
    };
  }
}

// 创建全局健康检查器
const healthChecker = new HealthChecker();

// 注册基础健康检查
healthChecker.register('memory', () => {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
    heapUsedPercent: Math.round(heapUsedPercent) + '%',
    healthy: heapUsedPercent < 90
  };
});

healthChecker.register('cpu', () => {
  const cpuUsage = process.cpuUsage();
  return {
    user: cpuUsage.user,
    system: cpuUsage.system,
    healthy: true
  };
});

module.exports = healthChecker;
