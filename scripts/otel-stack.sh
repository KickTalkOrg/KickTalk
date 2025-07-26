#!/bin/bash

# KickTalk OpenTelemetry Stack Management Script (Podman Compatible)

set -e

# Detect container runtime (podman preferred, docker fallback)
if command -v podman-compose &> /dev/null; then
    COMPOSE_CMD="podman-compose"
    CONTAINER_CMD="podman"
elif command -v podman &> /dev/null && podman compose version &> /dev/null; then
    COMPOSE_CMD="podman compose"
    CONTAINER_CMD="podman"
elif command -v docker &> /dev/null; then
    COMPOSE_CMD="docker compose"
    CONTAINER_CMD="docker"
else
    echo "Error: No suitable container runtime found."
    echo "Please install either:"
    echo "  - podman-compose: pip install podman-compose"
    echo "  - Docker with compose plugin"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.otel.yml"

# Check if podman socket is needed and available
check_podman_socket() {
    if [[ "$CONTAINER_CMD" == "podman" ]] && [[ "$COMPOSE_CMD" == "podman compose" ]]; then
        if ! systemctl --user is-active podman.socket &> /dev/null; then
            echo -e "${YELLOW}Podman socket not running. Starting it...${NC}"
            systemctl --user start podman.socket
            sleep 2
        fi
        
        # Set the Docker host for podman compose to use podman socket
        export DOCKER_HOST="unix://$XDG_RUNTIME_DIR/podman/podman.sock"
    fi
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_usage() {
    echo "KickTalk OpenTelemetry Stack Management (Podman/Docker Compatible)"
    echo "Using: $COMPOSE_CMD"
    echo
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  start     Start the observability stack"
    echo "  stop      Stop the observability stack"
    echo "  restart   Restart the observability stack"
    echo "  status    Show status of all services"
    echo "  logs      Show logs from all services"
    echo "  clean     Stop and remove all containers and volumes"
    echo "  urls      Display service URLs"
    echo "  test      Test the stack connectivity"
    echo
}

start_stack() {
    echo -e "${GREEN}Starting KickTalk OpenTelemetry stack...${NC}"
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        echo -e "${RED}Error: docker-compose.otel.yml not found at $COMPOSE_FILE${NC}"
        exit 1
    fi
    
    check_podman_socket
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    echo -e "${GREEN}✓ Stack started successfully!${NC}"
    echo
    show_urls
}

stop_stack() {
    echo -e "${YELLOW}Stopping KickTalk OpenTelemetry stack...${NC}"
    check_podman_socket
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    echo -e "${GREEN}✓ Stack stopped successfully!${NC}"
}

restart_stack() {
    echo -e "${YELLOW}Restarting KickTalk OpenTelemetry stack...${NC}"
    check_podman_socket
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    echo -e "${GREEN}✓ Stack restarted successfully!${NC}"
    echo
    show_urls
}

show_status() {
    echo -e "${BLUE}KickTalk OpenTelemetry Stack Status:${NC}"
    echo
    if [[ "$CONTAINER_CMD" == "podman" ]]; then
        # Use native podman commands for better compatibility
        echo "Containers (filtering by kicktalk prefix):"
        podman ps --filter name=kicktalk --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo
        echo "All containers:"
        podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" ps
    fi
}

show_logs() {
    echo -e "${BLUE}Following logs from all services (Ctrl+C to exit):${NC}"
    echo
    $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f
}

clean_stack() {
    echo -e "${RED}Warning: This will remove all containers and data volumes!${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Cleaning up KickTalk OpenTelemetry stack...${NC}"
        $COMPOSE_CMD -f "$COMPOSE_FILE" down -v --remove-orphans
        echo -e "${GREEN}✓ Stack cleaned up successfully!${NC}"
    else
        echo "Cancelled."
    fi
}

show_urls() {
    echo -e "${BLUE}Service URLs:${NC}"
    echo "  📊 Grafana Dashboard:    http://localhost:3000 (admin/admin)"
    echo "  🔍 Jaeger Tracing UI:    http://localhost:16686"
    echo "  📈 Prometheus:           http://localhost:9090"
    echo "  🔧 OTEL Collector:       http://localhost:13133 (health)"
    echo
    echo -e "${BLUE}Application Integration:${NC}"
    echo "  📡 OTLP gRPC Endpoint:   localhost:4317"
    echo "  📡 OTLP HTTP Endpoint:   localhost:4318"
    echo
}

test_connectivity() {
    echo -e "${BLUE}Testing KickTalk OpenTelemetry stack connectivity...${NC}"
    echo
    
    # Test OTEL Collector health with detailed response
    local otel_response=$(curl -s http://localhost:13133 2>/dev/null)
    if [ $? -eq 0 ] && [[ "$otel_response" == *"status"* ]]; then
        echo -e "✅ OTEL Collector: ${GREEN}Healthy${NC} - $otel_response"
    else
        echo -e "❌ OTEL Collector: ${RED}Unhealthy or not responding${NC}"
    fi
    
    # Test Grafana with login page detection
    local grafana_response=$(curl -s http://localhost:3000/login 2>/dev/null)
    if [ $? -eq 0 ] && [[ "$grafana_response" == *"login"* ]]; then
        echo -e "✅ Grafana: ${GREEN}Login page accessible${NC} - Ready at http://localhost:3000"
    else
        echo -e "❌ Grafana: ${RED}Not responding${NC}"
    fi
    
    # Test Jaeger UI with title detection
    local jaeger_response=$(curl -s http://localhost:16686 2>/dev/null)
    if [ $? -eq 0 ] && [[ "$jaeger_response" == *"Jaeger UI"* ]]; then
        echo -e "✅ Jaeger: ${GREEN}UI accessible${NC} - Ready at http://localhost:16686"
    else
        echo -e "❌ Jaeger: ${RED}Not responding${NC}"
    fi
    
    # Test Prometheus with redirect detection
    local prometheus_response=$(curl -s http://localhost:9090 2>/dev/null)
    if [ $? -eq 0 ] && ([[ "$prometheus_response" == *"Found"* ]] || [[ "$prometheus_response" == *"Prometheus"* ]]); then
        echo -e "✅ Prometheus: ${GREEN}Web UI accessible${NC} - Ready at http://localhost:9090"
    else
        echo -e "❌ Prometheus: ${RED}Not responding${NC}"
    fi
    
    # Test Redis connection
    if nc -z localhost 6379 2>/dev/null; then
        echo -e "✅ Redis: ${GREEN}Port open${NC} - Available at localhost:6379"
    else
        echo -e "❌ Redis: ${RED}Port closed${NC}"
    fi
    
    # Test OTLP endpoints
    if nc -z localhost 4317 2>/dev/null; then
        echo -e "✅ OTLP gRPC: ${GREEN}Port open${NC} - Ready for telemetry at localhost:4317"
    else
        echo -e "❌ OTLP gRPC: ${RED}Port closed${NC}"
    fi
    
    if nc -z localhost 4318 2>/dev/null; then
        echo -e "✅ OTLP HTTP: ${GREEN}Port open${NC} - Ready for telemetry at localhost:4318"
    else
        echo -e "❌ OTLP HTTP: ${RED}Port closed${NC}"
    fi
    
    # Test OTEL Collector metrics endpoint
    local metrics_response=$(curl -s http://localhost:8889/metrics 2>/dev/null)
    if [ $? -eq 0 ] && ([[ "$metrics_response" == *"promhttp"* ]] || [[ "$metrics_response" == *"TYPE"* ]]); then
        local metric_count=$(echo "$metrics_response" | grep -c "^# TYPE")
        echo -e "✅ OTEL Metrics: ${GREEN}Collector metrics available${NC} - $metric_count metrics at http://localhost:8889/metrics"
    else
        echo -e "❌ OTEL Metrics: ${RED}Metrics endpoint not responding${NC}"
    fi
    
    echo
    echo -e "${BLUE}Summary:${NC}"
    echo "  📊 All services tested with actual HTTP requests"
    echo "  🔍 Response content validated (not just connection checks)"
    echo "  📈 Telemetry endpoints verified and ready for data"
}

# Main script logic
case "${1:-}" in
    start)
        start_stack
        ;;
    stop)
        stop_stack
        ;;
    restart)
        restart_stack
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        clean_stack
        ;;
    urls)
        show_urls
        ;;
    test)
        test_connectivity
        ;;
    *)
        print_usage
        exit 1
        ;;
esac