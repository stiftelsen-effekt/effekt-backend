#!/usr/bin/env bash
# Builds the API image (apps/api/Dockerfile) in Cloud Build and pushes it as IMAGE (cloud.deploy.yaml).
#
# Every Cloud Build machine starts with an empty Docker cache, so this builds with BuildKit
# (buildx, docker-container driver) and keeps the layer cache of every stage in the registry,
# at CACHE: when the lockfile and the API's package.json haven't changed, neither install runs
# again and the dependency layers aren't pushed again. Only the compiled API is new.
#
# Usage: build-api-image.sh IMAGE CACHE   (run from the repository root)
set -euo pipefail

image="$1"
cache="$2"

# network=cloudbuild: the builder container reaches the registry like the build steps do
docker buildx create --name api-builder --driver docker-container \
  --driver-opt network=cloudbuild,image=mirror.gcr.io/moby/buildkit:buildx-stable-1 --use >/dev/null
docker buildx build \
  --file apps/api/Dockerfile \
  --tag "$image" \
  --cache-from "type=registry,ref=$cache" \
  --cache-to "type=registry,ref=$cache,mode=max,image-manifest=true,oci-mediatypes=true" \
  --provenance=false \
  --push \
  .
