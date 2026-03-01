#!/bin/bash

# Screen2Gether 一键启动脚本
# 包含 PipeWire 虚拟音频设备配置

set -e

echo "=========================================="
echo "  Screen2Gether 一键启动脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查依赖
check_dependencies() {
    echo -e "${YELLOW}[1/4] 检查依赖...${NC}"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: Node.js 未安装${NC}"
        exit 1
    fi
    
    if ! command -v pactl &> /dev/null; then
        echo -e "${RED}错误: PulseAudio/PipeWire 命令不可用${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
}

# 设置虚拟音频设备
setup_virtual_audio() {
    echo -e "${YELLOW}[2/4] 配置虚拟音频设备...${NC}"
    
    # 检查是否已经存在
    if pactl list short sinks | grep -q "Screen2Gether"; then
        echo -e "${GREEN}✓ 虚拟音频设备已存在，跳过创建${NC}"
    else
        # 创建虚拟音频接收器
        pactl load-module module-null-sink sink_name=Screen2Gether sink_properties=device.description="Screen2Gether-Virtual" > /dev/null 2>&1 || true
        
        # 创建回环到默认扬声器（让主播也能听到）
        pactl load-module module-loopback source=Screen2Gether.monitor > /dev/null 2>&1 || true
        
        echo -e "${GREEN}✓ 虚拟音频设备已创建${NC}"
    fi
    
    echo ""
    echo -e "  虚拟设备名称: ${GREEN}Screen2Gether${NC}"
    echo -e "  监听设备名称: ${GREEN}Monitor of Screen2Gether${NC}"
    echo ""
}

# 安装 npm 依赖
install_dependencies() {
    echo -e "${YELLOW}[3/4] 检查 npm 依赖...${NC}"
    
    if [ ! -d "node_modules" ]; then
        echo "正在安装依赖..."
        npm install
    else
        echo -e "${GREEN}✓ 依赖已安装${NC}"
    fi
}

# 启动服务器
start_server() {
    echo -e "${YELLOW}[4/4] 启动服务器...${NC}"
    echo ""
    
    # 获取本机 IP
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    PORT=${PORT:-3000}
    
    echo "=========================================="
    echo -e "${GREEN}  服务已启动！${NC}"
    echo "=========================================="
    echo ""
    echo -e "  本地访问: ${GREEN}http://localhost:${PORT}${NC}"
    echo -e "  局域网访问: ${GREEN}http://${LOCAL_IP}:${PORT}${NC}"
    echo ""
    echo "----------------------------------------"
    echo "  使用说明:"
    echo "----------------------------------------"
    echo ""
    echo "  1. 主播端操作:"
    echo "     - 打开网页，选择「共享屏幕」"
    echo "     - 勾选「使用分离音频捕获」"
    echo "     - 在音频设备中选择以下之一："
    echo "       * Screen2Gether"
    echo "       * Monitor of Screen2Gether"
    echo "     - 点击「开始共享」"
    echo ""
    echo "  2. 将应用音频路由到虚拟设备:"
    echo "     方法一: 使用 pavucontrol (推荐)"
    echo "       $ pavucontrol"
    echo "       在「播放」标签中，将应用的输出设备"
    echo "       改为「Screen2Gether-Virtual」"
    echo ""
    echo "     方法二: 使用命令行"
    echo "       $ pactl list sink-inputs        # 查看应用ID"
    echo "       $ pactl move-sink-input <ID> Screen2Gether"
    echo ""
    echo "  3. 观众端:"
    echo "     - 输入房间号即可观看"
    echo ""
    echo "----------------------------------------"
    echo "  按 Ctrl+C 停止服务器"
    echo "=========================================="
    echo ""
    
    # 启动 Node.js 服务器
    node server/index.js
}

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}正在清理...${NC}"
    
    # 卸载虚拟音频模块（可选，保留也没问题）
    # pactl unload-module module-null-sink 2>/dev/null || true
    
    echo -e "${GREEN}再见！${NC}"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 主流程
main() {
    cd "$(dirname "$0")"
    
    check_dependencies
    setup_virtual_audio
    install_dependencies
    start_server
}

main "$@"
