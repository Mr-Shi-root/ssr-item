# Webpack 多入口 vs 多配置文件详解

## 一、核心概念区分

### 1.1 你的项目情况

```
你的项目：
├── config/webpack.client.js      ← 配置文件 1
├── config/webpack.server.js      ← 配置文件 2
└── config/webpack.skeleton.js    ← 配置文件 3
```

**这不是"多入口"，而是"多配置文件"！**

---

## 二、多入口 vs 多配置文件

### 2.1 多入口（Multi-Entry）

**定义**：一个 Webpack 配置文件中有多个入口点

```javascript
// ✅ 这才是多入口
// webpack.config.js
module.exports = {
  entry: {
    app: './src/app.js',      // 入口 1
    admin: './src/admin.js',  // 入口 2
    vendor: './src/vendor.js' // 入口 3
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};

// 构建结果：
// dist/app.bundle.js
// dist/admin.bundle.js
// dist/vendor.bundle.js
```

**特点**：
- ✅ 一个配置文件
- ✅ 多个入口点
- ✅ 一次构建生成多个 bundle
- ✅ 可以共享配置和插件

---

### 2.2 多配置文件（Multi-Config）

**定义**：多个独立的 Webpack 配置文件

```javascript
// ❌ 你的项目是这种（多配置文件）

// config/webpack.client.js
module.exports = {
  entry: './src/client/index.js',  // 单入口
  output: { filename: 'client.bundle.js' }
};

// config/webpack.server.js
module.exports = {
  entry: './src/server/index.js',  // 单入口
  output: { filename: 'server.js' }
};

// config/webpack.skeleton.js
module.exports = {
  entry: './src/client/skeleton.js',  // 单入口
  output: { filename: 'skeleton.bundle.js' }
};
```

**特点**：
- ✅ 多个配置文件
- ✅ 每个配置文件一个入口
- ✅ 需要分别构建
- ✅ 配置独立，不共享

---

## 三、详细对比

### 3.1 多入口示例

```javascript
// webpack.config.js（一个文件）
module.exports = {
  mode: 'production',

  // 多个入口
  entry: {
    home: './src/pages/home.js',
    about: './src/pages/about.js',
    contact: './src/pages/contact.js'
  },

  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  },

  // 共享的配置
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader' }
    ]
  },

  // 共享的插件
  plugins: [
    new HtmlWebpackPlugin({
      chunks: ['home'],
      filename: 'home.html'
    }),
    new HtmlWebpackPlugin({
      chunks: ['about'],
      filename: 'about.html'
    })
  ]
};

// 一次构建：
// npm run build
//
// 生成：
// dist/home.bundle.js
// dist/about.bundle.js
// dist/contact.bundle.js
```

---

### 3.2 多配置文件示例（你的项目）

```javascript
// config/webpack.client.js
module.exports = {
  mode: 'production',
  entry: './src/client/index.js',  // 单入口
  output: {
    filename: 'client.bundle.js',
    path: path.resolve(__dirname, '../public')
  },
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader' }
    ]
  }
};

// config/webpack.server.js
module.exports = {
  mode: 'production',
  target: 'node',  // 不同的 target
  entry: './src/server/index.js',  // 单入口
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname, '../build')
  },
  externals: [nodeExternals()],  // 不同的配置
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader' }
    ]
  }
};

// config/webpack.skeleton.js
module.exports = {
  mode: 'production',
  entry: './src/client/skeleton.js',  // 单入口
  output: {
    filename: 'skeleton.bundle.js',
    path: path.resolve(__dirname, '../public/skeleton')
  },
  plugins: [
    new HtmlWebpackPlugin({  // 不同的插件
      template: './src/client/skeleton.html'
    })
  ]
};

// 需要分别构建：
// npm run build:client
// npm run build:server
// npm run build:skeleton
```

---

## 四、为什么你的项目用多配置文件？

### 4.1 原因分析

**原因 1：构建目标不同**

```javascript
// 客户端：浏览器环境
webpack.client.js: {
  target: 'web',  // 默认
  output: { path: 'public/' }
}

// 服务端：Node.js 环境
webpack.server.js: {
  target: 'node',  // Node.js
  output: { path: 'build/' },
  externals: [nodeExternals()]  // 排除 node_modules
}

// 骨架页：浏览器环境 + 特殊配置
webpack.skeleton.js: {
  target: 'web',
  output: { path: 'public/skeleton/' },
  plugins: [HtmlWebpackPlugin]  // 生成 HTML
}
```

**原因 2：输出目录不同**

```
client   → public/client.bundle.js
server   → build/server.js
skeleton → public/skeleton/skeleton.bundle.js
```

**原因 3：配置差异大**

```javascript
// 服务端需要特殊配置
- target: 'node'
- externals: [nodeExternals()]
- 不需要 HtmlWebpackPlugin

// 骨架页需要特殊配置
- HtmlWebpackPlugin
- 独立的输出目录
- 不同的 publicPath
```

---

### 4.2 如果改成多入口会怎样？

```javascript
// ❌ 不推荐：强行改成多入口
module.exports = {
  entry: {
    client: './src/client/index.js',
    server: './src/server/index.js',
    skeleton: './src/client/skeleton.js'
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};

// 问题：
// 1. server 需要 target: 'node'，但 client 需要 target: 'web'
// 2. server 需要 externals，但 client 不需要
// 3. 输出目录不同，无法统一
// 4. skeleton 需要 HtmlWebpackPlugin，但 server 不需要
```

---

## 五、正确的术语

### 5.1 你的项目应该这样描述

**❌ 错误说法**：
- "我搭建了 Webpack 多入口构建"

**✅ 正确说法**：
- "我搭建了 Webpack 多配置文件构建体系"
- "我配置了三套独立的 Webpack 构建流程"
- "我实现了客户端、服务端、骨架页的分离构建"

---

### 5.2 简历中的表述

**方式 1：强调分离构建**
```
搭建 Webpack 构建体系，实现客户端、服务端、骨架页的分离构建，
支持不同的构建目标（web/node）和输出配置
```

**方式 2：强调多配置**
```
配置三套独立的 Webpack 构建流程：
- 客户端构建（SSR hydration）
- 服务端构建（Node.js target）
- 骨架页构建（CSR + HTML 生成）
```

**方式 3：强调技术细节**
```
搭建 Webpack 多配置文件构建体系，针对不同运行环境配置独立的
构建流程，包括 target 配置、externals 处理、输出路径管理等
```

---

## 六、什么时候用多入口？

### 6.1 适合多入口的场景

**场景 1：多页面应用（MPA）**

```javascript
// 适合多入口
module.exports = {
  entry: {
    home: './src/pages/home.js',
    about: './src/pages/about.js',
    contact: './src/pages/contact.js'
  },
  plugins: [
    new HtmlWebpackPlugin({
      chunks: ['home'],
      filename: 'home.html'
    }),
    new HtmlWebpackPlugin({
      chunks: ['about'],
      filename: 'about.html'
    })
  ]
};
```

**场景 2：代码分割（Vendor Splitting）**

```javascript
// 适合多入口
module.exports = {
  entry: {
    app: './src/app.js',
    vendor: ['react', 'react-dom', 'axios']  // 第三方库单独打包
  }
};
```

**场景 3：相同环境的多个应用**

```javascript
// 适合多入口
module.exports = {
  entry: {
    admin: './src/admin/index.js',
    user: './src/user/index.js'
  },
  // 共享相同的配置
  target: 'web',
  module: { /* 相同的 loader */ },
  plugins: [ /* 相同的插件 */ ]
};
```

---

### 6.2 适合多配置文件的场景（你的项目）

**场景 1：不同的构建目标**

```javascript
// 客户端：target: 'web'
// 服务端：target: 'node'
// → 必须用多配置文件
```

**场景 2：不同的输出目录**

```javascript
// 客户端：public/
// 服务端：build/
// 骨架页：public/skeleton/
// → 多配置文件更清晰
```

**场景 3：配置差异大**

```javascript
// 服务端需要 externals
// 骨架页需要 HtmlWebpackPlugin
// → 多配置文件更灵活
```

---

## 七、实际项目结构

### 7.1 你的项目（多配置文件）

```
ssr-item/
├── config/
│   ├── webpack.client.js      ← 配置 1（客户端）
│   ├── webpack.server.js      ← 配置 2（服务端）
│   └── webpack.skeleton.js    ← 配置 3（骨架页）
├── src/
│   ├── client/
│   │   ├── index.js           ← 客户端入口
│   │   └── skeleton.js        ← 骨架页入口
│   └── server/
│       └── index.js           ← 服务端入口
└── package.json
    "scripts": {
      "build:client": "webpack --config config/webpack.client.js",
      "build:server": "webpack --config config/webpack.server.js",
      "build:skeleton": "webpack --config config/webpack.skeleton.js",
      "build": "npm run build:client && npm run build:server && npm run build:skeleton"
    }
```

---

### 7.2 多入口项目示例（对比）

```
multi-page-app/
├── webpack.config.js          ← 一个配置文件
├── src/
│   └── pages/
│       ├── home.js            ← 入口 1
│       ├── about.js           ← 入口 2
│       └── contact.js         ← 入口 3
└── package.json
    "scripts": {
      "build": "webpack"       ← 一次构建
    }
```

---

## 八、面试中如何表述

### 8.1 如果面试官问："你用了 Webpack 多入口吗？"

**❌ 错误回答**：
"是的，我用了多入口"

**✅ 正确回答**：
"我的项目不是多入口，而是多配置文件。因为客户端、服务端、骨架页的构建目标和配置差异很大，所以我配置了三套独立的 Webpack 构建流程。

客户端构建用于 SSR 的 hydration，target 是 web；
服务端构建用于 Node.js 运行，target 是 node，还需要配置 externals 排除 node_modules；
骨架页构建用于秒杀场景的 CSR，需要生成独立的 HTML 文件。

这三套构建流程的配置差异很大，所以用多配置文件比多入口更合适。"

---

### 8.2 如果面试官问："为什么不用多入口？"

**✅ 回答**：
"多入口适合构建目标相同、配置相似的场景，比如多页面应用。

但我的项目中，客户端和服务端的构建目标完全不同：
- 客户端 target 是 web，服务端 target 是 node
- 服务端需要 externals 排除 node_modules，客户端不需要
- 输出目录也不同，客户端输出到 public/，服务端输出到 build/

如果强行用多入口，会导致配置冲突，无法满足不同环境的需求。所以我选择了多配置文件，每个配置文件针对特定环境优化，更加灵活和清晰。"

---

## 九、总结

### 9.1 核心区别

| 特性 | 多入口 | 多配置文件（你的项目） |
|------|--------|----------------------|
| **配置文件数量** | 1 个 | 3 个 |
| **入口数量** | 多个 | 每个配置 1 个 |
| **构建次数** | 1 次 | 3 次 |
| **适用场景** | 相同环境 | 不同环境 |
| **配置共享** | 容易 | 独立 |
| **灵活性** | 低 | 高 |

### 9.2 你的项目

```
✅ 多配置文件（Multi-Config）
❌ 不是多入口（Multi-Entry）

正确表述：
- "Webpack 多配置文件构建体系"
- "客户端、服务端、骨架页的分离构建"
- "针对不同运行环境的独立构建流程"
```

### 9.3 简历建议

**推荐表述**：
```
搭建 Webpack 构建体系，实现客户端（SSR hydration）、服务端（Node.js）、
骨架页（CSR）的分离构建，针对不同运行环境配置独立的构建流程，
包括 target 配置、externals 处理、输出路径管理等
```

---

**记住**：你的项目是**多配置文件**，不是多入口！这样表述更专业、更准确。
