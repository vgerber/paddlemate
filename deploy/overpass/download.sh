#!/bin/sh
# Resumable planet download for the rivers-only Overpass instance.
# Runs detached in a container, so it survives the ssh session.
#   ./download.sh start   - start or resume (safe to rerun; exits when done)
#   ./download.sh stop    - pause (resume later with start)
#   ./download.sh status  - progress
DIR="$(cd "$(dirname "$0")" && pwd)/planet"
URL=https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf
DOCKER=/usr/local/bin/docker
case "$1" in
  start)
    mkdir -p "$DIR"
    $DOCKER rm -f osm-download 2>/dev/null
    $DOCKER run -d --name osm-download --rm -v "$DIR":/data curlimages/curl:latest \
      sh -c "curl -L --retry 20 --retry-delay 60 --retry-all-errors -C - -o /data/planet-latest.osm.pbf $URL 2>/data/download.log && touch /data/DOWNLOAD_DONE"
    ;;
  stop)
    $DOCKER stop osm-download
    ;;
  status)
    [ -f "$DIR"/DOWNLOAD_DONE ] && echo "done"
    ls -la "$DIR"/planet-latest.osm.pbf 2>/dev/null
    tail -c 300 "$DIR"/download.log 2>/dev/null; echo
    $DOCKER ps | grep osm-download || echo "not running"
    ;;
  *) echo "usage: $0 start|stop|status" ;;
esac
