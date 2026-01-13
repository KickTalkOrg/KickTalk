#!/bin/bash

# WebSocket IP range blocking script using the native 'nft' tool.
# This script dynamically fetches the latest AWS (for Pusher) and Cloudflare (for 7TV)
# IP ranges for both IPv4 and IPv6 and creates nftables rules to block them.
#
# REQUIRES: curl, jq
# Usage: ./scripts/block-websockets-firewalld.sh {start|stop|status}

set -e

# Name for our dedicated nftables objects
TABLE_NAME="kicktalk_blocker"
CHAIN_NAME_V4="output_block_v4"
CHAIN_NAME_V6="output_block_v6"

# URLs for IP ranges
AWS_URL="https://ip-ranges.amazonaws.com/ip-ranges.json"
CLOUDFLARE_V4_URL="https://www.cloudflare.com/ips-v4"
CLOUDFLARE_V6_URL="https://www.cloudflare.com/ips-v6"

# Function to check if our dedicated table exists
table_exists() {
    sudo nft list tables | grep -q "table inet $TABLE_NAME"
}

# --- Status ---
show_status() {
    echo "WebSocket Domain Block Status (native nftables):"
    echo "================================================"
    
    if ! table_exists; then
        echo "✓ Status: No active blocking table found. Network is clear."
    else
        echo "✓ Table 'inet $TABLE_NAME' exists."
        echo ""
        echo "--- IPv4 Rules ---"
        sudo nft list chain inet "$TABLE_NAME" "$CHAIN_NAME_V4"
        echo ""
        echo "--- IPv6 Rules ---"
        sudo nft list chain inet "$TABLE_NAME" "$CHAIN_NAME_V6"
    fi

    # Check for lingering rich rules from old script versions
    if sudo firewall-cmd --list-rich-rules 2>/dev/null | grep -q "."; then
        echo ""
        echo "⚠️  Warning: Found lingering rich rules from old script attempts."
        echo "   Run './scripts/block-websockets-firewalld.sh stop' to clean them up."
    fi
}

# --- Start ---
block_ranges() {
    if ! command -v jq &> /dev/null; then
        echo "Error: 'jq' command not found. Please install it (e.g., sudo dnf install jq)."
        exit 1
    fi
    
    if table_exists; then
        echo "Blocking table already exists. Use 'status' to check or 'stop' to clear."
        return 0
    fi

    echo "Fetching and parsing IP ranges..."
    # AWS services we care about for Pusher
    local aws_services=("AMAZON_CONNECT" "API_GATEWAY" "EC2")
    local aws_jq_filter
    # Create a JSON array of service names to pass safely to jq
    local services_json_array
    services_json_array=$(printf '"%s",' "${aws_services[@]}" | sed 's/,$//' | sed 's/^/[/' | sed 's/$/]/')
    
    # Use --argjson to pass the array and 'IN' to check for membership
    local aws_ipv4
    aws_ipv4=$(curl -s "$AWS_URL" | jq -r --argjson services "$services_json_array" '.prefixes[] | select(.service | IN($services[])) | .ip_prefix')
    local aws_ipv6
    aws_ipv6=$(curl -s "$AWS_URL" | jq -r --argjson services "$services_json_array" '.ipv6_prefixes[] | select(.service | IN($services[])) | .ipv6_prefix')
    
    local cloudflare_ipv4
    cloudflare_ipv4=$(curl -s "$CLOUDFLARE_V4_URL")
    local cloudflare_ipv6
    cloudflare_ipv6=$(curl -s "$CLOUDFLARE_V6_URL")

    # Combine all ranges into a valid, comma-separated set for nftables
    local full_ipv4_set
    full_ipv4_set="{ $(echo "$aws_ipv4"$'\n'"$cloudflare_ipv4" | grep -v '^$' | paste -sd, -) }"
    local full_ipv6_set
    full_ipv6_set="{ $(echo "$aws_ipv6"$'\n'"$cloudflare_ipv6" | grep -v '^$' | paste -sd, -) }"

    echo "Blocking WebSocket domains using native nft..."
    sudo nft add table inet "$TABLE_NAME"
    
    # Create and populate IPv4 chain
    echo "  Creating IPv4 chain and rules..."
    sudo nft add chain inet "$TABLE_NAME" "$CHAIN_NAME_V4" '{ type filter hook output priority filter; }'
    sudo nft add rule inet "$TABLE_NAME" "$CHAIN_NAME_V4" ip daddr "$full_ipv4_set" tcp dport 443 drop

    # Create and populate IPv6 chain
    echo "  Creating IPv6 chain and rules..."
    sudo nft add chain inet "$TABLE_NAME" "$CHAIN_NAME_V6" '{ type filter hook output priority filter; }'
    sudo nft add rule inet "$TABLE_NAME" "$CHAIN_NAME_V6" ip6 daddr "$full_ipv6_set" tcp dport 443 drop

    echo "✗ WebSocket domains blocked for IPv4 and IPv6."
}

# --- Stop ---
unblock_ranges() {
    echo "Unblocking all WebSocket domains and cleaning up..."
    
    if table_exists; then
        echo "  Deleting table: inet $TABLE_NAME"
        sudo nft delete table inet "$TABLE_NAME"
    else
        echo "  No active nft blocking table found."
    fi
    
    echo "  Cleaning up any lingering rich rules from old scripts..."
    # This command is noisy on error, so we redirect stderr
    local old_rules
    old_rules=$(sudo firewall-cmd --list-rich-rules 2>/dev/null)
    if [ -n "$old_rules" ]; then
        while IFS= read -r rule; do
            echo "    Removing old rule: $rule"
            sudo firewall-cmd --remove-rich-rule="$rule" 2>/dev/null || true
        done <<< "$old_rules"
    else
        echo "  No lingering rich rules found."
    fi

    echo "✓ All WebSocket blocking rules should now be removed."
}


# --- Main Script ---
if ! command -v nft &> /dev/null; then
    echo "Error: 'nft' command not found. Please install nftables."
    exit 1
fi

case "$1" in
    start)
        block_ranges
        ;;
    stop)
        unblock_ranges
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        echo ""
        echo "  start   - Fetches IPs and creates nftables rules to block traffic."
        echo "  stop    - Deletes the dedicated table and cleans up old rich rules."
        echo "  status  - Shows the status of the dedicated nftables rules."
        echo ""
        exit 1
        ;;
esac