#!/bin/bash

# Screen2Gether 音频路由辅助脚本
# 快速将应用音频路由到虚拟设备

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SINK_NAME="Screen2Gether"

# 显示帮助
show_help() {
    echo ""
    echo "用法: $0 [命令] [参数]"
    echo ""
    echo "命令:"
    echo "  list              列出所有正在播放音频的应用"
    echo "  all               将所有应用路由到 Screen2Gether"
    echo "  app <名称>        将指定应用路由到 Screen2Gether（模糊匹配）"
    echo "  restore           将所有应用恢复到默认输出设备"
    echo "  default           将 Screen2Gether 设为系统默认输出"
    echo "  undefault         恢复系统默认输出设备"
    echo "  status            显示当前状态"
    echo ""
    echo "示例:"
    echo "  $0 list                    # 查看所有应用"
    echo "  $0 all                     # 路由所有应用到虚拟设备"
    echo "  $0 app firefox             # 路由 Firefox"
    echo "  $0 app spotify             # 路由 Spotify"
    echo "  $0 restore                 # 恢复所有应用"
    echo ""
}

# 获取默认接收器
get_default_sink() {
    pactl get-default-sink
}

# 列出所有正在播放音频的应用
list_apps() {
    echo -e "${YELLOW}正在播放音频的应用:${NC}"
    echo ""
    printf "  %-8s %-40s %s\n" "ID" "应用名称" "当前输出设备"
    echo "  ------------------------------------------------------------------------"
    
    pactl list sink-inputs | while read -r line; do
        if [[ "$line" =~ Sink\ Input\ \#([0-9]+) ]]; then
            id="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ application\.name\ =\ \"(.*)\" ]]; then
            name="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ application\.binary\ =\ \"(.*)\" ]]; then
            binary="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ Sink:\ ([0-9]+) ]]; then
            sink_id="${BASH_REMATCH[1]}"
            sink_name=$(pactl list sinks short | awk -v id="$sink_id" '$1 == id {print $2}')
            if [ -n "$id" ] && [ -n "$name" ]; then
                printf "  %-8s %-40s %s\n" "$id" "$name ($binary)" "$sink_name"
            fi
            id=""
            name=""
            binary=""
            sink_id=""
        fi
    done
    echo ""
}

# 将所有应用路由到 Screen2Gether
route_all() {
    echo -e "${YELLOW}将所有应用路由到 ${SINK_NAME}...${NC}"
    
    local count=0
    pactl list sink-inputs short | while read -r line; do
        id=$(echo "$line" | awk '{print $1}')
        if [ -n "$id" ]; then
            pactl move-sink-input "$id" "$SINK_NAME" 2>/dev/null && \
                echo -e "  ${GREEN}✓${NC} 已路由: ID $id"
            ((count++))
        fi
    done
    
    echo -e "${GREEN}完成！${NC}"
    echo ""
    echo -e "提示: 新启动的应用需要重新运行此命令，或使用 '$0 default' 设置为默认输出"
}

# 将指定应用路由到 Screen2Gether
route_app() {
    local app_name="$1"
    
    if [ -z "$app_name" ]; then
        echo -e "${RED}错误: 请指定应用名称${NC}"
        show_help
        exit 1
    fi
    
    echo -e "${YELLOW}查找匹配 '${app_name}' 的应用...${NC}"
    
    local found=0
    local id=""
    local name=""
    local binary=""
    
    pactl list sink-inputs | while read -r line; do
        if [[ "$line" =~ Sink\ Input\ \#([0-9]+) ]]; then
            id="${BASH_REMATCH[1]}"
            name=""
            binary=""
        elif [[ "$line" =~ application\.name\ =\ \"(.*)\" ]]; then
            name="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ application\.binary\ =\ \"(.*)\" ]]; then
            binary="${BASH_REMATCH[1]}"
        elif [[ "$line" =~ Sink:\ ]]; then
            # 检查是否匹配
            if [ -n "$id" ]; then
                if [[ "${name,,}" == *"${app_name,,}"* ]] || [[ "${binary,,}" == *"${app_name,,}"* ]]; then
                    echo -e "  找到: ${BLUE}$name${NC} (ID: $id)"
                    if pactl move-sink-input "$id" "$SINK_NAME" 2>/dev/null; then
                        echo -e "  ${GREEN}✓${NC} 已路由到 ${SINK_NAME}"
                    fi
                    found=1
                fi
            fi
            id=""
        fi
    done
    
    if [ "$found" -eq 0 ]; then
        echo -e "${YELLOW}未找到匹配 '${app_name}' 的应用${NC}"
        echo "提示: 确保应用正在播放音频"
    fi
}

# 恢复所有应用到默认设备
restore_all() {
    echo -e "${YELLOW}恢复所有应用到默认输出设备...${NC}"
    
    local default_sink=$(get_default_sink)
    
    # 排除 Screen2Gether 本身
    if [ "$default_sink" == "$SINK_NAME" ]; then
        # 找一个真实的输出设备
        default_sink=$(pactl list sinks short | grep -v "$SINK_NAME" | head -1 | awk '{print $2}')
        if [ -z "$default_sink" ]; then
            echo -e "${RED}错误: 找不到可用的输出设备${NC}"
            exit 1
        fi
    fi
    
    echo -e "目标设备: ${BLUE}$default_sink${NC}"
    
    pactl list sink-inputs short | while read -r line; do
        id=$(echo "$line" | awk '{print $1}')
        if [ -n "$id" ]; then
            pactl move-sink-input "$id" "$default_sink" 2>/dev/null && \
                echo -e "  ${GREEN}✓${NC} 已恢复: ID $id"
        fi
    done
    
    echo -e "${GREEN}完成！${NC}"
}

# 设置 Screen2Gether 为默认输出
set_default() {
    local current_default=$(get_default_sink)
    
    echo -e "${YELLOW}当前默认输出: ${BLUE}$current_default${NC}"
    
    # 保存当前默认（用于恢复）
    echo "$current_default" > /tmp/screen2gether-default-sink
    
    # 设置新默认
    pactl set-default-sink "$SINK_NAME"
    
    echo -e "${GREEN}✓ 已将 ${SINK_NAME} 设为默认输出${NC}"
    echo ""
    echo -e "注意: 所有新启动的应用都会自动输出到 ${SINK_NAME}"
    echo -e "      使用 '$0 undefault' 可恢复之前的设置"
}

# 恢复默认输出
unset_default() {
    if [ -f /tmp/screen2gether-default-sink ]; then
        local old_default=$(cat /tmp/screen2gether-default-sink)
        pactl set-default-sink "$old_default"
        echo -e "${GREEN}✓ 已恢复默认输出为: ${BLUE}$old_default${NC}"
        rm /tmp/screen2gether-default-sink
    else
        # 尝试自动找一个真实设备
        local real_sink=$(pactl list sinks short | grep -v "$SINK_NAME" | head -1 | awk '{print $2}')
        if [ -n "$real_sink" ]; then
            pactl set-default-sink "$real_sink"
            echo -e "${GREEN}✓ 已恢复默认输出为: ${BLUE}$real_sink${NC}"
        else
            echo -e "${YELLOW}无法自动恢复，请手动设置${NC}"
        fi
    fi
}

# 显示状态
show_status() {
    echo ""
    echo -e "${YELLOW}Screen2Gether 音频状态${NC}"
    echo "=========================================="
    echo ""
    
    # 检查虚拟设备是否存在
    if pactl list sinks short | grep -q "$SINK_NAME"; then
        echo -e "虚拟设备: ${GREEN}✓ 已创建${NC} ($SINK_NAME)"
    else
        echo -e "虚拟设备: ${RED}✗ 未创建${NC}"
    fi
    
    # 当前默认输出
    local default=$(get_default_sink)
    echo -e "默认输出: ${BLUE}$default${NC}"
    
    # 连接到虚拟设备的应用数量
    local count=$(pactl list sink-inputs short | awk -v sink="$SINK_NAME" '$2 == sink {count++} END {print count+0}')
    echo -e "已路由应用数: ${BLUE}$count${NC}"
    
    echo ""
    
    if [ "$count" -gt 0 ]; then
        echo -e "${YELLOW}已路由到 ${SINK_NAME} 的应用:${NC}"
        pactl list sink-inputs | while read -r line; do
            if [[ "$line" =~ Sink\ Input\ \#([0-9]+) ]]; then
                id="${BASH_REMATCH[1]}"
            elif [[ "$line" =~ application\.name\ =\ \"(.*)\" ]]; then
                name="${BASH_REMATCH[1]}"
            elif [[ "$line" =~ Sink:\ ([0-9]+) ]]; then
                sink_id="${BASH_REMATCH[1]}"
                sink_check=$(pactl list sinks short | awk -v id="$sink_id" '$1 == id {print $2}')
                if [ "$sink_check" == "$SINK_NAME" ] && [ -n "$name" ]; then
                    echo -e "  • $name (ID: $id)"
                fi
            fi
        done
    fi
    
    echo ""
}

# 主逻辑
case "$1" in
    list)
        list_apps
        ;;
    all)
        route_all
        ;;
    app)
        route_app "$2"
        ;;
    restore)
        restore_all
        ;;
    default)
        set_default
        ;;
    undefault)
        unset_default
        ;;
    status)
        show_status
        ;;
    *)
        show_help
        ;;
esac
