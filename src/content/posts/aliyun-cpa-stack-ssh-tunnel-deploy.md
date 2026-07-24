---
title: "中国大陆阿里云部署 CPA 全栈：SSH 隧道、Mihomo 出站与运维踩坑"
description: "记录在中国大陆阿里云 ECS 上部署 CLIProxyAPI、CPA Manager Plus 与 Mihomo 的完整方案：无域名、仅开放 22、SSH 隧道访问、离线镜像、升级兼容与本地菜单栏控制。"
pubDate: 2026-07-24
tags: ["阿里云", "Docker", "CPA", "Mihomo", "SSH", "部署"]
featured: true
draft: false
---

这次部署的目标很明确：在中国大陆阿里云 ECS 上跑通一套个人使用的 CLIProxyAPI + CPA Manager Plus，并让模型上游请求经过 Mihomo 从香港、日本或新加坡节点出去。

限制也很清楚：

- 没有域名，不想申请证书。
- 只有本人使用，不需要公网 Web 入口。
- 服务器在大陆，直连模型上游不稳定，必须走代理。
- 安全组尽量收紧，不把管理面板和 API 暴露到公网。

最终方案是：Docker Compose 跑三个正式服务，所有服务端口只绑 `127.0.0.1`，本机通过 SSH LocalForward 访问。公网只保留 TCP 22。

## 最终架构

```text
本地浏览器 / Codex / API 客户端
        |
        | SSH 加密隧道（公网只有 TCP 22）
        v
ECS 127.0.0.1
        |-- 8317  -> CLIProxyAPI
        |-- 18317 -> CPA Manager Plus
        `-- 9090  -> Mihomo Controller

CLIProxyAPI
  -> socks5h://mihomo:7891
  -> Mihomo
  -> 香港 / 日本 / 新加坡节点
  -> 模型上游
```

本地客户端看到的是：

```text
API Base URL:  http://127.0.0.1:8317/v1
管理面板:      http://127.0.0.1:18317/management.html
Mihomo 面板:   http://127.0.0.1:9090/ui/
```

地址虽然是 `http://` 和 `ws://`，但本机和 ECS 之间的公网流量由 SSH 加密。SSH 做的是透明 TCP 转发，HTTP、SSE 和 WebSocket 都可以走。

## 为什么不用 Caddy 和公网 HTTPS

最开始也考虑过 Caddy + 域名 + 公网反向代理。后来砍掉了，原因有三个：

1. 只有本人使用，没有多人共享需求。
2. 没有域名时，证书和公网入口都是额外负担。
3. 一旦把 `8317` 或 `18317` 暴露到公网，就等于把管理面和代理入口放在外面。

更合适的边界是：

| 组件 | 监听位置 | 公网是否开放 |
|---|---|---|
| SSH | ECS 公网 22 | 只允许当前公网 IP |
| CLIProxyAPI | `127.0.0.1:8317` | 否 |
| CPA Manager Plus | `127.0.0.1:18317` | 否 |
| Mihomo mixed-port | `127.0.0.1:7890` | 否 |
| Mihomo Controller | `127.0.0.1:9090` | 否 |
| Mihomo SOCKS | Docker 私网 `7891` | 否 |

阿里云安全组入方向只放：

```text
TCP 22 / 你的当前公网 IP /32
```

不要开放：

```text
80  443  7890  7891  8317  9090  18317
```

## 服务拆分

Compose 项目目录固定为：

```text
/opt/cpa-stack
```

三个正式服务：

```text
mihomo
cli-proxy-api
cpa-manager-plus
```

职责划分：

- **Mihomo**：只负责出站代理。CPA 的上游模型请求通过 `socks5h://mihomo:7891` 出去。
- **CLIProxyAPI**：对本地客户端提供 OpenAI 兼容 API，并承接 OAuth 账号、路由、重试和 WebSocket。
- **CPA Manager Plus**：管理面板、用量采集和运维界面；它通过 Docker 私网访问 CPA，不经过 Mihomo。

一个关键约束：

```text
容器内网通信不走 Mihomo
只有 CPA 的上游模型请求走 Mihomo
```

这样管理面板、健康检查和容器互访不会被代理链路拖垮。

## 冷启动：大陆 ECS 的第一道坑

### 1. Docker 官方源可能下不下来

在大陆 ECS 上，`download.docker.com` 的 GPG 公钥或仓库索引可能失败。现象通常是：

```text
curl: (35) OpenSSL SSL_connect: Connection reset by peer
NO_PUBKEY ...
The repository ... is not signed
Package 'docker-ce' has no installation candidate
```

处理方式：

1. 清理失败写入的 Docker 仓库文件。
2. 改用阿里云 ECS 内网 Docker CE 源。
3. 安装完成后用 `docker version` 和 `docker compose version` 验证。

这里暂时不要用 `docker run hello-world` 判断 Docker 是否安装成功。`hello-world` 还要访问 Docker Hub，冷启动阶段它会把“Docker 没装好”和“镜像仓库不可达”混在一起。

### 2. 首次镜像拉取不能依赖 Mihomo

Mihomo 自己也是镜像。如果 ECS 还拉不到 Docker Hub，就不能指望“先起 Mihomo，再让 Docker 走代理拉其他镜像”。

更稳的顺序是：

```text
安装 Docker
  -> 验证或离线导入固定镜像
  -> 先启动 Mihomo
  -> 验证出口 IP 不在大陆
  -> 再启动 CPA 和 CPAMP
```

离线导入时，在可联网环境按 `linux/amd64` 拉取固定版本，打包后传到 ECS：

```bash
docker image save \
  metacubex/mihomo:v1.19.29 \
  eceasy/cli-proxy-api:v7.2.96 \
  seakee/cpa-manager-plus:v1.11.6 \
  curlimages/curl:8.14.1 \
  | gzip > cpa-images-amd64.tgz

# 传到 ECS 后
gunzip -c cpa-images-amd64.tgz | docker load
```

镜像就绪后，完整服务启动不强制 `docker compose pull`。

### 3. 先验证出口，再启动 CPA

Mihomo 起来之后，先确认代理出口不是大陆 ECS 自己的 IP：

```bash
docker compose run --rm --no-deps proxy-check \
  --proxy socks5h://cpa:密码@mihomo:7891 \
  https://ipinfo.io/ip
```

如果出口 IP 仍然是 ECS 公网 IP，就说明代理链路没有真正生效。这时候不要启动 CPA，否则上游请求会带着大陆 IP 出去，既不稳定，也可能触发风控。

## CPA 代理与路由策略

CPA 侧只设置上游代理：

```yaml
proxy-url: "socks5h://cpa:密码@mihomo:7891"
```

注意是 `socks5h`，不是 `socks5`。`socks5h` 表示域名解析也走代理侧，避免在大陆 ECS 本地解析模型上游域名。

Mihomo 侧只保留香港、日本、新加坡节点，并且：

- 使用 `fallback`，只在当前节点失败时切换。
- 设置 `empty-fallback: REJECT`，无节点时禁止直连。
- 不使用 round-robin，减少出口 IP 漂移和 WebSocket 中断。

Google 健康检查只能证明节点基本在线，不能证明 ChatGPT 或 Codex 后端可用。上线前应对真实目标做多次探测，再固定到稳定节点。

## 本机访问：SSH 隧道

本机建立三条转发：

```bash
ssh -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:8317:127.0.0.1:8317 \
  -L 127.0.0.1:18317:127.0.0.1:18317 \
  -L 127.0.0.1:9090:127.0.0.1:9090 \
  cpa-aliyun
```

参数含义：

- `-N`：不执行远程命令，只做转发。
- `-T`：不分配远程终端。
- `ExitOnForwardFailure=yes`：任一端口转发失败就退出，避免“看起来启动了但其实没通”。
- `ServerAliveInterval` / `ServerAliveCountMax`：降低长时间空闲后隧道假死的概率。
- 本地和远端都显式绑定 `127.0.0.1`，不向局域网开放。

SSH 别名建议写在本机 `~/.ssh/config`：

```sshconfig
Host cpa-aliyun
  HostName 你的ECS公网IP
  User root
  IdentityFile ~/path/to/aliyun.pem
  IdentitiesOnly yes
  StrictHostKeyChecking yes
```

验证：

```bash
curl -fsS http://127.0.0.1:8317/healthz
curl -fsS http://127.0.0.1:18317/health
```

正常结果类似：

```json
{"status":"ok"}
{"ok":true,"service":"cpa-manager-plus"}
```

## 本地体验：从 Automator 到 SwiftBar

终端里长期挂着 SSH 命令能用，但不适合日常。后面补了两层本地控制。

### Automator 一键隧道

用 macOS Automator 做一个应用，核心能力：

1. 检查 SSH Control Socket，判断隧道是否已存在。
2. 不存在则后台建立，已存在则不重复创建。
3. 检查本地 `8317`、`18317`、`9090` 是否被占用。
4. 用 `curl` 做健康检查，并通过通知或弹窗反馈状态。

关键点是：

```text
ssh -fN -T -M -S ~/.ssh/cpa-tunnel.sock ...
```

其中：

- `-f`：认证成功后进入后台，Automator 可以退出。
- `-M` / `-S`：启用控制套接字，后续能检查和关闭同一条隧道。

### SwiftBar 菜单栏状态

Automator 适合“点一下启动”，不适合持续显示状态。SwiftBar 更适合：

```text
菜单栏：绿色对勾 + CPA
点击后：
  SSH 隧道状态
  CPA HTTP 状态
  CPAMP HTTP 状态
  启动 / 关闭 / 重连
  打开管理面板
  打开 Mihomo Dashboard
```

有一个细节：SwiftBar 的 `sfimage=` 在菜单栏 Header 上会按 macOS 模板图标渲染，颜色会被系统强制成黑白。真正能着色的写法是内联 SF Symbol：

```text
:checkmark.circle.fill: CPA | symbolize=true sfcolor=#248A3D,#30D158
```

日常建议 30 秒刷新一次。开销主要来自几次短暂的 `ssh` 和 `curl`，通常远小于浏览器标签页或 Docker Desktop。

## 升级：CPA 从 v7.1.39 到 v7.2.96

部署稳定后，真实请求里出现了两类问题。

### 问题 A：代理链路短时 EOF / TLS

日志类似：

```text
Post "https://chatgpt.com/backend-api/codex/responses": EOF
TLS handshake timeout
```

特征：

- 账号本身没有失效。
- 同一会话、同一账号在几分钟后可以恢复成功。
- Codex 客户端和 CPA 重试会把一次短时波动放大成一批错误。

这类问题优先处理节点质量，而不是反复重新授权账号。

### 问题 B：旧版 CPA 不兼容新 Codex 字段

另一类错误是：

```text
Unknown parameter: 'input[220].namespace'
```

这不是代理问题，而是请求格式兼容问题。旧版 CPA 在转发 OpenAI Responses / Codex 工具调用时，对 `namespace` 和 custom tool 处理不足。

处理方式：

1. 备份配置和数据。
2. 将 CLIProxyAPI 升级到包含 namespace 兼容修复的版本。
3. 现场实际升到 `v7.2.96`。
4. 用新建 namespace 工具请求回归，确认 HTTP 200。

### 离线升级经验

ECS 经 Mihomo 访问 Docker Hub 时，`manifests/latest` 或 layer 下载可能返回 `EOF`。升级时更稳的做法是：

1. 本机 Docker Desktop 按 `linux/amd64` 拉取目标镜像。
2. `docker save` 打包并做 SHA-256 校验。
3. 上传到 ECS 后 `docker load`。
4. 先用隔离容器加载当前配置，确认新版本能启动。
5. 只重建 `cli-proxy-api`，不动 Mihomo 和 CPAMP。

有一次切换后，新容器其实已经正常，`/v1/models` 也成功了；失败的是本地“统计模型数量”的校验命令引号写错，自动回滚脚本因此把版本恢复回去。这说明回滚机制有效，也说明验收命令本身要先测准。

### 升级后仍可能看到的 400

升级后新建的 namespace 工具请求已经成功，但升级前打开的长会话仍可能报：

```text
Unknown parameter: 'input[n].namespace'
```

或者：

```text
Invalid 'input[n].id': expected an ID that begins with 'ctc'
```

原因是旧任务历史里已经保存了不兼容的 `custom_tool_call` 记录。每次重试都会把同一段错误历史再发一遍。

正确处理：

1. 新建一个全新的 Codex 任务。
2. 不要在旧任务里连续重试。
3. 不要因此回滚 CPA，也不要先怀疑账号授权失效。

## 日常运维

部署目录：

```bash
cd /opt/cpa-stack
```

最常用的检查：

```bash
docker compose ps
docker compose images
curl -fsS http://127.0.0.1:8317/healthz
curl -fsS http://127.0.0.1:18317/health
```

两者区别：

| 命令 | 看什么 |
|---|---|
| `docker compose ps` | 容器是否运行、是否 healthy |
| `docker compose images` | 当前容器实际使用的镜像和标签 |

更新前先备份：

```bash
./scripts/backup.sh
```

自用环境如果接受版本漂移，可以把三个镜像都固定到 `latest`，并在 `.env` 中设置：

```env
COMPOSE_PARALLEL_LIMIT=1
MIHOMO_IMAGE=metacubex/mihomo:latest
CPA_IMAGE=eceasy/cli-proxy-api:latest
CPAMP_IMAGE=seakee/cpa-manager-plus:latest
```

`COMPOSE_PARALLEL_LIMIT=1` 的作用是让 `docker compose pull` 一次只拉一个镜像，降低代理节点同时访问 Docker Hub 的压力。

推荐流程：

```bash
cd /opt/cpa-stack
./scripts/backup.sh
docker compose pull
docker compose up -d
docker compose ps
docker compose images
```

如果并行或串行拉取时出现：

```text
registry-1.docker.io ... EOF
```

先不要重启或删除现有容器。已下载成功的镜像会保留，失败的镜像单独重试即可：

```bash
docker pull eceasy/cli-proxy-api:latest
docker pull seakee/cpa-manager-plus:latest
```

三个镜像都成功后再执行 `docker compose up -d`。

需要强调：

- `docker compose pull` 只下载镜像，不重启服务。
- `docker compose restart` 只重启旧容器，不会切换新镜像。
- `docker compose up -d` 才会按新镜像标签重建容器。

如果更看重可回滚，生产环境仍建议固定版本号，而不是 `latest`。

## 排错清单

### 本地连不上 8317 / 18317

按这个顺序查：

1. SSH 隧道是否还在。
2. 本机端口是否被其他进程占用。
3. ECS 上容器是否 `Up`。
4. ECS 本机 `curl 127.0.0.1:8317/healthz` 是否成功。

### CPA 请求大量 500

先看错误内容：

- `EOF` / `TLS handshake timeout`：代理节点到上游的链路波动。
- `401` / `403` / `429`：账号、权限或额度问题。
- `Unknown parameter: ...namespace`：请求兼容或旧会话历史问题。

不要只看错误数量。Codex 客户端并发重试会把一次 40 秒网络抖动放大成十几条 500。

### Mihomo Dashboard 没有流量

确认：

1. 本机已经转发 `9090`。
2. Controller secret 正确。
3. 正在观察的是真实上游请求，而不是容器内网健康检查。

### WebSocket 经常断

常见原因：

- SSH 隧道断开。
- Mihomo 节点切换。
- 本机休眠或网络切换。
- 出口 IP 漂移触发上游侧异常。

单用户场景下，优先保持节点稳定，而不是频繁自动切换。

## 这次部署真正有效的结论

1. **无域名也能安全部署**，前提是服务只绑回环地址，公网只留 SSH。
2. **大陆 ECS 冷启动要把 Docker 安装、镜像导入、代理出口验证拆开**，不要混成一步。
3. **CPA 只代理上游，不代理容器内网**，管理面板和健康检查会稳定很多。
4. **Google 健康检查不等于 ChatGPT 可用**，上线前要测真实目标。
5. **错误率高不一定是账号坏了**，要拆开代理 EOF、版本兼容和旧会话历史三类问题。
6. **升级后旧任务仍可能 400**，因为错误已经写进会话历史；新建任务才是正确回归方式。
7. **本地体验最后一公里很重要**：SSH 别名、Automator、SwiftBar 会把“能用”变成“愿意每天用”。

## 本地客户端配置摘要

```text
API Base URL: http://127.0.0.1:8317/v1
API Key:      部署时生成的客户端 Key
管理面板:     http://127.0.0.1:18317/management.html
Mihomo UI:    http://127.0.0.1:9090/ui/
```

使用前先确保：

```text
SSH 隧道已连接
CPA /healthz 返回 ok
CPAMP /health 返回 ok
Mihomo 当前节点稳定
```

## 合规与边界

这套方案是单用户、自用、经 SSH 访问的私有部署。使用代理服务、模型上游和云资源时，需要遵守所在地法律、阿里云规则和上游服务条款。

如果以后要给多人使用，或者从其他网络直接访问，不应该直接开放 `8317` 和 `18317`。更合理的方向是恢复域名、TLS 和受控反向代理，并把认证、审计和访问边界重新设计一遍。

## 参考版本

现场实际跑通过的一组版本：

```text
Mihomo:           metacubex/mihomo:v1.19.29
CLIProxyAPI:      eceasy/cli-proxy-api:v7.2.96
CPA Manager Plus: seakee/cpa-manager-plus:v1.11.6
```

自用环境后续也可以切到 `latest`，但要把备份、串行拉取和健康检查固定成习惯动作。
