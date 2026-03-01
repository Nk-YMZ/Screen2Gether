# Screen2Gether 🖥️

高性能屏幕共享应用，支持 1080P@60fps、音频传输和低延迟。

## 功能特性

- 🎥 **高清视频**: 支持 1080P、2K、4K 分辨率
- 🚀 **高帧率**: 最高支持 60 FPS
- 🔊 **音频传输**: 支持系统音频共享
- ⚡ **低延迟**: 基于 WebRTC P2P 连接
- 📊 **实时统计**: 显示分辨率、帧率、码率、延迟等
- 🎨 **现代UI**: 简洁美观的用户界面

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (原生)
- **WebRTC**: 实现 P2P 视频传输
- **WebSocket**: 信令服务器
- **Node.js**: 后端服务

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

### 3. 访问应用

打开浏览器访问 `http://localhost:3000`

## 使用说明

### 共享屏幕（主播）

1. 点击「共享屏幕」卡片
2. 系统会生成一个房间号（6位代码）
3. 调整设置：
   - **分辨率**: 720P / 1080P / 2K / 4K
   - **帧率**: 24 / 30 / 60 FPS
   - **码率**: 2-50 Mbps
   - **编码**: VP9 / VP8 / H.264
   - **音频**: 是否共享系统音频
4. 点击「开始共享」
5. 将房间号分享给观看者

### 观看屏幕（观众）

1. 点击「观看屏幕」卡片
2. 输入主播分享的房间号
3. 点击「加入房间」
4. 等待主播开始共享

## 部署到公网服务器

### 使用云服务器

1. 将代码上传到服务器
2. 安装 Node.js (推荐 v18+)
3. 运行 `npm install && npm start`
4. 默认端口为 3000

### 使用 HTTPS (推荐)

WebRTC 在生产环境建议使用 HTTPS。可以使用 Nginx 反向代理：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 使用环境变量

```bash
PORT=8080 npm start
```

## 配置说明

### 视频编码

- **VP9**: 推荐使用，压缩效率高
- **H.264**: 兼容性好，硬件加速支持广泛
- **VP8**: 较老的编码，兼容性好但效率较低

### 码率建议

| 分辨率 | 帧率 | 推荐码率 |
|--------|------|----------|
| 720P   | 30   | 3-5 Mbps |
| 720P   | 60   | 5-8 Mbps |
| 1080P  | 30   | 5-8 Mbps |
| 1080P  | 60   | 10-15 Mbps |
| 2K     | 60   | 15-25 Mbps |
| 4K     | 60   | 25-50 Mbps |

## 常见问题

### Q: 无法共享屏幕？

确保使用支持的浏览器（Chrome、Edge、Firefox）并授予屏幕访问权限。

### Q: 观看者无法连接？

- 检查网络连接
- 确认房间号正确
- 如果在不同网络，可能需要 TURN 服务器

### Q: 画面卡顿？

- 降低分辨率或帧率
- 提高码率
- 检查网络带宽

## NAT 穿透

对于跨网络的 P2P 连接，默认使用 Google STUN 服务器。如果需要更好的穿透效果，可以配置 TURN 服务器。

修改 `public/js/webrtc.js` 中的 `rtcConfig`:

```javascript
this.rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:your-turn-server.com:3478',
            username: 'username',
            credential: 'password'
        }
    ]
};
```

## 开源协议

MIT License