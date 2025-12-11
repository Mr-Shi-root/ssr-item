const { logger } = require('./logger');

/**
 * 优雅关闭管理器
 * 确保服务关闭时正确清理资源
 */
class GracefulShutdown {
  constructor(server) {
    this.server = server;
    this.isShuttingDown = false;
    this.cleanupHandlers = [];
  }

  /**
   * 注册清理函数
   */
  onShutdown(handler) {
    this.cleanupHandlers.push(handler);
  }

  /**
   * 执行优雅关闭
   */
  async shutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('已在关闭中，忽略重复信号', { signal });
      return;
    }

    this.isShuttingDown = true;
    logger.info('收到关闭信号，开始优雅关闭', { signal });

    // 1. 停止接收新请求
    this.server.close(() => {
      logger.info('HTTP 服务器已关闭');
    });

    // 2. 等待现有请求完成（最多 30 秒）
    const timeout = setTimeout(() => {
      logger.warn('等待超时，强制关闭');
      process.exit(1);
    }, 30000);

    try {
      // 3. 执行所有清理函数
      logger.info('执行清理函数', { count: this.cleanupHandlers.length });

      for (const handler of this.cleanupHandlers) {
        try {
          await handler();
        } catch (error) {
          logger.error('清理函数执行失败', {
            error: error.message,
            stack: error.stack
          });
        }
      }

      clearTimeout(timeout);
      logger.info('优雅关闭完成');
      process.exit(0);
    } catch (error) {
      logger.error('优雅关闭失败', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * 注册信号监听
   */
  listen() {
    // SIGTERM: Docker/K8s 发送的终止信号
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    // SIGINT: Ctrl+C
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack
      });
      this.shutdown('uncaughtException');
    });

    // 未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的 Promise 拒绝', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
      });
    });

    logger.info('优雅关闭监听已启动');
  }
}

module.exports = GracefulShutdown;
