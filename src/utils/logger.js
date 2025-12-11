const log4js = require('log4js');
const path = require('path');

// 日志配置
log4js.configure({
  appenders: {
    // 控制台输出
    console: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c]%] %m'
      }
    },

    // 所有日志文件
    allFile: {
      type: 'dateFile',
      filename: path.join(__dirname, '../../logs/all'),
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true,
      maxLogSize: 10 * 1024 * 1024,  // 10MB
      backups: 7,  // 保留 7 天
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c] %m'
      }
    },

    // 错误日志文件
    errorFile: {
      type: 'dateFile',
      filename: path.join(__dirname, '../../logs/error'),
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true,
      maxLogSize: 10 * 1024 * 1024,
      backups: 30,  // 错误日志保留 30 天
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] [%c] %m'
      }
    },

    // 性能日志文件（JSON 格式，方便解析）
    performanceFile: {
      type: 'dateFile',
      filename: path.join(__dirname, '../../logs/performance'),
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true,
      layout: { type: 'json' }
    },

    // 业务日志文件（JSON 格式）
    businessFile: {
      type: 'dateFile',
      filename: path.join(__dirname, '../../logs/business'),
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true,
      layout: { type: 'json' }
    },

    // 访问日志文件（JSON 格式）
    accessFile: {
      type: 'dateFile',
      filename: path.join(__dirname, '../../logs/access'),
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true,
      layout: { type: 'json' }
    },

    // 只记录错误
    errorFilter: {
      type: 'logLevelFilter',
      appender: 'errorFile',
      level: 'error'
    }
  },

  categories: {
    // 默认日志
    default: {
      appenders: ['console', 'allFile', 'errorFilter'],
      level: process.env.LOG_LEVEL || 'info'
    },

    // 性能日志
    performance: {
      appenders: ['console', 'performanceFile'],
      level: 'info'
    },

    // 业务日志
    business: {
      appenders: ['console', 'businessFile'],
      level: 'info'
    },

    // 访问日志
    access: {
      appenders: ['accessFile'],
      level: 'info'
    }
  }
});

// 导出不同类型的 logger
const logger = log4js.getLogger('default');
const performanceLogger = log4js.getLogger('performance');
const businessLogger = log4js.getLogger('business');
const accessLogger = log4js.getLogger('access');

/**
 * 结构化日志包装器
 */
class StructuredLogger {
  constructor(baseLogger, category) {
    this.baseLogger = baseLogger;
    this.category = category;
  }

  formatMessage(message, metadata = {}) {
    return JSON.stringify({
      message,
      ...metadata,
      timestamp: new Date().toISOString(),
      category: this.category
    });
  }

  info(message, metadata) {
    this.baseLogger.info(this.formatMessage(message, metadata));
  }

  warn(message, metadata) {
    this.baseLogger.warn(this.formatMessage(message, metadata));
  }

  error(message, metadata) {
    this.baseLogger.error(this.formatMessage(message, metadata));
  }

  debug(message, metadata) {
    this.baseLogger.debug(this.formatMessage(message, metadata));
  }
}

// 导出结构化 logger
module.exports = {
  logger,
  performanceLogger: new StructuredLogger(performanceLogger, 'performance'),
  businessLogger: new StructuredLogger(businessLogger, 'business'),
  accessLogger: new StructuredLogger(accessLogger, 'access'),
  log4js
};
