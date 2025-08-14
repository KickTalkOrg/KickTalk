#!/bin/bash

# KickTalk Grafana Cloud Trace Queries - Manual Testing
# This script provides curl commands to query and analyze traces from Grafana Cloud Tempo
# 
# Usage: 
#   ./manual-tests/grafana-trace-queries.sh [function_name] [args...]
#   
# Examples:
#   ./manual-tests/grafana-trace-queries.sh recent_traces 5
#   ./manual-tests/grafana-trace-queries.sh help
#   ./manual-tests/grafana-trace-queries.sh status
#
# Prerequisites:
#   - Grafana Cloud Tempo credentials in .env file
#   - jq installed for JSON parsing
#   - Active KickTalk application generating traces

# Load Grafana credentials from .env
if [ -f .env ]; then
    export GRAFANA_TEMPO_QUERY_URL=$(grep MAIN_VITE_GRAFANA_TEMPO_QUERY_URL .env | cut -d '=' -f2 | tr -d '"')
    export GRAFANA_TEMPO_QUERY_USER=$(grep MAIN_VITE_GRAFANA_TEMPO_QUERY_USER .env | cut -d '=' -f2 | tr -d '"')
    export GRAFANA_TEMPO_QUERY_TOKEN=$(grep MAIN_VITE_GRAFANA_TEMPO_QUERY_TOKEN .env | cut -d '=' -f2 | tr -d '"')
else
    echo "❌ .env file not found. Please ensure Grafana credentials are set."
    exit 1
fi

# Validate credentials
if [ -z "$GRAFANA_TEMPO_QUERY_URL" ] || [ -z "$GRAFANA_TEMPO_QUERY_USER" ] || [ -z "$GRAFANA_TEMPO_QUERY_TOKEN" ]; then
    echo "❌ Missing Grafana credentials. Check your .env file."
    exit 1
fi

echo "✅ Grafana credentials loaded from .env"
echo "🔗 Query URL: $GRAFANA_TEMPO_QUERY_URL"
echo "👤 User: $GRAFANA_TEMPO_QUERY_USER"
echo ""

# Base curl command with authentication  
build_curl_auth() {
    echo "curl -s -u \"$GRAFANA_TEMPO_QUERY_USER:$GRAFANA_TEMPO_QUERY_TOKEN\""
}

# =============================================================================
# SEARCH FUNCTIONS - Find traces by various criteria
# =============================================================================

# Get recent traces from KickTalk service
recent_traces() {
    local limit=${1:-10}
    echo "🔍 Fetching $limit most recent KickTalk traces..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$limit" | \
    jq -r '.traces[]? | "TraceID: \(.traceID) | Duration: \(.durationMs)ms | Service: \(.rootServiceName) | Time: \(.startTimeUnixNano)"'
}

# Get short-duration traces (likely WebSocket connections)
websocket_traces() {
    local limit=${1:-15}
    echo "🔌 Searching for potential WebSocket connection traces (short duration)..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$limit" | \
    jq -r '.traces[]? | select(.durationMs < 100) | "TraceID: \(.traceID) | Duration: \(.durationMs)ms | Service: \(.rootServiceName)"'
}

# Get main process traces (startup, health checks)
main_process_traces() {
    local limit=${1:-10}
    echo "⚙️ Fetching main process traces..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$limit" | \
    jq -r '.traces[]? | select(.rootServiceName == "kicktalk") | "TraceID: \(.traceID) | Duration: \(.durationMs)ms | Service: \(.rootServiceName)"'
}

# Get renderer process traces  
renderer_traces() {
    local limit=${1:-10}
    echo "🖥️ Fetching renderer process traces..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$limit" | \
    jq -r '.traces[]? | select(.rootServiceName == "kicktalk-renderer") | "TraceID: \(.traceID) | Duration: \(.durationMs)ms | Service: \(.rootServiceName)"'
}

# =============================================================================
# ANALYSIS FUNCTIONS - Examine specific traces
# =============================================================================

# Get detailed information about a specific trace
trace_details() {
    local trace_id=$1
    if [ -z "$trace_id" ]; then
        echo "❌ Usage: trace_details <trace_id>"
        return 1
    fi
    
    echo "🔎 Analyzing trace: $trace_id"
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/traces/$trace_id" | \
    jq -r '.batches[0].scopeSpans[]? | .spans[]? | "Span: \(.name) | Duration: \((.endTimeUnixNano - .startTimeUnixNano) / 1000000)ms | Tracer: \(.scope.name // "Unknown")"'
}

# Search for WebSocket-related spans in a trace
websocket_spans() {
    local trace_id=$1
    if [ -z "$trace_id" ]; then
        echo "❌ Usage: websocket_spans <trace_id>"
        return 1
    fi
    
    echo "🔌 Searching for WebSocket spans in trace: $trace_id"
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/traces/$trace_id" | \
    jq -r '.batches[0].scopeSpans[]? | .spans[]? | select(.name | contains("websocket") or contains("kick_websocket") or contains("seventv") or contains("connect")) | "✅ WebSocket Span: \(.name) | Tracer: \(.scope.name // "Unknown") | Attributes: \(.attributes | length)"'
}

# Get span attributes for debugging
span_attributes() {
    local trace_id=$1
    local span_name=$2
    if [ -z "$trace_id" ] || [ -z "$span_name" ]; then
        echo "❌ Usage: span_attributes <trace_id> <span_name>"
        return 1
    fi
    
    echo "🏷️ Attributes for span '$span_name' in trace: $trace_id"
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/traces/$trace_id" | \
    jq -r ".batches[0].scopeSpans[]? | .spans[]? | select(.name == \"$span_name\") | .attributes[]? | \"\(.key): \(.value.stringValue // .value.intValue // .value.boolValue)\""
}

# =============================================================================
# DIAGNOSTIC FUNCTIONS - Health checks and monitoring
# =============================================================================

# Check if traces are being exported successfully
export_health() {
    echo "🏥 Checking trace export health (last 5 traces)..."
    local traces=$($(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=5" | jq -r '.traces[]?.traceID' | head -5)
    
    if [ -z "$traces" ]; then
        echo "❌ No traces found - check if application is running and exporting traces"
        return 1
    fi
    
    echo "✅ Found recent traces:"
    for trace_id in $traces; do
        echo "  📋 $trace_id"
    done
}

# Get startup performance metrics
startup_performance() {
    echo "🚀 Analyzing startup performance..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=20" | \
    jq -r '.traces[]? | select(.rootServiceName == "kicktalk" and .durationMs > 50) | "Startup Trace: \(.traceID) | Duration: \(.durationMs)ms"' | head -5
}

# Find error traces
error_traces() {
    local limit=${1:-10}
    echo "❗ Searching for potential error traces (longer duration)..."
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$limit" | \
    jq -r '.traces[]? | select(.durationMs > 1000) | "Potential Error: \(.traceID) | Duration: \(.durationMs)ms | Service: \(.rootServiceName)"'
}

# =============================================================================
# BATCH ANALYSIS FUNCTIONS - Analyze multiple traces at once
# =============================================================================

# Search multiple recent traces for WebSocket spans
find_websocket_connections() {
    echo "🔍 Searching recent traces for WebSocket connection spans..."
    local trace_ids=$($(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=10" | jq -r '.traces[]?.traceID' | head -5)
    
    for trace_id in $trace_ids; do
        echo "=== Checking trace $trace_id ==="
        websocket_spans "$trace_id"
    done
}

# Analyze trace patterns
trace_patterns() {
    echo "📊 Analyzing trace patterns..."
    echo ""
    echo "📈 Trace count by service:"
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=20" | \
    jq -r '.traces[]?.rootServiceName' | sort | uniq -c | sort -nr
    
    echo ""
    echo "⏱️ Duration distribution:"
    $(build_curl_auth) "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=20" | \
    jq -r '.traces[]? | 
    if .durationMs < 10 then "< 10ms"
    elif .durationMs < 100 then "10-100ms"  
    elif .durationMs < 1000 then "100ms-1s"
    else "> 1s"
    end' | sort | uniq -c | sort -nr
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Show available functions
help() {
    echo "🔧 Available Grafana Trace Query Functions:"
    echo ""
    echo "📋 SEARCH FUNCTIONS:"
    echo "  recent_traces [limit]           - Get recent KickTalk traces"
    echo "  websocket_traces [limit]        - Find potential WebSocket traces"
    echo "  main_process_traces [limit]     - Get main process traces"
    echo "  renderer_traces [limit]         - Get renderer process traces"
    echo ""
    echo "🔎 ANALYSIS FUNCTIONS:"
    echo "  trace_details <trace_id>        - Detailed span analysis"
    echo "  websocket_spans <trace_id>      - Find WebSocket spans in trace"
    echo "  span_attributes <trace_id> <span_name> - Show span attributes"
    echo ""
    echo "🏥 DIAGNOSTIC FUNCTIONS:"
    echo "  export_health                   - Check trace export status"
    echo "  startup_performance             - Analyze startup timing"
    echo "  error_traces [limit]            - Find potential error traces"
    echo ""
    echo "📊 BATCH ANALYSIS:"
    echo "  find_websocket_connections      - Search multiple traces for WebSocket spans"
    echo "  trace_patterns                  - Analyze trace patterns and distribution"
    echo ""
    echo "📚 EXAMPLES:"
    echo "  recent_traces 5                 # Get 5 most recent traces"
    echo "  trace_details abc123def456      # Analyze specific trace"
    echo "  find_websocket_connections      # Search for WebSocket spans"
}

# Show quick status
status() {
    echo "📊 KickTalk Trace Monitoring Status"
    echo "=================================="
    export_health
    echo ""
    echo "📈 Recent Activity:"
    recent_traces 3
}

# =============================================================================
# INITIALIZATION
# =============================================================================

# Main function dispatcher
main() {
    local func_name="${1:-help}"
    shift
    
    case "$func_name" in
        "recent_traces")
            recent_traces "$@"
            ;;
        "websocket_traces")
            websocket_traces "$@"
            ;;
        "main_process_traces")
            main_process_traces "$@"
            ;;
        "renderer_traces")
            renderer_traces "$@"
            ;;
        "trace_details")
            trace_details "$@"
            ;;
        "websocket_spans")
            websocket_spans "$@"
            ;;
        "span_attributes")
            span_attributes "$@"
            ;;
        "export_health")
            export_health "$@"
            ;;
        "startup_performance")
            startup_performance "$@"
            ;;
        "error_traces")
            error_traces "$@"
            ;;
        "find_websocket_connections")
            find_websocket_connections "$@"
            ;;
        "trace_patterns")
            trace_patterns "$@"
            ;;
        "status")
            status "$@"
            ;;
        "help")
            help "$@"
            ;;
        *)
            echo "❌ Unknown function: $func_name"
            echo ""
            help
            exit 1
            ;;
    esac
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi