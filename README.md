# Crossborder Commerce Kit

可复制交付的跨境电商独立站底座。当前先实现本地工程底座和第一主线闭环：

后台创建商品 -> 录库存 -> 前台浏览 -> 加购物车 -> Guest Checkout -> 创建订单 -> 库存预留 -> Mock 支付 webhook -> 订单 paid -> 库存确认扣减 -> 后台可查。

## Local Ports

- Storefront: http://localhost:3000
- Admin: http://localhost:3001
- API Gateway: http://localhost:4000
- Admin Gateway: http://localhost:4001
- Support Service: http://localhost:4107/health
- Worker Service: http://localhost:4109/health
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- OpenSearch: http://localhost:9200
- MinIO API: http://localhost:9000
- MinIO Console: http://localhost:9001
- Mailpit: http://localhost:8025

## First Run

```powershell
pnpm install
pnpm docker:up
pnpm dev
```

首次私有化初始化：

```powershell
.\scripts\init-private-deployment.ps1 -WithApps -WithObservability
```

完整应用栈和可观测性：

```powershell
docker compose --profile app up -d --build
docker compose --profile observability up -d
```

## Deployment Path

当前只做阶段一：Docker Compose。先在本地和第一台测试服务器验证完整业务闭环，不提前引入 Kubernetes。

后期上云按三阶段走：

1. Docker Compose：跑通商品、库存、订单、Mock 支付、后台订单/库存、审计日志、补偿重试和集中日志。
2. 托管状态服务：Node.js 微服务上云，PostgreSQL 使用 RDS，Redis 使用托管 Redis，对象存储使用 R2/S3/OSS，数据库不放进 K8s。
3. Helm：业务闭环稳定后，再把无状态服务翻译成 K8s Deployment/Service 并打 Helm 包，用于批量复制交付。

详细见 `docs/private-deployment-runbook.md`。

## Guardrails

- Contracts before implementation.
- Store context before business logic.
- API/events between services, no cross-service table writes.
- Integer minor units for all money.
- Mock providers before real payment/logistics integrations.
- Every merge must keep Docker Compose and health checks runnable.
- Payment webhooks must be idempotent. Repeated `paid` callbacks must not confirm inventory twice, and invalid order state jumps must be rejected.
- Private deployments must use the initialization script or equivalent automation; do not hand-edit source code for customer setup.
