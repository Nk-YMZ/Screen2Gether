# Screen2Gether 🖥️

高性能屏幕共享应用，支持 1080P@60fps、音频传输和低延迟。

## 功能特性

- 🎥 **高清视频**: 支持 1080P、2K、4K 分辨率
- 🚀 **高帧率**: 最高支持 60 FPS
- 🔊 **音频传输**: 支持系统音频共享
- ⚡ **低延迟**: 基于 WebRTC P2P 连接
- 📊 **实时统计**: 显示分辨率、帧率、码率、延迟等
- 🎨 **现代UI**: 简洁美观的用户界面
- 🐧 **Linux 优化**: 一键配置 PipeWire 虚拟音频设备
- 🌐 **国内优化**: 使用国内可访问的 STUN 服务器

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (原生)
- **WebRTC**: 实现 P2P 视频传输
- **WebSocket**: 信令服务器
- **Node.js**: 后端服务

## 快速开始

### Windows

```bash
# 双击运行或在命令行执行
run.bat
```

Windows 开箱即用，浏览器原生支持系统音频捕获。

### Linux

```bash
# 方式1: 一键启动（自动配置虚拟音频设备 + 启动服务器）
./run.sh

# 方式2: 仅配置音频（连接公网服务器时使用）
./audio.sh
```

`audio.sh` 脚本会：
- 创建虚拟音频设备 (Screen2Gether)
- 将所有应用音频路由到虚拟设备
- 创建回环让你也能听到声音
- 按 Ctrl+C 自动恢复原始设置

### 通用方式

```bash
npm install
npm start
```

然后访问 `http://localhost:3000`

## 音频配置

### Windows

Windows 开箱即用，共享屏幕时勾选「共享系统音频」即可。

### Linux (PipeWire/PulseAudio)

Linux 需要额外配置，因为浏览器无法直接捕获系统音频。

**推荐方式**: 使用 `./audio.sh` 独立脚本

```bash
# 配置虚拟音频设备，按 Ctrl+C 退出并自动恢复
./audio.sh
```

**手动操作**:

```bash
# 查看音频路由工具帮助
./audio-route.sh help

# 列出正在播放音频的应用
./audio-route.sh list

# 将所有应用路由到虚拟设备
./audio-route.sh all

# 恢复
./audio-route.sh restore
```

## 使用说明

### 共享屏幕（主播）

1. 访问 `/host` 页面
2. Windows: 勾选「共享系统音频」即可
3. Linux: 勾选「使用分离音频捕获」，选择 `Monitor of Screen2Gether`
4. 点击「开始共享」
5. 将房间号分享给观看者

### 观看屏幕（观众）

1. 打开首页
2. 输入主播分享的房间号
3. 点击「加入房间」

## 部署到公网服务器

### 快速部署

```bash
# 1. 克隆代码
git clone https://github.com/Nk-YMZ/Screen2Gether.git
cd Screen2Gether

# 2. 安装依赖
npm install

# 3. 启动服务
./start.sh
# 或
npm start
```

### 使用 PM2 守护进程

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server/index.js --name screen2gether

# 设置开机自启
pm2 startup
pm2 save
```

### 服务器更新

```bash
# 一键更新脚本
./update.sh dev
```

脚本会自动：
- 拉取最新代码
- 更新依赖
- 重启 PM2 服务

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

### 环境变量

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

### Q: 主播听不到声音？

Linux 用户确保使用 `./audio.sh` 或 `./run.sh`，脚本会自动创建回环设备。

### Q: 观众听不到声音？

**Windows 主播**: 确保勾选「共享系统音频」

**Linux 主播**: 
1. 确保运行了 `./audio.sh`
2. 勾选「使用分离音频捕获」
3. 选择正确的音频设备 (`Monitor of Screen2Gether`)

### Q: 无法共享屏幕？

确保使用支持的浏览器（Chrome、Edge、Firefox）并授予屏幕访问权限。

### Q: 观看者无法连接？

- 检查网络连接
- 确认房间号正确
- 本项目已使用国内 STUN 服务器，大部分情况下可直接连接

### Q: 画面卡顿？

- 降低分辨率或帧率
- 提高码率
- 检查网络带宽

## NAT 穿透

本项目默认使用国内可访问的 STUN 服务器：
- 小米 (stun.miwifi.com)
- B站 (stun.chat.bilibili.com)
- 芒果TV (stun.hitv.com)
- Syncthing (stun.syncthing.net)

大部分网络环境下可直接进行 P2P 连接，无需额外配置。

仅在极少数严格对称 NAT 环境下需要 TURN 服务器中继。可以在网页界面勾选「使用 TURN 服务器」进行配置。

## 项目结构

```
Screen2Gether/
├── public/              # 前端文件
│   ├── index.html       # 主页面
│   ├── css/style.css    # 样式
│   └── js/
│       ├── main.js      # 主逻辑
│       └── webrtc.js    # WebRTC 封装
├── server/
│   └── index.js         # 信令服务器
├── run.sh               # Linux 一键启动（音频+服务器）
├── audio.sh             # Linux 独立音频配置
├── start.sh             # Linux 基础启动脚本
├── update.sh            # 服务器一键更新脚本
├── run.bat              # Windows 启动脚本
└── audio-route.sh       # 音频路由辅助工具
```

## 声明

> ⚠️ **注意**: 本项目大部分代码由 AI 生成，仅供学习和参考使用。

## 开源协议

MIT License
