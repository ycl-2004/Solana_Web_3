# pxsol-sim-stor

`pxsol-sim-stor` 是 `Solana_开发` 里的第一个完整实验项目。  
它从一个最小的链上字符串存储程序出发，逐步扩展成了一个可连接 Phantom 的 devnet 留言板 demo。

## 项目简介

这个项目当前验证的是：

- 如何用 Rust 编写一个最小 Solana program
- 如何用 PDA 为每个钱包地址保存链上数据
- 如何通过 Python 脚本完成写入、读取和更新
- 如何把命令行交互包装成网页，并进一步改成纯前端 DApp

## 当前状态

- 当前版本：Phantom 前端版 + 本地实验版
- 运行网络：Solana devnet
- 交互方式：Terminal + 本地 Python 网页服务 + Phantom 浏览器前端
- 部署目标：GitHub Pages

## 当前链上语义

这份合约现在不是“公共多条留言墙”，而是：

- 每个钱包地址映射到一个 PDA
- 每个钱包只能保存一条当前留言
- 同一个钱包再次写入时，会覆盖自己之前的内容

所以更准确地说，它现在是一个“每钱包一条最新留言”的链上留言板原型。

## 技术点

- Solana Program（Rust）
- PDA 派生与账户写入
- Python 脚本调用 RPC
- Phantom 钱包接入
- 浏览器端 `@solana/web3.js`
- 可部署的静态 Web UI
- Devnet 调试流程

## 运行方式

先在虚拟环境里安装依赖：

```bash
pip install -r requirements.txt
```

### 1. Terminal 读写链上字符串

```bash
python3 scripts/test_store.py write "hello solana"
python3 scripts/test_store.py read
python3 scripts/test_store.py update "new content"
python3 scripts/test_store.py roundtrip "first text" "second text"
```

### 2. 启动本地 Python 网页留言板

```bash
python3 app/server.py
```

然后打开：

```text
http://127.0.0.1:8000
```

### 3. 直接打开 Phantom 前端版

这个版本不依赖 Python server。  
你可以直接用静态文件托管，或者在本地用任意静态服务器打开 `web/` 目录。

例如：

```bash
cd web
python3 -m http.server 8080
```

然后打开：

```text
http://127.0.0.1:8080
```

## Demo 状态

- 命令行链上读写：已完成
- 本地网页留言板：已完成原型
- Phantom 钱包接入：已完成
- GitHub Pages 发布路径：已配置 workflow

## 当前 Phantom 前端版怎么工作

- 浏览器直接检测并连接 Phantom
- 页面使用 `@solana/web3.js` 直连 devnet RPC
- 用户自己签名并发送交易，不再读取本地私钥文件
- 页面直接读取 program 下面的链上账户来展示留言
- 连接钱包本身不需要余额，真正发留言时需要少量 devnet SOL

## GitHub Pages

仓库根目录已经增加 GitHub Pages workflow。  
它会把这个子项目发布为：

- `/SolanaWeb3/` 作为项目总入口
- `/SolanaWeb3/pxsol-sim-stor/` 作为这个项目的页面

如果你的 GitHub 默认分支不是 `main`，记得把 workflow 里的分支名同步改掉。

## 后续计划

下一版准备往这几个方向演进：

- 补页面截图和更完整的项目介绍
- 增加更友好的错误提示和网络状态提示
- 如果后续升级合约，再支持一个钱包发布多条留言
