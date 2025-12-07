/**
 * SSR 性能对比测试脚本
 *
 * 用法：
 * node scripts/performance-test.js
 */

const { performance } = require('perf_hooks');

// 模拟不同的渲染方案
async function testRenderToString() {
  const start = performance.now();

  // 模拟渲染大量数据
  const data = {
    title: '商品标题',
    price: 199.99,
    reviews: Array(500).fill({ user: '用户', rating: 5, comment: '很好' }),
    recommendations: Array(20).fill({ title: '推荐商品', price: 99 })
  };

  // 模拟 renderToString 的同步阻塞
  let html = '<div>';
  html += `<h1>${data.title}</h1>`;
  html += `<p>${data.price}</p>`;

  // 渲染所有评论（性能瓶颈）
  for (const review of data.reviews) {
    html += `<div>${review.user}: ${review.comment}</div>`;
  }

  // 渲染所有推荐
  for (const item of data.recommendations) {
    html += `<div>${item.title}: ${item.price}</div>`;
  }

  html += '</div>';

  const end = performance.now();
  return {
    method: 'renderToString (原始)',
    time: (end - start).toFixed(2),
    htmlSize: Buffer.byteLength(html),
    ttfb: (end - start).toFixed(2) // 同步渲染，TTFB = 渲染时间
  };
}

async function testOptimizedSSR() {
  const start = performance.now();

  // 只渲染首屏必需数据
  const essentialData = {
    title: '商品标题',
    price: 199.99,
    reviewCount: 500,
    avgRating: 4.8
  };

  let html = '<div>';
  html += `<h1>${essentialData.title}</h1>`;
  html += `<p>${essentialData.price}</p>`;
  html += `<div>评论数: ${essentialData.reviewCount}</div>`;

  // 评论和推荐使用占位符
  html += '<div data-lazy-load="reviews">评论加载中...</div>';
  html += '<div data-lazy-load="recommendations">推荐加载中...</div>';

  html += '</div>';

  const end = performance.now();
  return {
    method: '渐进式 SSR (优化)',
    time: (end - start).toFixed(2),
    htmlSize: Buffer.byteLength(html),
    ttfb: (end - start).toFixed(2)
  };
}

async function testStreamingSSR() {
  const start = performance.now();

  // 模拟流式渲染：立即发送 shell
  const shellTime = performance.now();
  const ttfb = (shellTime - start).toFixed(2);

  // 模拟后续内容渲染
  await new Promise(resolve => setTimeout(resolve, 50));

  const end = performance.now();
  return {
    method: '流式渲染 (React 18)',
    time: (end - start).toFixed(2),
    htmlSize: 5000, // 估算
    ttfb: ttfb // 流式渲染的 TTFB 很低
  };
}

async function testCachedSSR() {
  const start = performance.now();

  // 模拟从 Redis 读取缓存（1-2ms）
  await new Promise(resolve => setTimeout(resolve, 1));

  const end = performance.now();
  return {
    method: '缓存命中 (Redis)',
    time: (end - start).toFixed(2),
    htmlSize: 15000,
    ttfb: (end - start).toFixed(2)
  };
}

// 运行测试
async function runTests() {
  console.log('🚀 开始 SSR 性能对比测试...\n');
  console.log('测试场景：商品详情页（500 条评论 + 20 个推荐商品）\n');

  const results = [];

  // 测试每种方案 10 次，取平均值
  const iterations = 10;

  console.log('⏳ 测试中...\n');

  for (let i = 0; i < iterations; i++) {
    results.push(await testRenderToString());
    results.push(await testOptimizedSSR());
    results.push(await testStreamingSSR());
    results.push(await testCachedSSR());
  }

  // 计算平均值
  const summary = {};
  results.forEach(result => {
    if (!summary[result.method]) {
      summary[result.method] = {
        method: result.method,
        times: [],
        ttfbs: [],
        htmlSize: result.htmlSize
      };
    }
    summary[result.method].times.push(parseFloat(result.time));
    summary[result.method].ttfbs.push(parseFloat(result.ttfb));
  });

  // 输出结果
  console.log('📊 测试结果（平均值）：\n');
  console.log('┌─────────────────────────┬──────────┬──────────┬───────────┐');
  console.log('│ 渲染方案                │ 渲染耗时 │ TTFB     │ HTML 大小 │');
  console.log('├─────────────────────────┼──────────┼──────────┼───────────┤');

  Object.values(summary).forEach(item => {
    const avgTime = (item.times.reduce((a, b) => a + b) / item.times.length).toFixed(2);
    const avgTtfb = (item.ttfbs.reduce((a, b) => a + b) / item.ttfbs.length).toFixed(2);
    const htmlSize = (item.htmlSize / 1024).toFixed(1);

    console.log(
      `│ ${item.method.padEnd(23)} │ ${avgTime.padStart(6)}ms │ ${avgTtfb.padStart(6)}ms │ ${htmlSize.padStart(7)}KB │`
    );
  });

  console.log('└─────────────────────────┴──────────┴──────────┴───────────┘\n');

  // 计算性能提升
  const baseline = summary['renderToString (原始)'];
  const optimized = summary['渐进式 SSR (优化)'];
  const cached = summary['缓存命中 (Redis)'];

  const baselineAvg = baseline.times.reduce((a, b) => a + b) / baseline.times.length;
  const optimizedAvg = optimized.times.reduce((a, b) => a + b) / optimized.times.length;
  const cachedAvg = cached.times.reduce((a, b) => a + b) / cached.times.length;

  console.log('📈 性能提升：\n');
  console.log(`渐进式 SSR vs 原始方案：${((1 - optimizedAvg / baselineAvg) * 100).toFixed(1)}% 提升`);
  console.log(`缓存命中 vs 原始方案：  ${((1 - cachedAvg / baselineAvg) * 100).toFixed(1)}% 提升`);
  console.log(`缓存命中 vs 渐进式 SSR：${((1 - cachedAvg / optimizedAvg) * 100).toFixed(1)}% 提升\n`);

  console.log('💡 建议：\n');
  console.log('1. 对于普通商品，使用「渐进式 SSR + Redis 缓存」');
  console.log('2. 对于秒杀商品，使用「流式渲染」（实时性优先）');
  console.log('3. 对于高流量商品，确保缓存命中率 > 95%');
  console.log('4. 监控 TTFB，目标 < 200ms\n');
}

// 执行测试
runTests().catch(console.error);
