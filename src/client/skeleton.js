import React from 'react';
import ReactDOM from 'react-dom/client';
import SeckillItemPage from '../pages/SeckillItemPage';

/**
 * 秒杀页面客户端入口 - 用于 CSR 骨架页
 */

// 等待 DOM 加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSeckillPage);
} else {
  initSeckillPage();
}

function initSeckillPage() {
  const container = document.getElementById('app-content');

  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<SeckillItemPage />);
  } else {
    console.error('未找到容器元素 #app-content');
  }
}
