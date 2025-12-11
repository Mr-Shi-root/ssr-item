/**
 * Metrics 指标收集器
 * 用于收集和暴露系统运行指标，支持 Prometheus 格式
 */
class MetricsCollector {
  constructor() {
    // 计数器（Counter）- 只增不减
    this.counters = new Map();

    // 计量器（Gauge）- 可增可减
    this.gauges = new Map();

    // 直方图（Histogram）- 记录分布
    this.histograms = new Map();

    // 摘要（Summary）- 记录百分位数
    this.summaries = new Map();

    // 启动时间
    this.startTime = Date.now();
  }

  /**
   * 增加计数器
   */
  incrementCounter(name, labels = {}, value = 1) {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || { name, labels, value: 0 };
    current.value += value;
    this.counters.set(key, current);
  }

  /**
   * 设置计量器
   */
  setGauge(name, labels = {}, value) {
    const key = this.getKey(name, labels);
    this.gauges.set(key, { name, labels, value });
  }

  /**
   * 增加计量器
   */
  incrementGauge(name, labels = {}, value = 1) {
    const key = this.getKey(name, labels);
    const current = this.gauges.get(key) || { name, labels, value: 0 };
    current.value += value;
    this.gauges.set(key, current);
  }

  /**
   * 减少计量器
   */
  decrementGauge(name, labels = {}, value = 1) {
    this.incrementGauge(name, labels, -value);
  }

  /**
   * 记录直方图数据
   */
  observeHistogram(name, labels = {}, value) {
    const key = this.getKey(name, labels);
    const histogram = this.histograms.get(key) || {
      name,
      labels,
      values: [],
      sum: 0,
      count: 0
    };

    histogram.values.push(value);
    histogram.sum += value;
    histogram.count++;

    // 保持最近 1000 个数据点
    if (histogram.values.length > 1000) {
      histogram.values.shift();
    }

    this.histograms.set(key, histogram);
  }

  /**
   * 记录摘要数据
   */
  observeSummary(name, labels = {}, value) {
    const key = this.getKey(name, labels);
    const summary = this.summaries.get(key) || {
      name,
      labels,
      values: [],
      sum: 0,
      count: 0
    };

    summary.values.push(value);
    summary.sum += value;
    summary.count++;

    // 保持最近 1000 个数据点
    if (summary.values.length > 1000) {
      summary.values.shift();
    }

    this.summaries.set(key, summary);
  }

  /**
   * 生成唯一 key
   */
  getKey(name, labels) {
    const labelStr = Object.keys(labels)
      .sort()
      .map(k => `${k}="${labels[k]}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * 计算百分位数
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 获取所有指标（JSON 格式）
   */
  getMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      counters: {},
      gauges: {},
      histograms: {},
      summaries: {}
    };

    // 计数器
    for (const [key, counter] of this.counters) {
      metrics.counters[key] = counter.value;
    }

    // 计量器
    for (const [key, gauge] of this.gauges) {
      metrics.gauges[key] = gauge.value;
    }

    // 直方图
    for (const [key, histogram] of this.histograms) {
      metrics.histograms[key] = {
        count: histogram.count,
        sum: histogram.sum,
        avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
        min: Math.min(...histogram.values),
        max: Math.max(...histogram.values),
        p50: this.calculatePercentile(histogram.values, 50),
        p95: this.calculatePercentile(histogram.values, 95),
        p99: this.calculatePercentile(histogram.values, 99)
      };
    }

    // 摘要
    for (const [key, summary] of this.summaries) {
      metrics.summaries[key] = {
        count: summary.count,
        sum: summary.sum,
        avg: summary.count > 0 ? summary.sum / summary.count : 0,
        p50: this.calculatePercentile(summary.values, 50),
        p95: this.calculatePercentile(summary.values, 95),
        p99: this.calculatePercentile(summary.values, 99)
      };
    }

    return metrics;
  }

  /**
   * 导出 Prometheus 格式
   */
  exportPrometheus() {
    const lines = [];

    // 计数器
    for (const [key, counter] of this.counters) {
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${key} ${counter.value}`);
    }

    // 计量器
    for (const [key, gauge] of this.gauges) {
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${key} ${gauge.value}`);
    }

    // 直方图
    for (const [key, histogram] of this.histograms) {
      lines.push(`# TYPE ${histogram.name} histogram`);
      const baseKey = key.replace(/\{.*\}/, '');
      const labels = key.match(/\{(.*)\}/)?.[1] || '';
      const labelPrefix = labels ? `{${labels}}` : '';

      lines.push(`${baseKey}_count${labelPrefix} ${histogram.count}`);
      lines.push(`${baseKey}_sum${labelPrefix} ${histogram.sum}`);

      // 添加百分位数
      const p50 = this.calculatePercentile(histogram.values, 50);
      const p95 = this.calculatePercentile(histogram.values, 95);
      const p99 = this.calculatePercentile(histogram.values, 99);

      lines.push(`${baseKey}_bucket${labelPrefix.replace('}', ',le="0.5"}')} ${p50}`);
      lines.push(`${baseKey}_bucket${labelPrefix.replace('}', ',le="0.95"}')} ${p95}`);
      lines.push(`${baseKey}_bucket${labelPrefix.replace('}', ',le="0.99"}')} ${p99}`);
      lines.push(`${baseKey}_bucket${labelPrefix.replace('}', ',le="+Inf"}')} ${histogram.count}`);
    }

    // 摘要
    for (const [key, summary] of this.summaries) {
      lines.push(`# TYPE ${summary.name} summary`);
      const baseKey = key.replace(/\{.*\}/, '');
      const labels = key.match(/\{(.*)\}/)?.[1] || '';
      const labelPrefix = labels ? `{${labels}}` : '';

      lines.push(`${baseKey}_count${labelPrefix} ${summary.count}`);
      lines.push(`${baseKey}_sum${labelPrefix} ${summary.sum}`);

      const p50 = this.calculatePercentile(summary.values, 50);
      const p95 = this.calculatePercentile(summary.values, 95);
      const p99 = this.calculatePercentile(summary.values, 99);

      lines.push(`${baseKey}${labelPrefix.replace('}', ',quantile="0.5"}')} ${p50}`);
      lines.push(`${baseKey}${labelPrefix.replace('}', ',quantile="0.95"}')} ${p95}`);
      lines.push(`${baseKey}${labelPrefix.replace('}', ',quantile="0.99"}')} ${p99}`);
    }

    // 添加进程指标
    const memUsage = process.memoryUsage();
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes{type="used"} ${memUsage.heapUsed}`);
    lines.push(`process_heap_bytes{type="total"} ${memUsage.heapTotal}`);
    lines.push('# TYPE process_rss_bytes gauge');
    lines.push(`process_rss_bytes ${memUsage.rss}`);
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`);

    return lines.join('\n') + '\n';
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }

  /**
   * 收集系统指标
   */
  collectSystemMetrics() {
    // 内存使用
    const memUsage = process.memoryUsage();
    this.setGauge('nodejs_memory_heap_used_bytes', {}, memUsage.heapUsed);
    this.setGauge('nodejs_memory_heap_total_bytes', {}, memUsage.heapTotal);
    this.setGauge('nodejs_memory_rss_bytes', {}, memUsage.rss);
    this.setGauge('nodejs_memory_external_bytes', {}, memUsage.external);

    // CPU 使用
    const cpuUsage = process.cpuUsage();
    this.setGauge('nodejs_cpu_user_microseconds', {}, cpuUsage.user);
    this.setGauge('nodejs_cpu_system_microseconds', {}, cpuUsage.system);

    // 运行时间
    this.setGauge('nodejs_uptime_seconds', {}, process.uptime());

    // 事件循环延迟（简单实现）
    const start = Date.now();
    setImmediate(() => {
      const delay = Date.now() - start;
      this.observeHistogram('nodejs_eventloop_lag_milliseconds', {}, delay);
    });
  }
}

// 创建全局指标收集器
const metricsCollector = new MetricsCollector();

// 每 10 秒收集一次系统指标
setInterval(() => {
  metricsCollector.collectSystemMetrics();
}, 10000);

// 立即收集一次
metricsCollector.collectSystemMetrics();

module.exports = metricsCollector;
