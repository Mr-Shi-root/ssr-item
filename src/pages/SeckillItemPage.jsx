import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * 秒杀商品详情页组件 - 用于 CSR 渲染
 * 只渲染关键信息和秒杀按钮，追求极致性能
 */
const SeckillItemPage = () => {
  const [itemData, setItemData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    // 获取商品数据
    const itemId = window.__ITEM_ID__;

    axios.get(`/api/item/${itemId}`)
      .then(response => {
        setItemData(response.data.data);
        setLoading(false);

        // 隐藏骨架屏，显示实际内容
        const skeleton = document.getElementById('skeleton');
        const appContent = document.getElementById('app-content');
        if (skeleton) skeleton.classList.add('loaded');
        if (appContent) appContent.classList.add('loaded');

        // 模拟倒计时（实际项目中应该从服务器获取）
        setCountdown(3600); // 1小时
      })
      .catch(error => {
        console.error('获取商品数据失败:', error);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSeckill = async () => {
    if (purchasing) return;

    setPurchasing(true);

    try {
      // 调用秒杀接口
      // const result = await axios.post(`/api/seckill/${itemData.itemId}`);

      // Mock 秒杀结果
      await new Promise(resolve => setTimeout(resolve, 500));
      alert('秒杀成功！');
    } catch (error) {
      alert('秒杀失败，请重试');
    } finally {
      setPurchasing(false);
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || !itemData) {
    return null; // 骨架屏已经在服务端渲染
  }

  // 内联样式对象
  const styles = {
    seckillPage: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px'
    },
    seckillBadge: {
      display: 'inline-block',
      background: 'linear-gradient(135deg, #ff6b6b, #ff4d4f)',
      color: 'white',
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '20px',
      boxShadow: '0 2px 8px rgba(255, 77, 79, 0.3)'
    },
    seckillHeader: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '24px',
      borderRadius: '12px',
      marginBottom: '24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    headerTitle: {
      fontSize: '24px',
      margin: 0
    },
    countdown: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    },
    countdownTime: {
      fontSize: '28px',
      fontWeight: 'bold',
      fontFamily: "'Courier New', monospace",
      marginTop: '4px'
    },
    seckillContent: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '32px'
    },
    productImage: {
      width: '100%',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
    },
    title: {
      fontSize: '22px',
      marginBottom: '20px',
      lineHeight: '1.4'
    },
    priceBox: {
      background: '#fff5f5',
      border: '2px solid #ff4d4f',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '24px'
    },
    seckillPrice: {
      display: 'flex',
      alignItems: 'baseline',
      marginBottom: '12px'
    },
    priceLabel: {
      fontSize: '14px',
      color: '#666',
      marginRight: '8px'
    },
    price: {
      fontSize: '36px',
      color: '#ff4d4f',
      fontWeight: 'bold'
    },
    stock: {
      color: '#666',
      fontSize: '14px'
    },
    stockStrong: {
      color: '#ff4d4f',
      fontSize: '18px',
      fontWeight: 'bold'
    },
    seckillBtn: {
      width: '100%',
      padding: '18px',
      fontSize: '18px',
      fontWeight: 'bold',
      color: 'white',
      background: 'linear-gradient(135deg, #ff6b6b, #ff4d4f)',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.3s',
      boxShadow: '0 4px 12px rgba(255, 77, 79, 0.4)'
    },
    seckillBtnDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed'
    },
    tips: {
      marginTop: '24px',
      padding: '16px',
      background: '#f5f5f5',
      borderRadius: '8px',
      fontSize: '13px',
      color: '#666'
    },
    tipItem: {
      margin: '8px 0'
    }
  };

  return (
    <div style={styles.seckillPage}>
      <div style={styles.seckillBadge}>⚡ 秒杀进行中</div>

      <div style={styles.seckillHeader}>
        <h1 style={styles.headerTitle}>限时秒杀</h1>
        <div style={styles.countdown}>
          <span>距离结束:</span>
          <span style={styles.countdownTime}>{formatTime(countdown)}</span>
        </div>
      </div>

      <div style={styles.seckillContent}>
        <div className="product-image">
          <img src={itemData.images[0]} alt={itemData.title} style={styles.productImage} />
        </div>

        <div className="product-info">
          <h2 style={styles.title}>{itemData.title}</h2>

          <div style={styles.priceBox}>
            <div style={styles.seckillPrice}>
              <span style={styles.priceLabel}>秒杀价</span>
              <span style={styles.price}>¥{itemData.price}</span>
            </div>
            <div style={styles.stock}>
              仅剩 <strong style={styles.stockStrong}>{itemData.stock}</strong> 件
            </div>
          </div>

          <button
            style={{
              ...styles.seckillBtn,
              ...(purchasing || countdown === 0 ? styles.seckillBtnDisabled : {})
            }}
            onClick={handleSeckill}
            disabled={purchasing || countdown === 0}
          >
            {purchasing ? '抢购中...' : countdown === 0 ? '已结束' : '立即抢购'}
          </button>

          <div style={styles.tips}>
            <p style={styles.tipItem}>• 每人限购1件</p>
            <p style={styles.tipItem}>• 秒杀商品不支持退换货</p>
            <p style={styles.tipItem}>• 请在规定时间内完成支付</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeckillItemPage;
