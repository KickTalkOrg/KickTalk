#!/bin/bash

# KickTalk Grafana Cloud Trace Queries - Manual Testing
# This script provides curl commands to query and analyze traces from Grafana Cloud Tempo
# 
# Usage: 
#   ./manual-tests/grafana-trace-queries.sh [function_name] [args...]
#   VERBOSE=1 ./manual-tests/grafana-trace-queries.sh [function_name] [args...]  # Show connection info
#   
# Examples:
#   ./manual-tests/grafana-trace-queries.sh recent_traces 5
#   ./manual-tests/grafana-trace-queries.sh help
#   ./manual-tests/grafana-trace-queries.sh status
#   VERBOSE=1 ./manual-tests/grafana-trace-queries.sh status  # Show credentials
#
# Configuration:
#   FETCH_LIMIT=50              # Number of traces to fetch from API
#   WEBSOCKET_DURATION_THRESHOLD=100ms  # Max duration for WebSocket traces  
#   ERROR_DURATION_THRESHOLD=1000ms     # Min duration for error traces
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

# Only show credentials info if VERBOSE is set
if [ "${VERBOSE:-0}" = "1" ]; then
    echo "✅ Grafana credentials loaded from .env"
    echo "🔗 Query URL: $GRAFANA_TEMPO_QUERY_URL"
    echo "👤 User: $GRAFANA_TEMPO_QUERY_USER"
    echo ""
fi

# Configuration constants
readonly FETCH_LIMIT=50
readonly WEBSOCKET_DURATION_THRESHOLD=100
readonly ERROR_DURATION_THRESHOLD=1000

# Base curl command with authentication  
build_curl_auth() {
    curl -s -u "$GRAFANA_TEMPO_QUERY_USER:$GRAFANA_TEMPO_QUERY_TOKEN" "$@"
}

# Common trace output formatting
format_trace_output() {
    awk -F'\t' '{printf "Time: %s | TraceID: %s | Duration: %sms | Service: %s | Name: %s\n", strftime("%Y-%m-%d %H:%M:%S UTC", $1/1000000000), $2, $3, $4, $5}'
}

# =============================================================================
# SEARCH FUNCTIONS - Find traces by various criteria
# =============================================================================

# Get recent traces - supports: last [limit] [service_filter]
last() {
    local limit=${1:-10}
    local service_filter=${2:-""}
    
    if [ -n "$service_filter" ]; then
        case "$service_filter" in
            "main")
                echo "🔍 Fetching $limit most recent main process traces..."
                local jq_filter='select(.rootServiceName == "kicktalk")'
                ;;
            "renderer")
                echo "🔍 Fetching $limit most recent renderer process traces..."
                local jq_filter='select(.rootServiceName == "kicktalk-renderer")'
                ;;
            "websocket"|"ws")
                echo "🔍 Fetching $limit most recent WebSocket traces..."
                local jq_filter='select(.durationMs < '$WEBSOCKET_DURATION_THRESHOLD')'
                ;;
            "errors"|"error")
                echo "🔍 Fetching $limit most recent error traces (slow operations)..."
                local jq_filter='select(.durationMs > '$ERROR_DURATION_THRESHOLD')'
                ;;
            *)
                echo "❌ Unknown service filter: $service_filter"
                echo "Available filters: main, renderer, websocket (or ws), errors"
                return 1
                ;;
        esac
    else
        echo "🔍 Fetching $limit most recent KickTalk traces..."
        local jq_filter='.'
    fi
    
    build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$FETCH_LIMIT" | \
    jq -r '.traces[] | '"$jq_filter"' | [.startTimeUnixNano, .traceID, .durationMs, .rootServiceName, .rootTraceName] | @tsv' | \
    sort -rn | head -n "$limit" | \
    format_trace_output
}



# =============================================================================
# ANALYSIS FUNCTIONS - Examine specific traces
# =============================================================================

# Get detailed information about one or more traces - short alias: details
details() {
    if [ $# -eq 0 ]; then
        echo "❌ Usage: details <trace_id1> [trace_id2] [trace_id3] ..."
        return 1
    fi
    
    local trace_count=$#
    if [ $trace_count -eq 1 ]; then
        echo "🔎 Analyzing trace: $1"
    else
        echo "🔎 Analyzing $trace_count traces: $*"
    fi
    echo ""
    
    local trace_num=1
    for trace_id in "$@"; do
        if [ $trace_count -gt 1 ]; then
            echo "═══════════════════════════════════════════════════════════════════"
            echo "🔢 TRACE $trace_num/$trace_count: $trace_id"
            echo "═══════════════════════════════════════════════════════════════════"
        fi
        
        local trace_data=$(build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/traces/$trace_id")
        
        if [ -z "$trace_data" ] || echo "$trace_data" | jq -e '.batches' >/dev/null 2>&1; then
            # Show trace summary with resource attributes
            echo "📊 TRACE SUMMARY"
            echo "==============="
            echo "$trace_data" | jq -r '
                .batches[0].resource.attributes[] | 
                "  \(.key): \(.value.stringValue // .value.intValue // .value.boolValue // .value.doubleValue // "N/A")"
            '
            echo ""
            
            # Show detailed spans
            echo "🔍 SPANS BREAKDOWN"
            echo "=================="
            echo "$trace_data" | jq -r '
                # Handle both scopeSpans (API) and instrumentationLibrarySpans (export) formats
                (.batches[0].scopeSpans[]? // .batches[0].instrumentationLibrarySpans[]?) | 
                (.scope // .instrumentationLibrary) as $scope | 
                .spans[]? | 
                "📋 Span: \(.name)
├─ Library: \($scope.name // "Unknown") v\($scope.version // "N/A")  
├─ Start: \((.startTimeUnixNano | tonumber) / 1000000000 | strftime("%Y-%m-%d %H:%M:%S UTC"))
├─ Duration: \(((.endTimeUnixNano | tonumber) - (.startTimeUnixNano | tonumber)) / 1000000)ms
├─ Span ID: \(.spanId)
├─ Parent ID: \(.parentSpanId // "(none)")
├─ Trace ID: \(.traceId)
├─ Status: \(.status.code // 0 | if . == 0 then "OK" elif . == 1 then "CANCELLED" elif . == 2 then "ERROR" else "UNKNOWN" end)\(.status.message // "" | if . != "" then " (\(.))" else "" end)
├─ Kind: \(.kind // "SPAN_KIND_UNSPECIFIED" | 
  if . == "SPAN_KIND_INTERNAL" or . == 0 then "INTERNAL"
  elif . == "SPAN_KIND_SERVER" or . == 1 then "SERVER" 
  elif . == "SPAN_KIND_CLIENT" or . == 2 then "CLIENT"
  elif . == "SPAN_KIND_PRODUCER" or . == 3 then "PRODUCER"
  elif . == "SPAN_KIND_CONSUMER" or . == 4 then "CONSUMER"
  else "UNSPECIFIED" end)
├─ Dropped: Attrs(\(.droppedAttributesCount // 0)) Events(\(.droppedEventsCount // 0)) Links(\(.droppedLinksCount // 0))
└─ Span Attributes (\(.attributes | length)):
\(if (.attributes | length) > 0 then (.attributes | map("   • \(.key): \(.value.stringValue // .value.intValue // .value.boolValue // .value.doubleValue // "N/A")") | join("\n")) else "   (no span attributes)" end)
"
            '
        else
            echo "❌ Failed to fetch or parse trace data for: $trace_id"
        fi
        
        if [ $trace_count -gt 1 ] && [ $trace_num -lt $trace_count ]; then
            echo ""
        fi
        
        ((trace_num++))
    done
}



# =============================================================================
# DIAGNOSTIC FUNCTIONS - Health checks and monitoring
# =============================================================================

# Check if traces are being exported successfully
export_health() {
    echo "🏥 Checking trace export health (last 5 traces)..."
    local trace_data=$(build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$FETCH_LIMIT" | \
    jq -r '.traces[] | [.startTimeUnixNano, .traceID] | @tsv' | \
    sort -rn | head -5)
    
    if [ -z "$trace_data" ]; then
        echo "❌ No traces found - check if application is running and exporting traces"
        return 1
    fi
    
    echo "✅ Found recent traces:"
    echo "$trace_data" | awk -F'\t' '{printf "  📋 %s (Time: %s)\n", $2, strftime("%Y-%m-%d %H:%M:%S UTC", $1/1000000000)}'
}

# Get startup performance metrics
startup_performance() {
    echo "🚀 Analyzing startup performance..."
    build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=$FETCH_LIMIT" | \
    jq -r '.traces[] | select(.rootServiceName == "kicktalk" and .durationMs > 50) | [.startTimeUnixNano, .traceID, .durationMs, .rootServiceName, .rootTraceName] | @tsv' | \
    sort -rn | head -5 | \
    format_trace_output
}


# =============================================================================
# BATCH ANALYSIS FUNCTIONS - Analyze multiple traces at once
# =============================================================================


# Analyze trace patterns
trace_patterns() {
    echo "📊 Analyzing trace patterns..."
    echo ""
    echo "📈 Trace count by service:"
    build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=20" | \
    jq -r '.traces[]?.rootServiceName' | sort | uniq -c | sort -nr
    
    echo ""
    echo "⏱️ Duration distribution:"
    build_curl_auth "$GRAFANA_TEMPO_QUERY_URL/api/search?tags=service.name%3Dkicktalk&limit=20" | \
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
    echo "🔧 Grafana Trace Query Commands:"
    echo ""
    echo "🚀 PRIMARY COMMANDS (Short & Simple):"
    echo "  last [limit] [filter]           - Get recent traces"
    echo "    Filters: main, renderer, websocket (or ws), errors"
    echo "  details <trace_id> [trace_id2...] - Detailed trace analysis (supports multiple IDs)"
    echo ""
    echo "📚 EXAMPLES:"
    echo "  last 5                          # 5 most recent traces"
    echo "  last 10 main                    # 10 main process traces"  
    echo "  last 5 renderer                 # 5 renderer traces"
    echo "  last 3 websocket                # 3 WebSocket traces"
    echo "  last 5 errors                   # 5 recent error/slow traces"
    echo "  details abc123def456            # Analyze single trace"
    echo "  details trace1 trace2 trace3    # Analyze multiple traces"
    echo ""
    echo "📋 ADDITIONAL FUNCTIONS:"
    echo "  export_health                   - Check trace export status"
    echo "  startup_performance             - Analyze startup timing"
    echo "  trace_patterns                  - Analyze trace patterns and distribution"
    echo "  status                          - Quick health check"
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
        # Short aliases (primary commands)
        "last")
            last "$@"
            ;;
        "details")
            details "$@"
            ;;
        
        "export_health")
            export_health "$@"
            ;;
        "startup_performance")
            startup_performance "$@"
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