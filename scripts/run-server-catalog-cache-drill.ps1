param(
  [string]$HostName = "170.106.136.169",
  [string]$User = "ubuntu",
  [string]$KeyPath = "$env:USERPROFILE\.ssh\hlandteaware_tencent_rsa"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $KeyPath)) {
  throw "SSH key not found: $KeyPath"
}

$remoteScript = @'
set -euo pipefail

cd /opt/crossborder-commerce-kit/current

base_api="http://127.0.0.1:4000"
base_admin="http://127.0.0.1:4001"
store_id="00000000-0000-4000-8000-000000000001"
key_base="local:store:${store_id}:"
category_key="${key_base}catalog:categories:v1"
region_key="${key_base}catalog:regions:v1"
summary_key="${key_base}catalog:product-summaries:v1"
products_key="${key_base}catalog:storefront-products:v2"
storefront_key="${key_base}catalog:storefront:v2"
correlation_id="cache-drill-$(date +%s)"

redis() { docker exec cbck-redis redis-cli "$@"; }
http() { curl -fsS -H "x-correlation-id: ${correlation_id}" -H "x-admin-actor: cache-drill" "$@"; }
exists() { redis EXISTS "$1" | tr -d '\r'; }
contains() { redis GET "$1" | grep -q "$2"; }

echo "Checking required services..."
curl -fsS "${base_api}/health" >/dev/null
curl -fsS "${base_admin}/health" >/dev/null
curl -fsS "http://127.0.0.1:4103/ready" >/dev/null
redis PING >/dev/null

echo "Preheating storefront and product summary caches..."
http "${base_api}/catalog/storefront" >/tmp/cache-drill-storefront-before.json
http "${base_api}/catalog/products" >/tmp/cache-drill-products-before.json

for key in "$category_key" "$region_key" "$summary_key" "$products_key" "$storefront_key"; do
  if [ "$(exists "$key")" != "1" ]; then
    echo "Expected cache key to exist after preheat: $key" >&2
    exit 1
  fi
done

http "${base_admin}/catalog/categories" >/tmp/cache-drill-categories.json
python3 - <<'PY'
import json
from pathlib import Path

categories = json.loads(Path("/tmp/cache-drill-categories.json").read_text())
if not categories:
    raise SystemExit("No categories returned")

category = categories[0]
update_payload = {
    "categories": [
        {
            "slug": category["slug"],
            "nameZh": category["copy"]["zh"]["name"] + " 缓存演练",
            "nameEn": category["copy"]["en"]["name"] + " Cache Drill",
            "sortOrder": category.get("sortOrder", 10),
            "status": "active" if category.get("isVisible", True) else "inactive",
            "imageUrl": category.get("imageUrl") or ""
        }
    ]
}
restore_payload = {
    "categories": [
        {
            "slug": category["slug"],
            "nameZh": category["copy"]["zh"]["name"],
            "nameEn": category["copy"]["en"]["name"],
            "sortOrder": category.get("sortOrder", 10),
            "status": "active" if category.get("isVisible", True) else "inactive",
            "imageUrl": category.get("imageUrl") or ""
        }
    ]
}
Path("/tmp/cache-drill-category-update.json").write_text(json.dumps(update_payload))
Path("/tmp/cache-drill-category-restore.json").write_text(json.dumps(restore_payload))
print(category["slug"])
PY

token="Cache Drill"
echo "Updating one category through admin-gateway..."
http -X PUT -H "content-type: application/json" --data-binary @/tmp/cache-drill-category-update.json "${base_admin}/catalog/categories" >/tmp/cache-drill-category-updated-response.json

if ! contains "$category_key" "$token"; then
  echo "Category cache was not refreshed with the updated value" >&2
  exit 1
fi

for key in "$summary_key" "$products_key" "$storefront_key"; do
  if [ "$(exists "$key")" != "0" ]; then
    echo "Dependent cache key was not invalidated: $key" >&2
    exit 1
  fi
done

echo "Verifying storefront reads the updated category value..."
http "${base_api}/catalog/storefront" >/tmp/cache-drill-storefront-after-update.json
if ! grep -q "$token" /tmp/cache-drill-storefront-after-update.json; then
  echo "Storefront did not return the updated category value" >&2
  exit 1
fi

echo "Restoring category through admin-gateway..."
http -X PUT -H "content-type: application/json" --data-binary @/tmp/cache-drill-category-restore.json "${base_admin}/catalog/categories" >/tmp/cache-drill-category-restored-response.json
http "${base_api}/catalog/storefront" >/tmp/cache-drill-storefront-after-restore.json
if grep -q "$token" /tmp/cache-drill-storefront-after-restore.json; then
  echo "Storefront still contains temporary cache-drill value after restore" >&2
  exit 1
fi

cat <<EOF
Catalog cache drill passed.
Correlation ID: ${correlation_id}
Checked keys:
- ${category_key}
- ${region_key}
- ${summary_key}
- ${products_key}
- ${storefront_key}
EOF
'@

$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$remoteCommand = "echo $encoded | base64 -d > /tmp/catalog-cache-drill.sh && bash /tmp/catalog-cache-drill.sh"

ssh -i $KeyPath -o StrictHostKeyChecking=no $User@$HostName $remoteCommand
