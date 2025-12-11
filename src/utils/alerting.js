const axios = require('axios');
const { logger } = require('./logger');

/**
 * 告警管理器
 * 支持钉钉、企业微信等多种告警渠道
 */
class AlertManager {
  constructor() {
    this.enabled = process.env.ALERT_ENABLED === 'true';
    this.dingTalkWebhook = process.env.DINGTALK_WEBHOOK;
    this.weChatWebhook = process.env.WECHAT_WEBHOOK;

    // 告警频率限制（防止告警风暴）
    this.alertCache = new Map();
    this.alertCooldown = 5 * 60 * 1000; // 5 分钟内相同告警只发送一次
  }

  /**
   * 发送告警
   */
  async sendAlert(level, title, message, metadata = {}) {
    if (!this.enabled) {
      logger.debug('告警已禁用', { level, title });
      return;
    }

    // 检查告警频率限制
    const alertKey = `${level}:${title}`;
    const lastAlertTime = this.alertCache.get(alertKey);
    const now = Date.now();

    if (lastAlertTime && (now - lastAlertTime) < this.alertCooldown) {
      logger.debug('告警被限流', { alertKey, cooldown: this.alertCooldown });
      return;
    }

    this.alertCache.set(alertKey, now);

    // 发送到各个渠道
    const promises = [];

    if (this.dingTalkWebhook) {
      promises.push(this.sendDingTalk(level, title, message, metadata));
    }

    if (this.weChatWebhook) {
      promises.push(this.sendWeChat(level, title, message, metadata));
    }

    try {
      await Promise.allSettled(promises);
      logger.info('告警已发送', { level, title });
    } catch (error) {
      logger.error('告警发送失败', {
        error: error.message,
        level,
        title
      });
    }
  }

  /**
   * 发送钉钉告警
   */
  async sendDingTalk(level, title, message, metadata) {
    const emoji = this.getLevelEmoji(level);
    const color = this.getLevelColor(level);

    const text = `${emoji} **${level}: ${title}**\n\n` +
      `**消息**: ${message}\n\n` +
      `**时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n` +
      `**环境**: ${process.env.NODE_ENV || 'development'}\n\n` +
      `**详情**:\n${JSON.stringify(metadata, null, 2)}`;

    try {
      await axios.post(this.dingTalkWebhook, {
        msgtype: 'markdown',
        markdown: {
          title: `${emoji} ${title}`,
          text
        }
      }, {
        timeout: 5000
      });
    } catch (error) {
      logger.error('钉钉告警发送失败', { error: error.message });
    }
  }

  /**
   * 发送企业微信告警
   */
  async sendWeChat(level, title, message, metadata) {
    const emoji = this.getLevelEmoji(level);

    const text = `${emoji} ${level}: ${title}\n` +
      `消息: ${message}\n` +
      `时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
      `环境: ${process.env.NODE_ENV || 'development'}\n` +
      `详情: ${JSON.stringify(metadata)}`;

    try {
      await axios.post(this.weChatWebhook, {
        msgtype: 'text',
        text: { content: text }
      }, {
        timeout: 5000
      });
    } catch (error) {
      logger.error('企业微信告警发送失败', { error: error.message });
    }
  }

  /**
   * 获取告警级别对应的 emoji
   */
  getLevelEmoji(level) {
    const emojiMap = {
      'CRITICAL': '🔴',
      'ERROR': '❌',
      'WARN': '⚠️',
      'INFO': 'ℹ️'
    };
    return emojiMap[level] || '📢';
  }

  /**
   * 获取告警级别对应的颜色
   */
  getLevelColor(level) {
    const colorMap = {
      'CRITICAL': '#FF0000',
      'ERROR': '#FF4D4F',
      'WARN': '#FAAD14',
      'INFO': '#1890FF'
    };
    return colorMap[level] || '#000000';
  }

  /**
   * 快捷方法
   */
  critical(title, message, metadata) {
    return this.sendAlert('CRITICAL', title, message, metadata);
  }

  error(title, message, metadata) {
    return this.sendAlert('ERROR', title, message, metadata);
  }

  warn(title, message, metadata) {
    return this.sendAlert('WARN', title, message, metadata);
  }

  info(title, message, metadata) {
    return this.sendAlert('INFO', title, message, metadata);
  }
}

module.exports = new AlertManager();
