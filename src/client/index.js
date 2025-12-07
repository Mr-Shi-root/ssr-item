import React from 'react';
import ReactDOM from 'react-dom/client';
import ItemDetailPage from '../pages/ItemDetailPage';

/**
 * 客户端入口 - 用于 SSR 页面的 hydration
 */

// 从服务端注入的初始数据
const initialData = window.__INITIAL_DATA__;

if (initialData) {
  // Hydrate SSR 渲染的内容
  const root = ReactDOM.hydrateRoot(
    document.getElementById('root'),
    <ItemDetailPage itemData={initialData} />
  );
} else {
  console.warn('未找到初始数据，跳过 hydration');
}
