# Screen2Gether 🖥️

高性能屏幕共享应用，支持 1080P@60fps、音频传输和低延迟。

## 功能特性

- 🎥 **高清视频**: 支持 1080P、2K、4K 分辨率
- 🚀 **高帧率**: 最高支持 60 FPS
- 🔊 **音频传输**: 支持系统音频共享（Linux 自动路由）
- ⚡ **低延迟**: 基于 WebRTC P2P 连接
- 📊 **实时统计**: 显示分辨率、帧率、码率、延迟等
- 🎨 **现代UI**: 简洁美观的用户界面
- 🐧 **Linux 优化**: 一键配置 PipeWire 虚拟音频设备

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (原生)
- **WebRTC**: 实现 P2P 视频传输
- **WebSocket**: 信令服务器
- **Node.js**: 后端服务

## 快速开始

### Linux (推荐)

```bash
# 一键启动（自动配置虚拟音频设备）
./run.sh
```

脚本会自动：
- 创建虚拟音频设备 (Screen2Gether)
- 将所有应用音频路由到虚拟设备
- 创建回环让你也能听到声音
- 退出时自动恢复原始设置

### Windows

```bash
# 双击运行或在命令行执行
run.bat
```

Windows 需要手动安装虚拟音频驱动，详见下方说明。

### 通用方式

```bash
npm install
npm start
```

然后访问 `http://localhost:3000`

## 音频配置

### Linux (PipeWire/PulseAudio)

使用 `run.sh` 会自动配置。如需手动操作：

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

### Windows

Windows 需要手动安装虚拟音频驱动：

1. **下载 VB-Cable**: https://vb-audio.com/Cable/

2. **配置默认输出**:
   - 打开「声音设置」→「更多声音设置」
   - 将「播放」默认设备设为 `CABLE Input`
   - 这样所有音频会输出到虚拟设备

3. **同时听到声音（可选）**:
   - 在「录制」标签页找到 `CABLE Output`
   - 右键 →「属性」→「侦听」标签
   - 勾选「侦听此设备」→ 选择你的扬声器/耳机

4. **浏览器共享时**:
   - 勾选「共享音频」
   - 或选择 `CABLE Output` 作为音频源

## 使用说明

### 共享屏幕（主播）

1. 点击「共享屏幕」卡片
2. 勾选「使用分离音频捕获 (Linux/PipeWire)」
3. 在音频设备下拉框中选择 `Monitor of Screen2Gether`
4. 点击「开始共享」
5. 将房间号分享给观看者

### 观看屏幕（观众）

1. 点击「观看屏幕」卡片
2. 输入主播分享的房间号
3. 点击「加入房间」

## 部署到公网服务器

### 使用云服务器

1. 将代码上传到服务器
2. 安装 Node.js (推荐 v18+)
3. 运行 `./run.sh` 或 `npm start`
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

### 环境变量

```bash
PORT=8080 ./run.sh
# 或
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

Linux 用户确保使用 `./run.sh` 启动，脚本会自动创建回环设备。

### Q: 观众听不到声音？

1. 主播端：确保勾选「使用分离音频捕获」
2. 主播端：确保选择了正确的音频设备 (`Monitor of Screen2Gether`)
3. 检查虚拟设备状态：`pactl list sinks short | grep Screen2Gether`

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
├── run.sh               # Linux 一键启动脚本
├── run.bat              # Windows 启动脚本
├── start.sh             # Linux 基础启动脚本
└── audio-route.sh       # 音频路由辅助工具
```

## 声明

> ⚠️ **注意**: 本项目大部分代码由 AI 生成，仅供学习和参考使用。

## 开源协议

MIT License
