# Screen2Gether 部署教程 - 阿里云 1Panel 面板

## 目录
1. [准备工作](#1-准备工作)
2. [安装 Node.js 环境](#2-安装-nodejs-环境)
3. [上传代码到服务器](#3-上传代码到服务器)
4. [配置进程守护](#4-配置进程守护)
5. [配置反向代理](#5-配置反向代理)
6. [配置 SSL 证书（可选）](#6-配置-ssl-证书可选)
7. [测试访问](#7-测试访问)

---

## 1. 准备工作

### 1.1 确保服务器安全组开放端口
在阿里云控制台，确保以下端口开放：
- **80** (HTTP)
- **443** (HTTPS)
- **3000** (Node.js 应用，如果不用反向代理)

### 1.2 登录 1Panel 面板
访问 `http://你的服务器IP:端口` 登录 1Panel 面板

---

## 2. 安装 Node.js 环境

### 方法一：通过 1Panel 应用商店安装

1. 登录 1Panel 面板
2. 点击左侧菜单 **应用商店**
3. 搜索 **Node.js** 或 **NVM**
4. 点击安装

### 方法二：通过终端安装

1. 在 1Panel 点击 **主机** → **终端**
2. 执行以下命令：

```bash
# 安装 Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 或者使用 yum 直接安装（如果支持）
# sudo yum install -y nodejs

# 验证安装
node -v
npm -v
```

---

## 3. 上传代码到服务器

### 方法一：Git 克隆（推荐）

1. 在终端执行：
```bash
# 创建应用目录
sudo mkdir -p /opt/screen2gether
sudo chown -R $(whoami) /opt/screen2gether

# 克隆代码
cd /opt/screen2gether
git clone https://github.com/Nk-YMZ/Screen2Gether.git .

# 切换到 dev 分支（测试新功能）
git checkout dev

# 安装依赖
npm install
```

### 方法二：通过 1Panel 文件管理上传

1. 点击 **主机** → **文件**
2. 导航到 `/opt/` 目录
3. 创建 `screen2gether` 文件夹
4. 上传本地项目压缩包并解压
5. 在终端执行 `npm install`

---

## 4. 配置进程守护

使用 PM2 保持应用持续运行。

### 4.1 安装 PM2

```bash
sudo npm install -g pm2
```

### 4.2 创建 PM2 配置文件

在项目目录创建 `ecosystem.config.js`：

```bash
cd /opt/screen2gether
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'screen2gether',
    script: 'server/index.js',
    cwd: '/opt/screen2gether',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF
```

### 4.3 启动应用

```bash
cd /opt/screen2gether
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4.4 常用 PM2 命令

```bash
pm2 status              # 查看状态
pm2 logs screen2gether  # 查看日志
pm2 restart screen2gether  # 重启
pm2 stop screen2gether  # 停止
pm2 delete screen2gether # 删除
```

---

## 5. 配置反向代理

推荐使用 OpenResty（Nginx）作为反向代理。

### 5.1 安装 OpenResty

1. 在 1Panel **应用商店** 搜索 **OpenResty**
2. 点击安装

### 5.2 创建网站

1. 点击 **网站** → **创建网站**
2. 选择 **反向代理**
3. 填写：
   - **域名**: 你的域名（如 `share.example.com`）或 IP
   - **代理地址**: `http://127.0.0.1:3000`
4. 点击确认

### 5.3 手动配置（可选）

如果需要自定义 Nginx 配置：

1. 点击网站 → **配置** → **反向代理**
2. 添加以下配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # WebSocket 超时设置
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

---

## 6. 配置 SSL 证书（可选）

WebRTC 在 HTTPS 下工作更好。

### 6.1 使用 1Panel 申请证书

1. 点击 **网站** → 选择网站 → **HTTPS**
2. 点击 **申请证书**
3. 选择 **Let's Encrypt** 免费证书
4. 填写邮箱，点击申请
5. 申请成功后开启 **强制 HTTPS**

### 6.2 自定义证书

如果有自己的证书：
1. 上传证书文件到服务器
2. 在网站配置中指定证书路径

---

## 7. 测试访问

### 7.1 检查服务状态

```bash
# 检查 PM2 状态
pm2 status

# 检查端口
netstat -tlnp | grep 3000

# 查看日志
pm2 logs screen2gether
```

### 7.2 访问测试

- **观众页**: `https://你的域名/` 或 `http://服务器IP/`
- **主播页**: `https://你的域名/host` 或 `http://服务器IP/host`

---

## 8. 防火墙配置

### 8.1 1Panel 防火墙

1. 点击 **主机** → **防火墙**
2. 确保开放 80、443 端口

### 8.2 阿里云安全组

1. 登录阿里云控制台
2. 进入 ECS 实例 → 安全组
3. 添加入方向规则：
   - 端口 80/443
   - 授权对象 0.0.0.0/0

---

## 9. 更新部署

当有新代码更新时：

```bash
cd /opt/screen2gether

# 拉取最新代码
git pull origin dev

# 更新依赖（如有）
npm install

# 重启服务
pm2 restart screen2gether
```

---

## 10. 故障排查

### 10.1 查看日志

```bash
# PM2 日志
pm2 logs screen2gether

# Nginx 日志（如果使用反向代理）
tail -f /www/server/openresty/nginx/logs/error.log
```

### 10.2 常见问题

**Q: 页面无法访问**
- 检查 PM2 是否运行: `pm2 status`
- 检查端口是否监听: `netstat -tlnp | grep 3000`
- 检查防火墙和安全组

**Q: WebSocket 连接失败**
- 确保 Nginx 配置了 `proxy_set_header Upgrade` 和 `Connection`
- 检查是否使用了 HTTPS（某些浏览器要求）

**Q: 无法共享屏幕**
- 确保使用 HTTPS（生产环境必须）
- 检查浏览器权限设置

---

## 快速命令参考

```bash
# 启动服务
pm2 start screen2gether

# 停止服务
pm2 stop screen2gether

# 重启服务
pm2 restart screen2gether

# 查看日志
pm2 logs screen2gether

# 更新代码并重启
cd /opt/screen2gether && git pull && pm2 restart screen2gether
```

---

## 一键部署脚本

将以下脚本保存为 `deploy.sh`：

```bash
#!/bin/bash

# 配置
APP_DIR="/opt/screen2gether"
GIT_REPO="https://github.com/Nk-YMZ/Screen2Gether.git"
BRANCH="dev"

echo "=== Screen2Gether 部署脚本 ==="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装 PM2..."
    sudo npm install -g pm2
fi

# 创建目录并克隆代码
if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p $APP_DIR
    sudo chown -R $(whoami) $APP_DIR
fi

cd $APP_DIR

if [ ! -d ".git" ]; then
    echo "克隆代码..."
    git clone $GIT_REPO .
fi

# 切换分支
echo "切换到 $BRANCH 分支..."
git checkout $BRANCH
git pull origin $BRANCH

# 安装依赖
echo "安装依赖..."
npm install

# 创建 PM2 配置
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'screen2gether',
    script: 'server/index.js',
    cwd: '/opt/screen2gether',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# 启动/重启服务
if pm2 status | grep -q "screen2gether"; then
    echo "重启服务..."
    pm2 restart screen2gether
else
    echo "启动服务..."
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
fi

echo "=== 部署完成 ==="
echo "请配置反向代理指向 http://127.0.0.1:3000"
pm2 status
```

使用方法：
```bash
chmod +x deploy.sh
./deploy.sh
