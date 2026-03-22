# Solana_开发

这是我的 Solana 学习与实验仓库目录，按 session 和主题逐步整理不同的小项目。  
当前采用同一个 repo 下多项目共存的方式，方便统一管理学习过程、代码演进和后续 demo 发布。

## 项目导航

| 项目名 | 简短说明 | 本地路径 | GitHub 子目录 | Demo 状态 |
| --- | --- | --- | --- | --- |
| `pxsol-sim-stor` | 一个最小链上字符串存储实验，已扩展出 Phantom 前端留言板 | `Solana_开发/Session_1/pxsol-sim-stor` | `Session_1/pxsol-sim-stor/` | 命令行 + 本地版已完成；Phantom 前端版已完成 |

## 仓库组织方式

- `Session_*` 目录用于按学习阶段归档项目
- 每个子项目单独保留自己的 `README.md`
- 当前 repo 作为学习型 monorepo 使用，不急着拆成多个独立仓库

## GitHub 展示策略

- 仓库主页由本文件承担总入口作用
- 每个子项目 README 负责解释自己的目标、运行方式和当前状态
- 后续若接入 GitHub Pages，默认结构为：
  - `/SolanaWeb3/` 作为总入口
  - `/SolanaWeb3/pxsol-sim-stor/` 作为当前项目页面

## 当前重点项目

### `Session_1/pxsol-sim-stor`

这个项目目前验证了几件事：

- Rust 写的最小 Solana 程序可以在 devnet 上完成 PDA 数据写入和读取
- 命令行脚本已经能完成写入、读取和更新
- 本地网页版本已经能做出“每个钱包一条当前留言”的留言板原型

当前下一阶段重点会放在：

- GitHub Pages 实际部署
- 页面 polish 和 demo 文案
- 如需真正留言墙，再升级合约支持多条消息
