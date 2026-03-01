#!/bin/bash

# Screen2Gether 完整一键启动脚本
# 自动完成：虚拟音频设备 + 默认输出设置 + 服务器启动 + 结束后自动恢复

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SINK_NAME="Screen2Gether"
PORT=${PORT:-3000}
ORIGINAL_DEFAULT_SINK=""
LOOPBACK_MODULE_ID=""
SAVE_FILE="/tmp/screen2gether-original-sink"

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}=========================================="
    echo "  正在清理并恢复设置..."
    echo -e "==========================================${NC}"
    
    # 从保存的文件读取原始设备
    if [ -f "$SAVE_FILE" ]; then
        local real_sink=$(cat "$SAVE_FILE")
        echo -e "${YELLOW}从记录恢复到: ${BLUE}$real_sink${NC}"
        rm -f "$SAVE_FILE"
    else
        # 尝试找蓝牙设备或当前默认
        local real_sink=$(pactl list sinks short | grep bluez | head -1 | awk '{print $2}')
        if [ -z "$real_sink" ]; then
            real_sink=$(pactl get-default-sink 2>/dev/null)
        fi
        if [ "$real_sink" = "$SINK_NAME" ]; then
            real_sink=$(pactl list sinks short | grep -v "$SINK_NAME" | grep -v "Dummy" | head -1 | awk '{print $2}')
        fi
        echo -e "${YELLOW}恢复到: ${BLUE}$real_sink${NC}"
    fi
    
    # 将所有应用移回真实输出（使用 for 循环避免子 shell 问题）
    if [ -n "$real_sink" ]; then
        local inputs=$(pactl list sink-inputs short 2>/dev/null | awk '{print $1}')
        for id in $inputs; do
            pactl move-sink-input "$id" "$real_sink" 2>/dev/null || true
        done
        echo -e "${GREEN}✓ 应用音频已恢复${NC}"
        
        # 恢复默认输出
        pactl set-default-sink "$real_sink" 2>/dev/null || true
        echo -e "${GREEN}✓ 默认输出已恢复${NC}"
    fi
    
    # 卸载回环模块
    if [ -n "$LOOPBACK_MODULE_ID" ]; then
        pactl unload-module "$LOOPBACK_MODULE_ID" 2>/dev/null || true
        echo -e "${GREEN}✓ 回环模块已卸载${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✓ 全部恢复完成！${NC}"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 检查依赖
check_dependencies() {
    echo -e "${CYAN}[1/5] 检查系统依赖...${NC}"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js 未安装${NC}"
        exit 1
    fi
    
    if ! command -v pactl &> /dev/null; then
        echo -e "${RED}✗ PulseAudio/PipeWire 不可用${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
}

# 设置虚拟音频设备
setup_virtual_audio() {
    echo -e "${CYAN}[2/5] 配置虚拟音频设备...${NC}"
    
    # 获取当前默认输出设备（这是我们要保存和恢复的）
    ORIGINAL_DEFAULT_SINK=$(pactl get-default-sink 2>/dev/null)
    
    # 如果当前默认是虚拟设备，找一个真实的
    if [ -z "$ORIGINAL_DEFAULT_SINK" ] || [ "$ORIGINAL_DEFAULT_SINK" = "$SINK_NAME" ]; then
        # 优先找蓝牙设备
        ORIGINAL_DEFAULT_SINK=$(pactl list sinks short | grep bluez | head -1 | awk '{print $2}')
        # 没有蓝牙就找第一个真实设备
        if [ -z "$ORIGINAL_DEFAULT_SINK" ]; then
            ORIGINAL_DEFAULT_SINK=$(pactl list sinks short | grep -v "$SINK_NAME" | grep -v "Dummy" | head -1 | awk '{print $2}')
        fi
    fi
    
    if [ -z "$ORIGINAL_DEFAULT_SINK" ]; then
        echo -e "${RED}✗ 找不到可用的音频输出设备${NC}"
        exit 1
    fi
    
    # 保存原始设备到文件
    echo "$ORIGINAL_DEFAULT_SINK" > "$SAVE_FILE"
    
    echo -e "${BLUE}  原始输出设备: ${GREEN}$ORIGINAL_DEFAULT_SINK${NC}"
    echo -e "${BLUE}  (已保存，退出时会自动恢复)${NC}"
    
    # 检查虚拟设备是否已存在
    if pactl list sinks short | grep -q "[[:space:]]${SINK_NAME}[[:space:]]"; then
        echo -e "${GREEN}✓ 虚拟设备已存在${NC}"
    else
        # 创建虚拟音频接收器
        pactl load-module module-null-sink \
            sink_name="$SINK_NAME" \
            sink_properties="device.description='Screen2Gether-Virtual'" \
            rate=48000 \
            channels=2 \
            > /dev/null 2>&1
        
        if ! pactl list sinks short | grep -q "[[:space:]]${SINK_NAME}[[:space:]]"; then
            echo -e "${RED}✗ 创建虚拟设备失败${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}✓ 虚拟设备已创建${NC}"
    fi
    
    # 回环将在路由应用后创建（需要音频流才能激活目标设备）
}

# 创建回环（在路由应用后调用）
create_loopback() {
    # 先删除旧的回环
    local existing_loopback=$(pactl list modules short | grep "module-loopback" | grep "${SINK_NAME}" | awk '{print $1}')
    if [ -n "$existing_loopback" ]; then
        pactl unload-module "$existing_loopback" 2>/dev/null || true
    fi
    
    # 创建新的回环（此时 Screen2Gether 应该有音频流了）
    LOOPBACK_MODULE_ID=$(pactl load-module module-loopback \
        source="${SINK_NAME}.monitor" \
        sink="$ORIGINAL_DEFAULT_SINK" \
        latency_msec=5 \
        2>&1)
    
    if [ -n "$LOOPBACK_MODULE_ID" ] && [[ "$LOOPBACK_MODULE_ID" =~ ^[0-9]+$ ]]; then
        echo -e "${GREEN}✓ 回环已创建: 虚拟设备 → $ORIGINAL_DEFAULT_SINK${NC}"
        sleep 1
    else
        echo -e "${RED}✗ 回环创建失败: $LOOPBACK_MODULE_ID${NC}"
        LOOPBACK_MODULE_ID=""
    fi
}

# 设置默认输出
set_default_output() {
    echo -e "${CYAN}[3/5] 设置默认音频输出...${NC}"
    
    # 将 Screen2Gether 设为默认
    pactl set-default-sink "$SINK_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ 已将 $SINK_NAME 设为默认输出${NC}"
    
    # 将所有现有应用也路由到虚拟设备（使用 for 循环避免子 shell 问题）
    echo -e "${YELLOW}  正在将现有应用路由到虚拟设备...${NC}"
    local inputs=$(pactl list sink-inputs short 2>/dev/null | awk '{print $1}')
    for id in $inputs; do
        if pactl move-sink-input "$id" "$SINK_NAME" 2>/dev/null; then
            echo -e "    ${GREEN}✓${NC} 应用 $id 已路由"
        fi
    done
    
    echo -e "${BLUE}  所有应用现在输出到: $SINK_NAME${NC}"
    
    # 现在创建回环（此时虚拟设备有音频流，能激活目标设备）
    create_loopback
    
    echo -e "${BLUE}  你仍然可以听到声音（回环到: $ORIGINAL_DEFAULT_SINK）${NC}"
}

# 安装 npm 依赖
install_dependencies() {
    echo -e "${CYAN}[4/5] 检查项目依赖...${NC}"
    
    cd "$(dirname "$0")"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}正在安装 npm 依赖...${NC}"
        npm install --silent
    fi
    
    echo -e "${GREEN}✓ 依赖就绪${NC}"
}

# 启动服务器
start_server() {
    echo -e "${CYAN}[5/5] 启动服务器...${NC}"
    echo ""
    
    # 获取本机 IP
    LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "")
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d'/' -f1 || echo "")
    fi
    
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗"
    echo -e "║            Screen2Gether 已启动！                          ║"
    echo -e "╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${GREEN}►${NC} 本地访问:   ${CYAN}http://localhost:${PORT}${NC}"
    if [ -n "$LOCAL_IP" ]; then
        echo -e "  ${GREEN}►${NC} 局域网访问: ${CYAN}http://${LOCAL_IP}:${PORT}${NC}"
    fi
    echo ""
    echo -e "${YELLOW}┌────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  使用说明                                                  │${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}                                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}1.${NC} 打开网页，选择「共享屏幕」                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}2.${NC} 勾选「使用分离音频捕获 (Linux/PipeWire)」              ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}3.${NC} 在音频设备下拉框中选择:                               ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}     • Monitor of Screen2Gether                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}4.${NC} 点击「开始共享」                                        ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}                                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${BLUE}提示:${NC} 所有应用的音频已自动路由到这里                     ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}       你仍然可以听到声音（通过回环）                       ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}                                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}  按 ${RED}Ctrl+C${NC} 停止服务并自动恢复音频设置                   ${YELLOW}│${NC}"
    echo -e "${YELLOW}└────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    
    # 启动服务器
    node server/index.js
}

# 主流程
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗"
    echo -e "║         Screen2Gether 一键启动                             ║"
    echo -e "╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    check_dependencies
    setup_virtual_audio
    set_default_output
    install_dependencies
    start_server
}

main "$@"
