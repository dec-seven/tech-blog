---
title: "Linux 服务器代理配置：mihomo 后台运行与命令行代理"
description: "记录一次在无桌面 Linux 服务器上配置 mihomo 的过程：从安装、配置、验证，到 systemd 后台运行和命令行按需代理。"
pubDate: 2026-07-08
tags: ["Linux", "代理", "mihomo", "systemd"]
featured: true
---

这两天整理服务器环境时，又遇到了一个很熟悉的问题：机器本身是纯命令行环境，平时跑服务没什么感觉，但一到下载 GitHub Release、拉依赖、访问外部文档，网络就开始变得不稳定。

桌面电脑上这件事很简单，打开代理客户端就行。服务器上不一样，我不想为了几个命令把系统网络改得太重，也不想开一个暴露在公网的代理端口。最后还是选择了比较朴素的方案：在服务器本机跑 `mihomo`，只监听 `127.0.0.1`，需要代理的命令通过环境变量临时走它。

这篇就是这次配置过程的记录。

## 我想要的效果

这次不是做透明代理，也不是接管整台服务器流量。目标只有三个：

1. `curl`、`git`、`pnpm` 这类命令需要时能走代理。
2. `mihomo` 能作为后台服务稳定运行，重启服务器后自动恢复。
3. 代理端口和控制端口都只监听本机，不开放给公网。

最后的链路大概是这样：

![Linux 服务器代理链路](/images/linux-proxy-architecture.svg)

也就是说，命令行工具只知道本机有一个 `127.0.0.1:7890` 代理端口；节点选择、规则分流、订阅配置这些事情都交给 `mihomo`。

## 环境和目录

我的服务器是普通的 Linux 云主机，下面命令以 Debian / Ubuntu 系为例。其他发行版大同小异，主要区别在包管理器和 systemd 默认行为。

先看一下架构：

```bash
uname -m
```

常见结果一般是：

```text
x86_64  -> amd64
aarch64 -> arm64
```

我会把文件放成这样：

```text
/usr/local/bin/mihomo       # 程序本体
/etc/mihomo/config.yaml     # 配置文件
/var/log/mihomo/            # 日志目录，按需使用
```

目录先建好：

```bash
sudo mkdir -p /etc/mihomo
sudo mkdir -p /var/log/mihomo
```

## 安装 mihomo

去 `mihomo` 的 Release 页面下载对应架构的 Linux 包。服务器能直接访问的话，可以在服务器上下载；访问慢的话，我更建议本地下载后 `scp` 上传，少折腾一点。

假设拿到的是 amd64 的压缩包：

```bash
gzip -d mihomo-linux-amd64-*.gz
chmod +x mihomo-linux-amd64-*
sudo mv mihomo-linux-amd64-* /usr/local/bin/mihomo
mihomo -v
```

能看到版本号，就说明程序本体没问题。

这一步我通常不会急着写服务文件，因为二进制能跑和配置能跑是两件事。先把配置文件准备好，再前台启动测试，排错会舒服很多。

## 准备配置文件

如果你手上已经有 Clash / Mihomo 订阅链接，可以先下载成配置文件：

```bash
sudo curl -L "你的订阅地址" -o /etc/mihomo/config.yaml
```

这里有个小提醒：订阅地址不要提交到 Git，也不要贴到公开文档里。很多订阅链接本身就相当于凭证，泄露后别人可以直接使用。

下载完之后打开看一下：

```bash
sudo nano /etc/mihomo/config.yaml
```

我会重点检查这几项：

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

这几个字段决定了这套代理是否“收得住”：

- `mixed-port` 是 HTTP / SOCKS 混合端口，命令行最常用。
- `allow-lan: false` 表示不允许局域网设备连进来。
- `bind-address: 127.0.0.1` 表示只监听本机。
- `external-controller` 也绑定本机，避免控制接口暴露出去。
- `secret` 给控制接口加一层认证。

我个人最在意的是 `allow-lan` 和 `bind-address`。服务器上很多问题不是“功能不能用”，而是“功能太能用了”，端口一不小心暴露出去，就会变成麻烦。

## 先前台跑一次

配置文件准备好之后，先前台启动：

```bash
sudo mihomo -d /etc/mihomo -f /etc/mihomo/config.yaml
```

如果配置有问题，这里会直接报出来。常见问题包括 YAML 缩进错误、订阅内容不完整、端口被占用等。

另开一个终端测试：

```bash
curl -I --proxy http://127.0.0.1:7890 https://www.google.com/generate_204
```

或者看一下出口 IP：

```bash
curl --proxy http://127.0.0.1:7890 https://ipinfo.io/ip
```

这一步不要省。能前台跑通，再交给 `systemd`，后面排查会少很多弯路。

整体流程可以按这个顺序来：

![mihomo 配置流程](/images/linux-proxy-workflow.svg)

## 交给 systemd 托管

前台测试没问题后，再创建服务文件：

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

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mihomo
sudo systemctl status mihomo
```

看实时日志：

```bash
journalctl -u mihomo -f
```

以后改了配置，重启服务即可：

```bash
sudo systemctl restart mihomo
```

到这里，代理内核已经变成一个后台服务了。服务器重启后它会自己起来，不需要手动开一个终端挂着。

## 命令行按需开启代理

我没有选择给全系统写死代理，而是在 shell 里放两个函数。需要时打开，不需要时关掉。

编辑 `~/.bashrc` 或 `~/.zshrc`：

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

使用时就是：

```bash
proxy_on
curl https://github.com
proxy_off
```

这种方式的好处是边界很清楚。当前 shell 里的命令会走代理，其他服务不会被莫名其妙影响。

## Git 单独配置代理

有时候我只想让 Git 走代理，不想影响当前 shell 的其他命令，可以单独配置：

```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

取消也很直接：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

如果是临时 clone 一个仓库，我更倾向于先 `proxy_on`，用完再 `proxy_off`。全局 Git 代理适合长期需要的机器。

## Dashboard 怎么访问

如果配置里启用了 `external-controller: 127.0.0.1:9090`，不要直接开放 `9090` 端口。需要看 Dashboard 时，用 SSH 做端口转发就够了：

```bash
ssh -L 9090:127.0.0.1:9090 user@your-server
```

然后在本地浏览器访问：

```text
http://127.0.0.1:9090
```

这样控制接口仍然只在服务器本机可见，浏览器通过 SSH 隧道访问它。

## 我会检查的几个点

配置完后，我一般会按这个顺序检查：

```bash
sudo systemctl status mihomo
```

```bash
ss -lntp | grep mihomo
```

```bash
curl --proxy http://127.0.0.1:7890 https://ipinfo.io/ip
```

如果命令行代理没有生效，先确认当前 shell 是否执行过：

```bash
proxy_on
```

如果 `curl --proxy` 能用，但 `git` 或其他服务不能用，那就要分清楚它们到底读取的是当前 shell 环境变量，还是自己的配置文件。systemd 管理的服务尤其如此，它不会继承你手动打开的终端环境。

## 小结

这套配置最重要的不是某一条命令，而是边界：

- `mihomo` 可以常驻后台。
- 代理端口只监听本机。
- 命令行按需开启代理。
- 控制面板通过 SSH 隧道访问。

这样既解决了服务器下载依赖、访问外部资源的问题，也不会把整台机器的网络行为改得不可控。对我来说，这是一个比较稳妥的服务器代理配置方式。
