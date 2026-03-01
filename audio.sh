#!/bin/bash

# Screen2Gether Linux 音频配置脚本
# 独立运行，配置虚拟音频设备后等待，按 Ctrl+C 自动恢复

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SINK_NAME="Screen2Gether"
ORIGINAL_DEFAULT_SINK=""
SAVE_FILE="/tmp/screen2gether-original-sink"

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}=========================================="
    echo "  正在恢复音频设置..."
    echo -e "==========================================${NC}"
    
    # 从保存的文件读取原始设备
    if [ -f "$SAVE_FILE" ]; then
        local real_sink=$(cat "$SAVE_FILE")
        echo -e "${YELLOW}从记录恢复到: ${BLUE}$real_sink${NC}"
        rm -f "$SAVE_FILE"
    else
        local real_sink=$(pactl list sinks short | grep bluez | head -1 | awk '{print $2}')
        if [ -z "$real_sink" ]; then
            real_sink=$(pactl get-default-sink 2>/dev/null)
        fi
        if [ "$real_sink" = "$SINK_NAME" ]; then
            real_sink=$(pactl list sinks short | grep -v "$SINK_NAME" | grep -v "Dummy" | head -1 | awk '{print $2}')
        fi
        echo -e "${YELLOW}恢复到: ${BLUE}$real_sink${NC}"
    fi
    
    # 将所有应用移回真实输出
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
    local loopback_modules=$(pactl list modules short | grep "module-loopback" | grep "${SINK_NAME}" | awk '{print $1}')
    for id in $loopback_modules; do
        pactl unload-module "$id" 2>/dev/null || true
    done
    echo -e "${GREEN}✓ 回环模块已卸载${NC}"
    
    # 卸载虚拟设备
    pactl unload-module module-null-sink 2>/dev/null || true
    echo -e "${GREEN}✓ 虚拟设备已卸载${NC}"
    
    echo ""
    echo -e "${GREEN}✓ 全部恢复完成！${NC}"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 检查依赖
check_dependencies() {
    echo -e "${CYAN}[1/3] 检查系统依赖...${NC}"
    
    if ! command -v pactl &> /dev/null; then
        echo -e "${RED}✗ PulseAudio/PipeWire 不可用${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 依赖检查通过${NC}"
}

# 设置虚拟音频设备
setup_virtual_audio() {
    echo -e "${CYAN}[2/3] 配置虚拟音频设备...${NC}"
    
    # 获取当前默认输出设备
    ORIGINAL_DEFAULT_SINK=$(pactl get-default-sink 2>/dev/null)
    
    # 如果当前默认是虚拟设备，找一个真实的
    if [ -z "$ORIGINAL_DEFAULT_SINK" ] || [ "$ORIGINAL_DEFAULT_SINK" = "$SINK_NAME" ]; then
        ORIGINAL_DEFAULT_SINK=$(pactl list sinks short | grep bluez | head -1 | awk '{print $2}')
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
}

# 设置默认输出并创建回环
set_default_output() {
    echo -e "${CYAN}[3/3] 设置默认音频输出...${NC}"
    
    # 将 Screen2Gether 设为默认
    pactl set-default-sink "$SINK_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ 已将 $SINK_NAME 设为默认输出${NC}"
    
    # 将所有现有应用也路由到虚拟设备
    echo -e "${YELLOW}  正在将现有应用路由到虚拟设备...${NC}"
    local inputs=$(pactl list sink-inputs short 2>/dev/null | awk '{print $1}')
    for id in $inputs; do
        if pactl move-sink-input "$id" "$SINK_NAME" 2>/dev/null; then
            echo -e "    ${GREEN}✓${NC} 应用 $id 已路由"
        fi
    done
    
    # 创建回环
    local existing_loopback=$(pactl list modules short | grep "module-loopback" | grep "${SINK_NAME}" | awk '{print $1}')
    if [ -n "$existing_loopback" ]; then
        pactl unload-module "$existing_loopback" 2>/dev/null || true
    fi
    
    local loopback_id=$(pactl load-module module-loopback \
        source="${SINK_NAME}.monitor" \
        sink="$ORIGINAL_DEFAULT_SINK" \
        latency_msec=5 \
        2>&1)
    
    if [ -n "$loopback_id" ] && [[ "$loopback_id" =~ ^[0-9]+$ ]]; then
        echo -e "${GREEN}✓ 回环已创建: 虚拟设备 → $ORIGINAL_DEFAULT_SINK${NC}"
    else
        echo -e "${YELLOW}⚠ 回环创建失败，你可能听不到系统声音${NC}"
    fi
    
    echo -e "${BLUE}  所有应用现在输出到: $SINK_NAME${NC}"
    echo -e "${BLUE}  你仍然可以听到声音（回环到: $ORIGINAL_DEFAULT_SINK）${NC}"
}

# 显示使用说明并等待
wait_for_exit() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗"
    echo -e "║            音频配置完成！保持运行中...                     ║"
    echo -e "╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}┌────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│  在浏览器中的使用步骤                                      │${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}1.${NC} 打开网页，点击「开始共享」                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}2.${NC} 勾选「使用分离音频捕获 (Linux/PipeWire)」              ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}3.${NC} 在音频设备下拉框中选择:                               ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}     • Monitor of Screen2Gether                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}  ${GREEN}4.${NC} 开始共享屏幕                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}                                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}  ${BLUE}提示:${NC} 所有应用的音频已自动路由到这里                     ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}       你仍然可以听到声音（通过回环）                       ${YELLOW}│${NC}"
    echo -e "${YELLOW}│${NC}                                                            ${YELLOW}│${NC}"
    echo -e "${YELLOW}├────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${YELLOW}│${NC}  按 ${RED}Ctrl+C${NC} 恢复原始音频设置并退出                       ${YELLOW}│${NC}"
    echo -e "${YELLOW}└────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    
    # 保持运行，等待 Ctrl+C
    echo -e "${CYAN}等待中... (按 Ctrl+C 退出并恢复)${NC}"
    while true; do
        sleep 1
    done
}

# 主流程
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗"
    echo -e "║         Screen2Gether 音频配置                             ║"
    echo -e "╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    check_dependencies
    setup_virtual_audio
    set_default_output
    wait_for_exit
}

main "$@"
