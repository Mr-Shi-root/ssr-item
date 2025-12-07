import React from 'react';

/**
 * 普通商品详情页组件 - 用于 SSR 渲染
 */
const ItemDetailPage = ({ itemData }) => {
  // 内联样式对象
  const styles = {
    itemDetailPage: {
      minHeight: '100vh'
    },
    header: {
      background: '#333',
      color: 'white',
      padding: '16px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerNav: {
      display: 'flex'
    },
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
    reviewItem: {
      borderBottom: '1px solid #f0f0f0',
      padding: '16px 0'
    },
    reviewHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px'
    },
    user: {
      fontWeight: 'bold'
    }
  };

  return (
    <div style={styles.itemDetailPage}>
      <header style={styles.header}>
        <h1>商城</h1>
        <nav style={styles.headerNav}>
          <a href="/" style={styles.headerLink}>首页</a>
          <a href="/cart" style={styles.headerLink}>购物车</a>
        </nav>
      </header>

      <main style={styles.mainContent}>
        <div className="product-gallery">
          <div className="main-image">
            <img src={itemData.images[0]} alt={itemData.title} style={styles.mainImage} />
          </div>
          <div style={styles.thumbnailList}>
            {itemData.images.map((img, index) => (
              <img
                key={index}
                src={img}
                alt={`${itemData.title} ${index + 1}`}
                style={styles.thumbnail}
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

      <section style={styles.section}>
        <h2>商品描述</h2>
        <p>{itemData.description}</p>
      </section>

      <section style={styles.section}>
        <h2>用户评价</h2>
        {itemData.reviews && itemData.reviews.length > 0 ? (
          <div className="review-list">
            {itemData.reviews.map((review, index) => (
              <div key={index} style={styles.reviewItem}>
                <div style={styles.reviewHeader}>
                  <span style={styles.user}>{review.user}</span>
                  <span className="rating">{'⭐'.repeat(review.rating)}</span>
                </div>
                <p className="comment">{review.comment}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>暂无评价</p>
        )}
      </section>
    </div>
  );
};

export default ItemDetailPage;
