require('dotenv').config();
const { logger } = require('./logger');

/**
 * 配置管理和验证
 */
class Config {
  constructor() {
    this.config = {
      // 服务配置
      nodeEnv: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT) || 3000,

      // 日志配置
      logLevel: process.env.LOG_LEVEL || 'info',

      // Redis 配置
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB) || 0
      },

      // SSR 缓存配置
      ssrCache: {
        enabled: process.env.ENABLE_SSR_CACHE !== 'false'
      },

      // 告警配置
      alert: {
        enabled: process.env.ALERT_ENABLED === 'true',
        dingTalkWebhook: process.env.DINGTALK_WEBHOOK,
        weChatWebhook: process.env.WECHAT_WEBHOOK
      },

      // 限流配置
      rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        window: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000
      },

      // 安全配置
      security: {
        helmetEnabled: process.env.HELMET_ENABLED !== 'false'
      },

      // 预检接口配置
      precheck: {
        apiUrl: process.env.PRECHECK_API_URL,
        timeout: parseInt(process.env.PRECHECK_API_TIMEOUT) || 3000
      },

      // 监控配置
      apm: {
        enabled: process.env.APM_ENABLED === 'true',
        serviceName: process.env.APM_SERVICE_NAME || 'ssr-item-service'
      }
    };
  }

  /**
   * 验证配置
   */
  validate() {
    const errors = [];

    // 生产环境必须配置的项
    if (this.config.nodeEnv === 'production') {
      if (!this.config.redis.host) {
        errors.push('生产环境必须配置 REDIS_HOST');
      }

      if (this.config.alert.enabled) {
        if (!this.config.alert.dingTalkWebhook && !this.config.alert.weChatWebhook) {
          errors.push('告警已启用但未配置任何 Webhook');
        }
      }
    }

    // 端口范围验证
    if (this.config.port < 1 || this.config.port > 65535) {
      errors.push(`无效的端口号: ${this.config.port}`);
    }

    if (errors.length > 0) {
      logger.error('配置验证失败', { errors });
      throw new Error(`配置验证失败:\n${errors.join('\n')}`);
    }

    logger.info('配置验证通过', {
      nodeEnv: this.config.nodeEnv,
      port: this.config.port,
      redisHost: this.config.redis.host,
      ssrCacheEnabled: this.config.ssrCache.enabled,
      alertEnabled: this.config.alert.enabled
    });
  }

  /**
   * 获取配置
   */
  get(key) {
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        return undefined;
      }
    }

    return value;
  }

  /**
   * 是否为生产环境
   */
  isProduction() {
    return this.config.nodeEnv === 'production';
  }

  /**
   * 是否为开发环境
   */
  isDevelopment() {
    return this.config.nodeEnv === 'development';
  }
}

// 创建全局配置实例
const config = new Config();

// 启动时验证配置
try {
  config.validate();
} catch (error) {
  console.error('配置验证失败，服务无法启动:', error.message);
  process.exit(1);
}

module.exports = config;
