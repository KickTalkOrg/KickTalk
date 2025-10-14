# KickTalk OpenTelemetry Setup

This directory contains the OpenTelemetry observability stack for KickTalk application monitoring, including distributed tracing, metrics collection, and log aggregation.

## Architecture

- **OpenTelemetry Collector**: Receives, processes, and exports telemetry data
- **Jaeger**: Distributed tracing backend and UI
- **Prometheus**: Metrics storage and querying
- **Grafana**: Visualization and dashboards
- **Redis**: Optional caching for telemetry data

## Quick Start

1. **Start the observability stack:**
   ```bash
   docker-compose -f docker-compose.otel.yml up -d
   ```

2. **Access the services:**
   - **Grafana Dashboard**: http://localhost:3000 (admin/admin)
   - **Jaeger UI**: http://localhost:16686
   - **Prometheus**: http://localhost:9090
   - **OTEL Collector Health**: http://localhost:13133

3. **Configure KickTalk** to send telemetry to:
   - **OTLP gRPC**: `http://localhost:4317`
   - **OTLP HTTP**: `http://localhost:4318`

## Configuration

### OTEL Collector (`collector-config.yml`)

The collector is configured to:
- **Receive** telemetry via OTLP (gRPC/HTTP)
- **Process** data with batching, memory limiting, and attribute filtering
- **Export** traces to Jaeger, metrics to Prometheus, and logs to files

Key features:
- **Privacy-focused**: Automatically filters sensitive data (tokens, auth info)
- **Resource attribution**: Adds service.name, version, environment tags
- **Performance optimized**: Batching and memory limits configured

### Prometheus (`prometheus.yml`)

Scrapes metrics from:
- OTEL Collector internal metrics
- KickTalk application metrics (port 9464)
- Jaeger metrics for tracing health

### Grafana Dashboards

Pre-configured dashboards for:
- **KickTalk Overview**: Application health, connections, message throughput
- **Memory & Performance**: Resource usage, API response times
- **Connection Health**: WebSocket stability, reconnection rates

## Application Integration

To integrate KickTalk with this observability stack, the application needs to:

1. **Install OTEL SDK** packages for Node.js/Electron
2. **Configure exporters** to send data to `localhost:4317`
3. **Implement metrics** for key application events
4. **Add tracing** to critical code paths

## Metrics to Implement

### Connection Metrics
- `kicktalk_websocket_connections_active` - Active WebSocket connections
- `kicktalk_websocket_reconnections_total` - Connection reconnection events
- `kicktalk_connection_errors_total` - Connection failure events

### Message Metrics  
- `kicktalk_messages_sent_total` - Messages sent by user
- `kicktalk_messages_received_total` - Messages received from chat
- `kicktalk_message_send_duration_seconds` - Message send latency

### Resource Metrics
- `kicktalk_memory_usage_bytes` - Application memory consumption
- `kicktalk_cpu_usage_percent` - CPU utilization
- `kicktalk_open_handles_total` - File/socket handles

### API Metrics
- `kicktalk_api_request_duration_seconds` - API response times
- `kicktalk_api_requests_total` - API request counts by endpoint/status

## Traces to Implement

### User Actions
- Message sending flow (input → validation → API → confirmation)
- Chatroom joining/leaving
- Settings changes

### System Operations  
- WebSocket connection establishment
- API calls (Kick, 7TV)
- Emote loading and caching

### Error Scenarios
- Connection failures and recovery
- API timeouts and retries
- Memory leak detection points

## Privacy & Security

The collector configuration includes privacy protections:
- **Automatic filtering** of authentication tokens
- **Local-only operation** by default
- **Configurable data retention** periods
- **No PII collection** in standard metrics

## Development Usage

### View Real-time Metrics
```bash
# Watch collector logs
docker-compose -f docker-compose.otel.yml logs -f otel-collector

# Query Prometheus directly
curl http://localhost:9090/api/v1/query?query=up

# Check collector health
curl http://localhost:13133
```

### Custom Dashboards

Add custom dashboard JSON files to `otel/grafana/dashboards/` and they'll be automatically loaded into Grafana.

### Testing Telemetry

Send test traces/metrics to the collector:
```bash
# Test OTLP HTTP endpoint
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[...]}'
```

## Production Considerations

For production deployment:
- Use external Prometheus/Jaeger instances
- Configure authentication for Grafana
- Set up alerting rules in Prometheus
- Implement log rotation and retention policies
- Consider using OTEL Collector in agent/gateway mode

## Stopping the Stack

```bash
docker-compose -f docker-compose.otel.yml down
```

To remove all data:
```bash
docker-compose -f docker-compose.otel.yml down -v
```