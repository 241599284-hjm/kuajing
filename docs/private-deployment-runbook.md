# Private Deployment Runbook

本项目按“私有化独立交付”设计：一套源码可以交付给不同客户，但每个客户必须独立部署、独立域名、独立数据库、独立缓存、独立对象存储、独立密钥和独立后台配置。

## 三阶段部署路线

### 阶段一：Docker Compose

当前阶段只使用 Docker Compose，不引入 Kubernetes。

目标：

- 本地和第一台测试服务器能一键拉起整套系统。
- 先验证业务闭环：商品、库存、下单、库存预留、支付 Mock、订单查询、后台库存/订单查看。
- 先验证运维闭环：健康检查、集中日志、traceId 检索、备份恢复脚本、显性降级。

启动本地依赖：

```bash
docker compose up -d
```

启动完整应用栈：

```bash
docker compose --profile app up -d --build
```

启动集中日志和观测：

```bash
docker compose --profile observability up -d
```

启动应用 + 观测：

```bash
docker compose --profile app --profile observability up -d --build
```

第一台 Ubuntu 24.04 LTS 测试服务器部署：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-to-server.ps1 -HostName 170.106.136.169 -User ubuntu
```

部署脚本会做：

1. 校验本地 Compose 配置。
2. 验证 SSH 能连接服务器。
3. 上传并执行 `infra/deploy/ubuntu-bootstrap.sh`，安装 Docker、Git、UFW 并放通 22/80/443/3000/3001/4000/4001。
4. 用 `git archive` 打包当前提交，不上传 `.env`、日志、node_modules 或本地密钥。
5. 在服务器 `/opt/crossborder-commerce-kit` 解包代码，首次部署从 `.env.example` 生成 `.env`。
6. 执行 `docker compose --profile app up -d --build`。
7. 输出 Compose 服务状态，并做 localhost HTTP smoke check。

如果服务器已经装好 Docker，可加 `-SkipBootstrap`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-to-server.ps1 -HostName 170.106.136.169 -User ubuntu -SkipBootstrap
```

如果首次启动失败并留下半初始化容器/volume，测试服务器可清空重建：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-to-server.ps1 -HostName 170.106.136.169 -User ubuntu -SkipBootstrap -ResetVolumes
```

临时密码登录也支持，但只用于首次部署或修复密钥，部署后必须改密码并切回 SSH 密钥：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-to-server.ps1 -HostName 170.106.136.169 -User ubuntu -Password "临时服务器密码"
```

如果要同时启动 Loki/Grafana：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-to-server.ps1 -HostName 170.106.136.169 -User ubuntu -WithObservability
```

如果本机 SSH 到服务器一直超时，可走腾讯云控制台“文件管理 / OrcaTerm / VNC”的离线包部署：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-server-package.ps1
```

然后把下面三个文件上传到服务器 `/tmp`：

- `artifacts/deploy/crossborder-commerce-kit-deploy.tar.gz`
- `artifacts/deploy/ubuntu-bootstrap.sh`
- `artifacts/deploy/server-install-from-package.sh`

在腾讯云网页终端执行：

```bash
sudo bash /tmp/server-install-from-package.sh /tmp/crossborder-commerce-kit-deploy.tar.gz
```

如果要同时启动 Loki/Grafana：

```bash
sudo START_OBSERVABILITY=1 bash /tmp/server-install-from-package.sh /tmp/crossborder-commerce-kit-deploy.tar.gz
```

SSH 前置条件：

- 腾讯云安全组/防火墙必须放通 22。
- 实例系统用户默认是 `ubuntu`。
- 本机私钥默认路径：`C:\Users\xx\.ssh\hlandteaware_tencent_rsa`。
- 腾讯云必须绑定该私钥对应的公钥；如果控制台不能直接绑定，使用 OrcaTerm/VNC 登录服务器，把公钥追加到 `/home/ubuntu/.ssh/authorized_keys`。

访问地址：

- Storefront: `http://localhost:3000`
- Admin: `http://localhost:3001`
- API Gateway: `http://localhost:4000`
- Admin Gateway: `http://localhost:4001`
- Grafana: `http://localhost:3002`
- Loki: `http://localhost:3100`
- Mailpit: `http://localhost:8025`
- MinIO Console: `http://localhost:9001`

阶段一验收：

- `pnpm -s typecheck` 通过。
- `pnpm -s e2e` 通过。
- `docker compose --profile app up -d --build` 能启动应用服务。
- `docker compose --profile observability up -d` 能打开 Grafana。
- `powershell -ExecutionPolicy Bypass -File scripts/run-compensation-drill.ps1` 通过，能验证订单支付确认时库存服务不可用会进入 `compensation_tasks`，worker 重试失败后进入 `dead_letter_tasks`，并能通过 `admin-gateway /dead-letter-tasks` 查到。
- 订单失败能通过 `x-correlation-id` 在 Grafana Loki 中查到相关服务日志。
- 支付失败、库存补偿失败、物流同步失败必须进入可重试的任务或 DLQ，不允许只靠一次同步 HTTP 调用。
- 后台“死信队列”能读取 worker-service 真实 DLQ，并支持人工重试、作废、填写处理意见。
- 慢请求结构化日志可被 Loki 检索：订单创建默认阈值 2000ms，库存预留 1000ms，catalog 读取 500ms。

### 阶段二：托管状态服务

准备上云时，不自建裸机 Kubernetes，不把数据库放进 Kubernetes。

推荐：

- Node.js 微服务跑在云厂商托管容器服务或托管 Kubernetes 中。
- PostgreSQL 使用 RDS / PolarDB / Cloud SQL 等托管数据库。
- Redis 使用 ElastiCache / Tair / Memorystore 等托管 Redis。
- 对象存储使用 Cloudflare R2 / S3 / OSS。
- 日志和指标使用托管 Grafana/Loki、CloudWatch、阿里云 SLS 或同等级服务。

阶段二原则：

- K8s 只跑无状态 Node.js 服务、网关和 worker。
- PostgreSQL、Redis、对象存储、邮件、CDN、密钥管理全部使用托管能力。
- 数据库迁移和备份恢复必须在上线前演练。

### 阶段三：Helm 可复制交付

业务闭环、补偿重试、日志追踪、备份恢复全部稳定后，再把 Compose 配置翻译成 Kubernetes Deployment / Service / ConfigMap / Secret 模板，并制作 Helm Chart。

Helm 包必须支持：

- 客户域名、镜像版本、资源配额、环境变量和密钥引用配置。
- 外部 RDS、Redis、对象存储、CDN、支付、物流、邮箱配置注入。
- 灰度发布和回滚。
- readiness/liveness 探针。
- worker 与 web 服务分开扩容。

## 微服务税控制规则

- 阶段一不允许手工逐个启动十几个终端，必须使用 Compose profile。
- 默认 `docker compose up -d` 只启动中间件，避免日常开发过重。
- `--profile app` 启动完整应用栈，用于联调和测试服务器。
- `--profile observability` 启动日志观测，不强制每次开发都开。
- 客户部署禁止修改源码配置，差异必须来自环境变量、密钥系统或后台配置。

## 可观测性规则

- 所有网关必须生成或透传 `x-correlation-id`。
- 服务间调用必须继续透传 `x-correlation-id`。
- 业务失败、补偿失败、DLQ 入队必须记录 correlation ID、业务 ID、服务名和操作名。
- 慢请求必须记录 `event=slow_request`、服务名、操作名、耗时、阈值和 correlation ID。
- 本地和测试服务器使用 Loki + Grafana 作为默认集中日志方案。
- 管理员处理 DLQ 时，应能用 correlation ID 查询整条调用链日志。

## TCC 补偿规则

- `try`、`confirm`、`cancel` 必须幂等。
- 补偿不能只靠同步 HTTP 调用。
- 同步补偿失败时，必须写入可靠任务表或消息队列，由 worker 重试。
- 超过最大重试次数必须进入 DLQ，后台可人工重试、作废、填写处理意见并写审计日志。
- 支付成功但库存 confirm 失败、支付失败但库存 cancel 失败，都必须进入补偿任务，不允许悬挂状态无人处理。

## 补偿故障演练

脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-compensation-drill.ps1
```

脚本会执行：

1. 启动 PostgreSQL、Redis、inventory-service、order-service、payment-service、worker-service、admin-gateway。
2. 创建一笔 PostgreSQL-backed Mock 订单。
3. 停止 inventory-service，模拟支付确认后的库存 confirm 不可达。
4. 调用 `order-service /payments/mock-confirm`，让订单进入 `compensation_pending` 并写入 `compensation_tasks`。
5. 将本次演练任务的 `max_attempts` 调低为 1、`next_run_at` 设为 `now()`，避免演练等待过久。
6. 等待 worker 将失败任务写入 `dead_letter_tasks`。
7. 通过 `admin-gateway /dead-letter-tasks` 验证后台能读取该 DLQ。
8. 重启 inventory-service。

成功标准：

- 脚本输出 `Compensation drill passed.`
- 输出订单 ID、correlation ID 和 open DLQ 行数。
- 后台“死信队列”可看到该任务。

失败处理：

- 如果报 Docker daemon 不可用，先修复 Docker Desktop 或改用测试服务器执行。
- 如果 PostgreSQL 表缺失，先确认 fresh DB 是否挂载了 `infra/db/migrations/012-inventory-audit-events.sql` 和 `infra/db/migrations/013-order-audit-events.sql`，已有旧 volume 时需要重建测试库或手工执行迁移。
- 如果 DLQ 未出现，查看 worker-service 日志并用 correlation ID 追踪 order-service、worker-service、inventory-service 调用链。
