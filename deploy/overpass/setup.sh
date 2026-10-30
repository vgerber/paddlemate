#!/bin/sh
# Filter the downloaded planet file to the rivers-only dataset and start
# the Overpass import. Run on the NAS after ./download.sh reports done.
#
# The filter runs detached (it takes hours), so run this script twice:
#   1st run - starts the filter container (watch: docker logs -f osm-filter)
#   2nd run - once FILTER_DONE exists, starts the Overpass import/serve
# Safe to rerun anytime; an already-imported db just resumes serving.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER=/usr/local/bin/docker
COMPOSE=/usr/local/bin/docker-compose

if [ ! -f "$DIR/planet/DOWNLOAD_DONE" ]; then
  echo "planet file not fully downloaded yet - run ./download.sh start"
  exit 1
fi

if [ ! -f "$DIR/planet/FILTER_DONE" ]; then
  if $DOCKER ps | grep -q osm-filter; then
    echo "filter still running - watch with: $DOCKER logs -f osm-filter"
    exit 0
  fi
  echo "Starting detached filter (rivers, whitewater, camp sites, boundaries, valleys)..."
  $DOCKER rm -f osm-filter 2>/dev/null || true
  # The image's entrypoint is osmium itself, so a shell needs --entrypoint.
  # whitewater covers put-in/egress/rapid nodes; camp sites support trip
  # planning around a river. Both are tiny next to the river ways.
  $DOCKER run -d --name osm-filter --entrypoint sh -v "$DIR/planet":/data iboates/osmium:latest \
    -c "osmium tags-filter /data/planet-latest.osm.pbf \
      w/waterway=river,stream \
      wr/water=river \
      wr/natural=valley \
      nwr/whitewater \
      nwr/tourism=camp_site \
      r/boundary=administrative \
      r/place=region \
      -o /data/rivers-planet.osm.bz2 --overwrite \
      && touch /data/FILTER_DONE"
  echo "Filter started - rerun this script when it is done."
  exit 0
fi
ls -la "$DIR/planet/rivers-planet.osm.bz2"

echo "Starting Overpass (first start imports the file - hours; watch with"
echo "  $DOCKER logs -f paddlemate-overpass)"
mkdir -p "$DIR/db" && chmod 777 "$DIR/db"
cd "$DIR" && $COMPOSE up -d
