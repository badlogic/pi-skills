#!/bin/bash
# Manage SearXNG Docker container for searxng-search skill

set -e

CONTAINER_NAME="searxng"
PORT="8080"
CONFIG_DIR="${HOME}/searxng-simple/config"
DATA_DIR="${HOME}/searxng-simple/data"
IMAGE="docker.io/searxng/searxng:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
}

check_status() {
    if docker ps --filter "name=${CONTAINER_NAME}" --filter "status=running" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
        return 0
    else
        return 1
    fi
}

show_status() {
    if check_status; then
        print_status "SearXNG is running on http://localhost:${PORT}"
        echo ""
        echo "Container info:"
        docker ps --filter "name=${CONTAINER_NAME}" --format "  ID: {{.ID}}\n  Image: {{.Image}}\n  Status: {{.Status}}\n  Ports: {{.Ports}}"
    else
        if docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
            print_warning "SearXNG container exists but is not running"
            echo "  Use: $0 start"
        else
            print_warning "SearXNG container does not exist"
            echo "  Use: $0 setup"
        fi
    fi
}

setup_config() {
    mkdir -p "${CONFIG_DIR}" "${DATA_DIR}"
    
    if [ ! -f "${CONFIG_DIR}/settings.yml" ]; then
        print_status "Creating default SearXNG configuration..."
        cat > "${CONFIG_DIR}/settings.yml" << 'EOF'
# SearXNG configuration for local development
use_default_settings: true

general:
    instance_name: "SearXNG (Local)"
    
server:
    secret_key: "changeme_$(openssl rand -hex 32)"
    limiter: false
    image_proxy: true

search:
    formats:
        - html
        - json

ui:
    default_locale: "en"
    query_in_title: true
    infinite_scroll: true
EOF
        print_status "Created ${CONFIG_DIR}/settings.yml"
    else
        print_status "Configuration already exists at ${CONFIG_DIR}/settings.yml"
        
        # Check if JSON format is enabled
        if ! grep -q "json" "${CONFIG_DIR}/settings.yml"; then
            print_warning "JSON format not found in config - this is required for the skill!"
            print_warning "Please add 'json' to the formats list in ${CONFIG_DIR}/settings.yml"
        fi
    fi
}

setup() {
    check_docker
    
    echo "Setting up SearXNG for searxng-search skill..."
    echo ""
    
    # Setup config
    setup_config
    
    # Pull image
    print_status "Pulling SearXNG Docker image..."
    docker pull "${IMAGE}"
    
    # Start container
    start
}

start() {
    check_docker
    
    if check_status; then
        print_status "SearXNG is already running"
        return 0
    fi
    
    # Check if container exists but is stopped
    if docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
        print_status "Starting existing SearXNG container..."
        docker start "${CONTAINER_NAME}"
    else
        # Create config if it doesn't exist
        if [ ! -f "${CONFIG_DIR}/settings.yml" ]; then
            setup_config
        fi
        
        print_status "Creating and starting SearXNG container..."
        docker run --name "${CONTAINER_NAME}" -d \
            -p "${PORT}:8080" \
            -v "${CONFIG_DIR}:/etc/searxng/" \
            -v "${DATA_DIR}:/var/cache/searxng/" \
            --restart unless-stopped \
            "${IMAGE}"
    fi
    
    # Wait for container to be healthy
    echo -n "Waiting for SearXNG to start"
    for i in {1..30}; do
        if curl -sf "http://localhost:${PORT}" > /dev/null 2>&1; then
            echo ""
            print_status "SearXNG is ready at http://localhost:${PORT}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo ""
    print_error "SearXNG failed to start within 30 seconds"
    echo "Check logs with: docker logs ${CONTAINER_NAME}"
    return 1
}

stop() {
    check_docker
    
    if ! check_status; then
        print_warning "SearXNG is not running"
        return 0
    fi
    
    print_status "Stopping SearXNG..."
    docker stop "${CONTAINER_NAME}"
    print_status "Stopped"
}

restart() {
    stop
    sleep 2
    start
}

remove() {
    check_docker
    
    if check_status; then
        print_status "Stopping SearXNG..."
        docker stop "${CONTAINER_NAME}"
    fi
    
    if docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}}' | grep -q "${CONTAINER_NAME}"; then
        print_status "Removing container..."
        docker rm "${CONTAINER_NAME}"
        print_status "Container removed (config and data preserved)"
    else
        print_warning "No container to remove"
    fi
}

logs() {
    check_docker
    docker logs -f "${CONTAINER_NAME}"
}

usage() {
    cat << EOF
Usage: $0 <command>

Commands:
    status      Show SearXNG status
    setup       Initial setup (config + start)
    start       Start SearXNG container
    stop        Stop SearXNG container
    restart     Restart SearXNG container
    remove      Remove container (keeps config and data)
    logs        Show container logs (follow mode)

Configuration location: ${CONFIG_DIR}
Data location: ${DATA_DIR}
EOF
}

# Main command dispatcher
case "${1:-status}" in
    status)
        check_docker
        show_status
        ;;
    setup)
        setup
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    remove)
        remove
        ;;
    logs)
        logs
        ;;
    *)
        usage
        exit 1
        ;;
esac
