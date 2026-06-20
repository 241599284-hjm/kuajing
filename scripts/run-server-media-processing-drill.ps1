param(
  [string]$HostName = "170.106.136.169",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$remoteScript = @'
set -euo pipefail

cd /opt/crossborder-commerce-kit/current

correlation_id="media-processing-drill-$(cat /proc/sys/kernel/random/uuid)"
gif_file="/tmp/$correlation_id.gif"
mp4_file="/tmp/$correlation_id.mp4"
gif_payload_file=""
mp4_payload_file=""

cleanup() {
  set +e
  for payload_file in "$gif_payload_file" "$mp4_payload_file"; do
    if [ -n "$payload_file" ] && [ -s "$payload_file" ]; then
      asset_id="$(python3 -c "import json; print(json.load(open('$payload_file')).get('assetId',''))" 2>/dev/null)"
      object_key="$(python3 -c "import json; print(json.load(open('$payload_file')).get('objectKey',''))" 2>/dev/null)"
      poster_key="$(python3 -c "import json; p=json.load(open('$payload_file')); print((p.get('responsiveSources') or [{}])[0].get('objectKey',''))" 2>/dev/null)"
      for key in "$object_key" "$poster_key"; do
        if [ -n "$asset_id" ] && [ -n "$key" ]; then
          delete_object "$asset_id" "$key"
        fi
      done
    fi
  done
  rm -f "$gif_file" "$mp4_file" "$gif_payload_file" "$mp4_payload_file"
  docker exec cbck-media-service rm -f "/tmp/$correlation_id.gif" "/tmp/$correlation_id.mp4" >/dev/null 2>&1
}

trap cleanup EXIT

docker exec cbck-media-service ffmpeg -version >/dev/null
docker exec cbck-media-service ffmpeg -y -v error -f lavfi -i "color=c=blue:s=80x60:d=0.6" -vf fps=5 "/tmp/$correlation_id.gif"
docker exec cbck-media-service ffmpeg -y -v error -f lavfi -i "color=c=green:s=96x64:d=0.5" -pix_fmt yuv420p "/tmp/$correlation_id.mp4"
docker cp "cbck-media-service:/tmp/$correlation_id.gif" "$gif_file" >/dev/null
docker cp "cbck-media-service:/tmp/$correlation_id.mp4" "$mp4_file" >/dev/null

minio_stat() {
  docker exec -w /workspace/services/media-service -e OBJECT_KEY="$1" cbck-media-service node --input-type=module -e '
    import { Client } from "minio";
    const endpoint = new URL(process.env.MINIO_ENDPOINT);
    const client = new Client({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port || 9000),
      useSSL: endpoint.protocol === "https:",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY
    });
    await client.statObject(process.env.OBJECT_STORAGE_BUCKET, process.env.OBJECT_KEY);
  ' >/dev/null 2>&1
}

minio_hash() {
  docker exec -w /workspace/services/media-service -e OBJECT_KEY="$1" cbck-media-service node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { Client } from "minio";
    const endpoint = new URL(process.env.MINIO_ENDPOINT);
    const client = new Client({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port || 9000),
      useSSL: endpoint.protocol === "https:",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY
    });
    const stream = await client.getObject(process.env.OBJECT_STORAGE_BUCKET, process.env.OBJECT_KEY);
    const hash = createHash("sha256");
    for await (const chunk of stream) hash.update(chunk);
    process.stdout.write(hash.digest("hex"));
  '
}

upload_media() {
  local file="$1"
  local mime="$2"
  curl -fsS -X POST http://127.0.0.1:4001/media/product-assets \
    -H "x-admin-actor: server-media-drill" \
    -H "x-correlation-id: $correlation_id" \
    -F "file=@$file;type=$mime"
}

delete_object() {
  local asset_id="$1"
  local object_key="$2"
  curl -fsS -X DELETE http://127.0.0.1:4001/media/product-assets \
    -H "Content-Type: application/json" \
    -H "x-admin-actor: server-media-drill" \
    -H "x-correlation-id: $correlation_id" \
    --data "{\"assetId\":\"$asset_id\",\"objectKey\":\"$object_key\",\"reason\":\"server media processing drill cleanup\"}" >/dev/null
}

assert_upload() {
  local payload_file="$1"
  local expected_width="$2"
  local expected_height="$3"
  python3 - "$payload_file" "$expected_width" "$expected_height" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
assert payload["kind"] == "video"
assert payload["mimeType"] == "video/mp4"
assert payload["width"] == int(sys.argv[2])
assert payload["height"] == int(sys.argv[3])
assert payload["durationSeconds"] > 0
assert payload["url"].startswith("/media/public/")
assert payload["posterUrl"].startswith("/media/public/")
assert all(not value.startswith("http://") for value in payload["variants"].values())
assert len(payload["responsiveSources"]) == 1
assert payload["responsiveSources"][0]["mimeType"] == "image/webp"
assert payload["responsiveSources"][0]["url"].startswith("/media/public/")
PY
}

gif_payload_file="$(mktemp)"
mp4_payload_file="$(mktemp)"
upload_media "$gif_file" image/gif > "$gif_payload_file"
upload_media "$mp4_file" video/mp4 > "$mp4_payload_file"
assert_upload "$gif_payload_file" 80 60
assert_upload "$mp4_payload_file" 96 64

gif_asset_id="$(python3 -c "import json; print(json.load(open('$gif_payload_file'))['assetId'])")"
gif_key="$(python3 -c "import json; print(json.load(open('$gif_payload_file'))['objectKey'])")"
gif_poster_key="$(python3 -c "import json; print(json.load(open('$gif_payload_file'))['responsiveSources'][0]['objectKey'])")"
mp4_asset_id="$(python3 -c "import json; print(json.load(open('$mp4_payload_file'))['assetId'])")"
mp4_key="$(python3 -c "import json; print(json.load(open('$mp4_payload_file'))['objectKey'])")"
mp4_public_path="$(python3 -c "import json; print(json.load(open('$mp4_payload_file'))['url'])")"
mp4_poster_key="$(python3 -c "import json; print(json.load(open('$mp4_payload_file'))['responsiveSources'][0]['objectKey'])")"

for key in "$gif_key" "$gif_poster_key" "$mp4_key" "$mp4_poster_key"; do
  minio_stat "$key" || { echo "Expected MinIO object to exist: $key" >&2; exit 1; }
done

source_mp4_hash="$(sha256sum "$mp4_file" | awk '{print $1}')"
stored_mp4_hash="$(minio_hash "$mp4_key")"
proxied_mp4_hash="$(curl -fsS "http://127.0.0.1:3000$mp4_public_path" | sha256sum | awk '{print $1}')"
if [ "$source_mp4_hash" != "$stored_mp4_hash" ] || [ "$source_mp4_hash" != "$proxied_mp4_hash" ]; then
  echo "Expected uploaded and same-origin proxied MP4 bytes to remain unchanged" >&2
  exit 1
fi

delete_object "$gif_asset_id" "$gif_key"
delete_object "$gif_asset_id" "$gif_poster_key"
delete_object "$mp4_asset_id" "$mp4_key"
delete_object "$mp4_asset_id" "$mp4_poster_key"

for key in "$gif_key" "$gif_poster_key" "$mp4_key" "$mp4_poster_key"; do
  if minio_stat "$key"; then
    echo "Expected MinIO object to be deleted: $key" >&2
    exit 1
  fi
done

echo "Server media processing drill passed."
echo "GIF asset: $gif_asset_id"
echo "MP4 asset: $mp4_asset_id"
echo "Correlation ID: $correlation_id"
'@

$remoteScript | & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$HostName" "bash -s"
if ($LASTEXITCODE -ne 0) {
  throw "Server media processing drill failed with exit code $LASTEXITCODE"
}
