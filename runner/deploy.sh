#!/usr/bin/env bash
# Builds the Cube runner image in Cloud Build and deploys it as the cube-runner Cloud Run job (#1935).
#   runner/deploy.sh
# Only the files the image needs are uploaded, not the whole repository.
set -euo pipefail
PROJECT=${PROJECT:-carlosm-interactive-cv}
REGION=${REGION:-us-central1}
REPO=${REPO:-cube}
JOB=${JOB:-cube-runner}
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/runner:$(git rev-parse --short HEAD)"
ROOT=$(git rev-parse --show-toplevel)

gcloud artifacts repositories describe "$REPO" --project "$PROJECT" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --project "$PROJECT" --location "$REGION" --repository-format docker --description "Cube runner images (#1935)"

CTX=$(mktemp -d)
trap 'rm -rf "$CTX"' EXIT
mkdir -p "$CTX/js" "$CTX/runner"
cp "$ROOT/js/qa-review-scripts.js" "$CTX/js/"
cp "$ROOT/runner/package.json" "$ROOT/runner/cube.js" "$ROOT/runner/run.js" "$ROOT/runner/Dockerfile" "$CTX/runner/"
printf 'steps:\n- name: gcr.io/cloud-builders/docker\n  args: [build, -f, runner/Dockerfile, -t, "%s", .]\nimages: ["%s"]\n' "$IMAGE" "$IMAGE" >"$CTX/cloudbuild.yaml"
gcloud builds submit "$CTX" --project "$PROJECT" --region "$REGION" --config "$CTX/cloudbuild.yaml"

gcloud run jobs deploy "$JOB" --project "$PROJECT" --region "$REGION" --image "$IMAGE" \
  --cpu 2 --memory 4Gi --task-timeout 15m --max-retries 0 --tasks 1 \
  --set-env-vars "CUBE_WORKERS=2,CUBE_BUCKET=$PROJECT.firebasestorage.app"
echo "Deployed $IMAGE as $JOB"
