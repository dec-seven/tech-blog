---
title: "Linux 服务器代理配置记录：mihomo 后台运行与按需代理"
description: "记录在无桌面 Linux 服务器上配置 mihomo 的过程：安装、配置、前台验证、systemd 托管、命令行代理、Dashboard 访问和排错。"
pubDate: 2026-07-08
tags: ["Linux", "代理", "mihomo", "systemd"]
featured: true
---

服务器上经常会遇到一个问题：平时跑服务没事，一到下载 GitHub Release、拉依赖、访问外部文档，网络就不稳定。

我不想接管整台机器的网络，也不想把代理端口暴露出去。最后的方案是：服务器本机运行 `mihomo`，只监听 `127.0.0.1`，命令行需要时再临时走代理。

## 目标

这次不做透明代理，也不做全局代理。目标只有三个：

1. `curl`、`git`、`pnpm` 等命令按需走代理。
2. `mihomo` 用 `systemd` 后台运行，开机自启。
3. 代理端口和控制接口只监听本机。

链路大概是这样：

![Linux 服务器代理链路](/images/linux-proxy-architecture.svg)

命令行工具只连接 `127.0.0.1:7890`。节点、规则、订阅这些交给 `mihomo`。

## 执行顺序

从新服务器开始，我会按这个顺序做：

```text
确认系统架构
  -> 安装 mihomo 二进制
  -> 准备 /etc/mihomo/config.yaml
  -> 前台启动测试
  -> curl 验证代理端口
  -> 写 systemd 服务
  -> 配置 proxy_on / proxy_off
  -> 按需配置 Git 代理和 Dashboard
```

流程图：

![mihomo 配置流程](/images/linux-proxy-workflow.svg)

建议先前台启动测试，再交给 `systemd`。程序能运行、配置能解析、节点能出站，这是三件事。

## 环境和目录

下面命令以 Debian / Ubuntu 为例。

先确认架构：

```bash
uname -m
```

常见对应关系：

```text
x86_64  -> amd64
aarch64 -> arm64
```

文件放在这几个位置：

```text
/usr/local/bin/mihomo       # 程序本体
/etc/mihomo/config.yaml     # 配置文件
/var/log/mihomo/            # 日志目录，按需使用
```

创建目录：

```bash
sudo mkdir -p /etc/mihomo
sudo mkdir -p /var/log/mihomo
```

## 安装 mihomo

到 `mihomo` Release 页面下载对应架构的 Linux 包。服务器访问慢的话，可以本地下载后 `scp` 上传。

以 amd64 压缩包为例：

```bash
gzip -d mihomo-linux-amd64-*.gz
chmod +x mihomo-linux-amd64-*
sudo mv mihomo-linux-amd64-* /usr/local/bin/mihomo
mihomo -v
```

能看到版本号，说明二进制没问题。

## 准备配置

如果已有 Clash / Mihomo 订阅链接，可以下载成配置文件：

```bash
sudo curl -L "你的订阅地址" -o /etc/mihomo/config.yaml
```

订阅地址不要提交到 Git，也不要放到公开文档里。

打开配置：

```bash
sudo nano /etc/mihomo/config.yaml
```

重点检查这些字段：

```yaml
mixed-port: 7890
socks-port: 7891
allow-lan: false
bind-address: 127.0.0.1
mode: rule
log-level: info
external-controller: 127.0.0.1:9090
secret: "换成一个足够长的随机字符串"
```

说明：

- `mixed-port`：HTTP / SOCKS 混合端口，命令行最常用。
- `socks-port`：给只支持 SOCKS 的工具使用。
- `allow-lan: false`：不允许局域网设备连接。
- `bind-address: 127.0.0.1`：只监听本机。
- `external-controller`：控制接口也绑定本机。
- `secret`：控制接口认证。

服务器上最需要注意的是监听地址。代理端口不要变成 `0.0.0.0`。

## 前台验证

先前台启动：

```bash
sudo mihomo -d /etc/mihomo -f /etc/mihomo/config.yaml
```

如果 YAML 缩进、订阅内容、端口占用有问题，这里会直接报错。

另开一个终端测试：

```bash
curl -I --proxy http://127.0.0.1:7890 https://www.google.com/generate_204
```

看出口 IP：

```bash
curl --proxy http://127.0.0.1:7890 https://ipinfo.io/ip
```

这一步通过后，再写服务文件。

## systemd 托管

创建服务文件：

```bash
sudo nano /etc/systemd/system/mihomo.service
```

写入：

```ini
[Unit]
Description=mihomo proxy service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mihomo -d /etc/mihomo -f /etc/mihomo/config.yaml
Restart=on-failure
RestartSec=5s
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mihomo
sudo systemctl status mihomo
```

看日志：

```bash
journalctl -u mihomo -f
```

改配置后重启：

```bash
sudo systemctl restart mihomo
```

## 命令行按需代理

我没有写全局代理，而是在 shell 里放两个函数。

Bash 编辑：

```bash
nano ~/.bashrc
```

Zsh 编辑：

```bash
nano ~/.zshrc
```

加入：

```bash
proxy_on() {
  export http_proxy="http://127.0.0.1:7890"
  export https_proxy="http://127.0.0.1:7890"
  export all_proxy="socks5://127.0.0.1:7891"
  export no_proxy="localhost,127.0.0.1,::1,.local"
}

proxy_off() {
  unset http_proxy
  unset https_proxy
  unset all_proxy
  unset no_proxy
}
```

让配置生效：

```bash
source ~/.bashrc
```

或：

```bash
source ~/.zshrc
```

使用：

```bash
proxy_on
curl https://github.com
proxy_off
```

这样只影响当前 shell，不会影响系统里的其他服务。

## Git 单独配置

如果只想让 Git 走代理：

```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

取消：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

临时 clone 仓库时，我更倾向于 `proxy_on`，用完 `proxy_off`。全局 Git 代理适合长期需要的机器。

## Dashboard 和控制接口

如果启用了：

```yaml
external-controller: 127.0.0.1:9090
secret: "你的 secret"
```

不要开放服务器的 `9090` 端口。需要看控制面时，用 SSH 隧道：

```bash
ssh -L 9090:127.0.0.1:9090 user@your-server
```

本地访问：

```text
http://127.0.0.1:9090
```

注意：`external-controller` 是控制接口，不一定自带 Dashboard。如果没有配置 `external-ui`，就在本地 Dashboard 里填 API 地址 `http://127.0.0.1:9090` 和 `secret`。

## 验收

看服务状态：

```bash
sudo systemctl status mihomo
```

确认只监听本机：

```bash
ss -lntp | grep -E "7890|7891|9090"
```

期望看到：

```text
127.0.0.1:7890
127.0.0.1:7891
127.0.0.1:9090
```

测试代理出站：

```bash
curl --proxy http://127.0.0.1:7890 https://ipinfo.io/ip
```

测试 shell 函数：

```bash
proxy_on
curl -I https://github.com
proxy_off
```

这些都正常，就可以日常使用了。

## 排错

### 1. 端口监听到了公网

检查：

```bash
ss -lntp | grep -E "7890|7891|9090"
```

如果看到 `0.0.0.0:7890`，优先检查：

```yaml
allow-lan: false
bind-address: 127.0.0.1
```

### 2. systemd 启动失败

看最近日志：

```bash
journalctl -u mihomo -n 100 --no-pager
```

重点看 `ExecStart` 路径、配置文件路径、端口占用。

### 3. curl 能走，Git 不走

先看你用的是哪种方式。

环境变量方式：

```bash
proxy_on
```

Git 全局配置方式：

```bash
git config --global --get http.proxy
git config --global --get https.proxy
```

不同工具读取代理配置的方式不一样，不要混着排查。

### 4. systemd 服务不继承 shell 代理

`proxy_on` 只影响当前 shell 和它启动的子进程。已经由 `systemd` 管理的服务不会自动继承。

如果某个服务也要走代理，在它自己的 service 文件里配置 `Environment=`。

### 5. Dashboard 连不上

先确认 SSH 隧道还在：

```bash
ssh -L 9090:127.0.0.1:9090 user@your-server
```

再确认控制接口监听：

```bash
ss -lntp | grep 9090
```

如果提示未授权，检查 `secret`。

## 小结

这套配置的重点是边界清楚：

- `mihomo` 后台常驻。
- 代理端口只监听本机。
- 命令行按需开启代理。
- Git 可以单独配置。
- 控制接口通过 SSH 隧道访问。

这样能解决服务器访问外部资源的问题，也不会把整台机器的网络行为改得不可控。以后换服务器时，把二进制、配置文件、service 文件和 shell 函数照着恢复即可。
