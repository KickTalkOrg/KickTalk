#!/bin/bash

# WebSocket domain blocking script for testing connection recovery
# Usage: ./scripts/block-websockets.sh {start|stop|status}

DOMAINS=("ws-us2.pusher.com" "events.7tv.io")
HOSTS_FILE="/etc/hosts"

check_blocked() {
    local blocked_count=0
    for domain in "${DOMAINS[@]}"; do
        if grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            ((blocked_count++))
        fi
    done
    echo $blocked_count
}

show_status() {
    local blocked_count=$(check_blocked)
    local total_domains=${#DOMAINS[@]}
    
    echo "WebSocket Domain Block Status:"
    echo "=============================="
    
    for domain in "${DOMAINS[@]}"; do
        if grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            echo "  ✗ $domain - BLOCKED"
        else
            echo "  ✓ $domain - ALLOWED"
        fi
    done
    
    echo ""
    if [ $blocked_count -eq $total_domains ]; then
        echo "Status: ALL domains blocked ($blocked_count/$total_domains)"
    elif [ $blocked_count -eq 0 ]; then
        echo "Status: ALL domains allowed ($blocked_count/$total_domains)"
    else
        echo "Status: PARTIAL block ($blocked_count/$total_domains)"
    fi
}

block_domains() {
    local blocked_count=$(check_blocked)
    local total_domains=${#DOMAINS[@]}
    
    if [ $blocked_count -eq $total_domains ]; then
        echo "All WebSocket domains are already blocked."
        return 0
    fi
    
    echo "Blocking WebSocket domains..."
    echo "Note: This requires sudo permissions to modify /etc/hosts"
    
    # Create temp file with new entries
    local temp_file=$(mktemp)
    for domain in "${DOMAINS[@]}"; do
        if ! grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            echo "  Blocking $domain"
            echo "127.0.0.1 $domain" >> "$temp_file"
        else
            echo "  $domain already blocked"
        fi
    done
    
    # Append to hosts file if we have entries to add
    if [ -s "$temp_file" ]; then
        sudo bash -c "cat '$temp_file' >> '$HOSTS_FILE'"
        rm "$temp_file"
        echo "✗ WebSocket domains blocked. Connections should fail now."
    else
        rm "$temp_file"
        echo "All domains were already blocked."
    fi
}

unblock_domains() {
    local blocked_count=$(check_blocked)
    
    if [ $blocked_count -eq 0 ]; then
        echo "All WebSocket domains are already unblocked."
        return 0
    fi
    
    echo "Unblocking WebSocket domains..."
    
    for domain in "${DOMAINS[@]}"; do
        if grep -q "127.0.0.1 $domain" "$HOSTS_FILE" 2>/dev/null; then
            echo "  Unblocking $domain"
            sudo sed -i "/127.0.0.1 $domain/d" "$HOSTS_FILE"
        else
            echo "  $domain already unblocked"
        fi
    done
    
    echo "✓ WebSocket domains unblocked. Connections should work now."
}

case "$1" in
    start)
        block_domains
        ;;
    stop)
        unblock_domains
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Block WebSocket domains (simulate network failure)"
        echo "  stop    - Unblock WebSocket domains (restore connections)"
        echo "  status  - Show current blocking status"
        echo ""
        echo "Domains managed:"
        for domain in "${DOMAINS[@]}"; do
            echo "  - $domain"
        done
        exit 1
        ;;
esac