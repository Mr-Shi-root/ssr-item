import React from 'react';

/**
 * 优化版商品详情页 - 渐进式 SSR
 *
 * 优化策略：
 * 1. 首屏关键内容（商品信息、价格、购买按钮）SSR 渲染
 * 2. 次要内容（评论、推荐商品）客户端异步加载
 * 3. 减少 SSR 渲染的数据量和复杂度
 */
const ItemDetailPage = ({ itemData, isSSR = true }) => {
  const styles = {
    itemDetailPage: { minHeight: '100vh' },
    header: {
      background: '#333',
      color: 'white',
      padding: '16px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerNav: { display: 'flex' },
    headerLink: {
      color: 'white',
      marginLeft: '20px',
      textDecoration: 'none'
    },
    mainContent: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '40px',
      padding: '40px 20px',
      maxWidth: '1200px',
      margin: '0 auto'
    },
    mainImage: {
      width: '100%',
      borderRadius: '8px'
    },
    thumbnailList: {
      display: 'flex',
      gap: '10px',
      marginTop: '10px'
    },
    thumbnail: {
      width: '80px',
      height: '80px',
      objectFit: 'cover',
      borderRadius: '4px',
      cursor: 'pointer'
    },
    productTitle: {
      fontSize: '28px',
      marginBottom: '20px'
    },
    priceSection: {
      marginBottom: '20px'
    },
    currentPrice: {
      fontSize: '32px',
      color: '#ff4d4f',
      fontWeight: 'bold'
    },
    originalPrice: {
      fontSize: '18px',
      color: '#999',
      textDecoration: 'line-through',
      marginLeft: '12px'
    },
    stockInfo: {
      color: '#666',
      marginBottom: '20px'
    },
    specs: {
      background: '#f5f5f5',
      padding: '16px',
      borderRadius: '8px',
      marginBottom: '20px'
    },
    specsList: {
      listStyle: 'none',
      marginTop: '10px',
      paddingLeft: 0
    },
    specsItem: {
      padding: '8px 0'
    },
    actions: {
      display: 'flex',
      gap: '12px'
    },
    btnBase: {
      flex: 1,
      padding: '14px 24px',
      fontSize: '16px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    },
    btnPrimary: {
      background: '#ff4d4f',
      color: 'white'
    },
    btnSecondary: {
      background: 'white',
      color: '#333',
      border: '1px solid #d9d9d9'
    },
    section: {
      maxWidth: '1200px',
      margin: '40px auto',
      padding: '0 20px'
    },
    lazySection: {
      minHeight: '200px',
      background: '#f9f9f9',
      borderRadius: '8px',
      padding: '20px',
      textAlign: 'center',
      color: '#999'
    }
  };

  return (
    <div style={styles.itemDetailPage}>
      {/* 头部 - SSR 渲染 */}
      <header style={styles.header}>
        <h1>商城</h1>
        <nav style={styles.headerNav}>
          <a href="/" style={styles.headerLink}>首页</a>
          <a href="/cart" style={styles.headerLink}>购物车</a>
        </nav>
      </header>

      {/* 主要商品信息 - SSR 渲染（首屏关键内容） */}
      <main style={styles.mainContent}>
        <div className="product-gallery">
          <div className="main-image">
            <img
              src={itemData.images[0]}
              alt={itemData.title}
              style={styles.mainImage}
              loading="eager"
            />
          </div>
          <div style={styles.thumbnailList}>
            {/* 只渲染前 3 张缩略图，减少 SSR 负担 */}
            {itemData.images.slice(0, 3).map((img, index) => (
              <img
                key={index}
                src={img}
                alt={`${itemData.title} ${index + 1}`}
                style={styles.thumbnail}
                loading="lazy"
              />
            ))}
          </div>
        </div>

        <div className="product-info">
          <h1 style={styles.productTitle}>{itemData.title}</h1>

          <div style={styles.priceSection}>
            <span style={styles.currentPrice}>¥{itemData.price}</span>
            {itemData.originalPrice && (
              <span style={styles.originalPrice}>¥{itemData.originalPrice}</span>
            )}
          </div>

          <div style={styles.stockInfo}>
            库存: {itemData.stock} 件
          </div>

          <div style={styles.specs}>
            <h3>商品规格</h3>
            <ul style={styles.specsList}>
              {Object.entries(itemData.specs || {}).map(([key, value]) => (
                <li key={key} style={styles.specsItem}>
                  <strong>{key}:</strong> {value}
                </li>
              ))}
            </ul>
          </div>

          <div style={styles.actions}>
            <button style={{...styles.btnBase, ...styles.btnPrimary}}>立即购买</button>
            <button style={{...styles.btnBase, ...styles.btnSecondary}}>加入购物车</button>
          </div>
        </div>
      </main>

      {/* 商品描述 - SSR 渲染（但简化内容） */}
      <section style={styles.section}>
        <h2>商品描述</h2>
        <p>{itemData.description}</p>
      </section>

      {/* 用户评价 - 客户端异步加载（SSR 时显示占位符） */}
      <section style={styles.section}>
        <h2>用户评价</h2>
        {isSSR ? (
          <div style={styles.lazySection} data-lazy-load="reviews">
            评论加载中...
          </div>
        ) : (
          <div className="review-list" id="reviews-container">
            {/* 客户端渲染评论 */}
          </div>
        )}
      </section>

      {/* 推荐商品 - 客户端异步加载 */}
      <section style={styles.section}>
        <h2>推荐商品</h2>
        {isSSR ? (
          <div style={styles.lazySection} data-lazy-load="recommendations">
            推荐商品加载中...
          </div>
        ) : (
          <div className="recommendations-list" id="recommendations-container">
            {/* 客户端渲染推荐 */}
          </div>
        )}
      </section>
    </div>
  );
};

export default ItemDetailPage;
