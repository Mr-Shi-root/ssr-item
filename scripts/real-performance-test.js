/**
 * 真实 SSR 性能对比测试
 * 使用实际的 React 渲染进行测试
 */

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { performance } = require('perf_hooks');

// 模拟复杂的商品详情页组件
const ComplexItemPage = ({ itemData, renderMode = 'full' }) => {
  return React.createElement('div', { className: 'item-page' },
    // 头部
    React.createElement('header', null,
      React.createElement('h1', null, itemData.title),
      React.createElement('div', { className: 'price' }, `¥${itemData.price}`)
    ),

    // 商品图片
    React.createElement('div', { className: 'images' },
      itemData.images.map((img, i) =>
        React.createElement('img', { key: i, src: img, alt: itemData.title })
      )
    ),

    // 商品描述
    React.createElement('div', { className: 'description' }, itemData.description),

    // 评论区（性能瓶颈）
    renderMode === 'full' && itemData.reviews
      ? React.createElement('div', { className: 'reviews' },
          React.createElement('h2', null, '用户评价'),
          itemData.reviews.map((review, i) =>
            React.createElement('div', { key: i, className: 'review-item' },
              React.createElement('div', { className: 'user' }, review.user),
              React.createElement('div', { className: 'rating' }, '⭐'.repeat(review.rating)),
              React.createElement('div', { className: 'comment' }, review.comment)
            )
          )
        )
      : React.createElement('div', { 'data-lazy-load': 'reviews' }, '评论加载中...'),

    // 推荐商品（性能瓶颈）
    renderMode === 'full' && itemData.recommendations
      ? React.createElement('div', { className: 'recommendations' },
          React.createElement('h2', null, '推荐商品'),
          itemData.recommendations.map((item, i) =>
            React.createElement('div', { key: i, className: 'rec-item' },
              React.createElement('img', { src: item.image, alt: item.title }),
              React.createElement('h3', null, item.title),
              React.createElement('p', null, `¥${item.price}`)
            )
          )
        )
      : React.createElement('div', { 'data-lazy-load': 'recommendations' }, '推荐加载中...')
  );
};

// 生成测试数据
function generateTestData(reviewCount = 500, recCount = 20) {
  return {
    title: '高性能电商商品详情页测试',
    price: 199.99,
    description: '这是一个非常详细的商品描述，包含了大量的文字内容。'.repeat(20),
    images: Array(10).fill('/images/item.jpg').map((img, i) => `${img}?v=${i}`),
    reviews: Array(reviewCount).fill(null).map((_, i) => ({
      user: `用户${i + 1}`,
      rating: Math.floor(Math.random() * 2) + 4,
      comment: `这是第 ${i + 1} 条评论，商品质量很好，物流也很快，非常满意！`.repeat(2)
    })),
    recommendations: Array(recCount).fill(null).map((_, i) => ({
      title: `推荐商品 ${i + 1}`,
      price: 99.99 + i,
      image: `/images/rec${i}.jpg`
    }))
  };
}

// 测试 1: 原始 renderToString（渲染所有内容）
async function testOriginalRenderToString(data) {
  const start = performance.now();

  const html = ReactDOMServer.renderToString(
    React.createElement(ComplexItemPage, { itemData: data, renderMode: 'full' })
  );

  const end = performance.now();
  const time = end - start;

  return {
    method: 'renderToString (原始)',
    time: time.toFixed(2),
    htmlSize: Buffer.byteLength(html),
    ttfb: time.toFixed(2),
    memoryUsed: process.memoryUsage().heapUsed / 1024 / 1024
  };
}

// 测试 2: 优化后的 renderToString（只渲染首屏）
async function testOptimizedRenderToString(data) {
  const start = performance.now();

  // 只传递首屏必需数据
  const essentialData = {
    title: data.title,
    price: data.price,
    description: data.description.substring(0, 200),
    images: data.images.slice(0, 5),
    reviews: null, // 不渲染评论
    recommendations: null // 不渲染推荐
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(ComplexItemPage, { itemData: essentialData, renderMode: 'lazy' })
  );

  const end = performance.now();
  const time = end - start;

  return {
    method: '渐进式 SSR (优化)',
    time: time.toFixed(2),
    htmlSize: Buffer.byteLength(html),
    ttfb: time.toFixed(2),
    memoryUsed: process.memoryUsage().heapUsed / 1024 / 1024
  };
}

// 测试 3: 模拟缓存命中
async function testCachedResponse() {
  const start = performance.now();

  // 模拟从 Redis 读取（1-2ms）
  await new Promise(resolve => setTimeout(resolve, 1));

  const cachedHtml = '<div>cached html content</div>'.repeat(100);

  const end = performance.now();
  const time = end - start;

  return {
    method: '缓存命中 (Redis)',
    time: time.toFixed(2),
    htmlSize: Buffer.byteLength(cachedHtml),
    ttfb: time.toFixed(2),
    memoryUsed: process.memoryUsage().heapUsed / 1024 / 1024
  };
}

// 运行完整测试
async function runFullTest() {
  console.log('🚀 真实 SSR 性能对比测试\n');
  console.log('使用真实的 React renderToString 进行测试\n');

  // 测试不同数据量级
  const testCases = [
    { reviews: 100, recs: 10, label: '小型页面 (100 评论)' },
    { reviews: 500, recs: 20, label: '中型页面 (500 评论)' },
    { reviews: 1000, recs: 50, label: '大型页面 (1000 评论)' }
  ];

  for (const testCase of testCases) {
    console.log(`\n📊 测试场景: ${testCase.label}\n`);

    const data = generateTestData(testCase.reviews, testCase.recs);
    const iterations = 5;
    const results = [];

    // 预热
    await testOriginalRenderToString(data);
    await testOptimizedRenderToString(data);

    // 正式测试
    for (let i = 0; i < iterations; i++) {
      // 清理内存
      if (global.gc) global.gc();

      results.push(await testOriginalRenderToString(data));
      results.push(await testOptimizedRenderToString(data));
      results.push(await testCachedResponse());
    }

    // 计算平均值
    const summary = {};
    results.forEach(result => {
      if (!summary[result.method]) {
        summary[result.method] = {
          method: result.method,
          times: [],
          sizes: [],
          memory: []
        };
      }
      summary[result.method].times.push(parseFloat(result.time));
      summary[result.method].sizes.push(result.htmlSize);
      summary[result.method].memory.push(result.memoryUsed);
    });

    // 输出结果
    console.log('┌─────────────────────────┬──────────┬───────────┬──────────┐');
    console.log('│ 渲染方案                │ 渲染耗时 │ HTML 大小 │ 内存占用 │');
    console.log('├─────────────────────────┼──────────┼───────────┼──────────┤');

    Object.values(summary).forEach(item => {
      const avgTime = (item.times.reduce((a, b) => a + b) / item.times.length).toFixed(2);
      const avgSize = (item.sizes.reduce((a, b) => a + b) / item.sizes.length / 1024).toFixed(1);
      const avgMemory = (item.memory.reduce((a, b) => a + b) / item.memory.length).toFixed(1);

      console.log(
        `│ ${item.method.padEnd(23)} │ ${avgTime.padStart(6)}ms │ ${avgSize.padStart(7)}KB │ ${avgMemory.padStart(6)}MB │`
      );
    });

    console.log('└─────────────────────────┴──────────┴───────────┴──────────┘');

    // 性能提升计算
    const baseline = summary['renderToString (原始)'];
    const optimized = summary['渐进式 SSR (优化)'];

    const baselineAvg = baseline.times.reduce((a, b) => a + b) / baseline.times.length;
    const optimizedAvg = optimized.times.reduce((a, b) => a + b) / optimized.times.length;

    const improvement = ((1 - optimizedAvg / baselineAvg) * 100).toFixed(1);
    const sizeReduction = ((1 - optimized.sizes[0] / baseline.sizes[0]) * 100).toFixed(1);

    console.log(`\n⚡ 性能提升: ${improvement}%`);
    console.log(`📦 体积减少: ${sizeReduction}%`);
  }

  // 总结建议
  console.log('\n\n💡 优化建议:\n');
  console.log('1. 【数据分层】只传递首屏必需数据给 SSR，次要内容客户端加载');
  console.log('   - 首屏: 标题、价格、库存、前 5 张图片');
  console.log('   - 懒加载: 评论、推荐商品、详情图\n');

  console.log('2. 【缓存策略】使用 Redis 缓存渲染结果');
  console.log('   - 普通商品: TTL 300s (5分钟)');
  console.log('   - 热门商品: TTL 60s (1分钟)');
  console.log('   - 秒杀商品: 不缓存，使用流式渲染\n');

  console.log('3. 【懒加载】使用 Intersection Observer 实现可视区域加载');
  console.log('   - 提前 100px 开始加载');
  console.log('   - 配合骨架屏提升体验\n');

  console.log('4. 【监控指标】');
  console.log('   - TTFB < 200ms');
  console.log('   - FCP < 1s');
  console.log('   - LCP < 2.5s');
  console.log('   - 缓存命中率 > 95%\n');
}

// 执行测试
console.log('提示: 使用 node --expose-gc 运行可以获得更准确的内存测试结果\n');
runFullTest().catch(console.error);
