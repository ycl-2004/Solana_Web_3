# Session_1

`Session_1` 用来收纳当前阶段的第一个 Solana 实验项目。

## 子项目

| 项目名           | 说明                                          | 路径                       | 状态                 |
| ---------------- | --------------------------------------------- | -------------------------- | -------------------- |
| `pxsol-sim-stor` | 最小链上存储程序，已扩展为 Phantom 前端留言板 | `Session_1/pxsol-sim-stor` | Phantom 前端版已完成 |

## 学习重点

- 理解 Solana program 的最小结构
- 理解 PDA 派生与账户数据写入
- 用脚本完成链上读写验证
- 把链上功能包装成可部署的前端 demo

可以。你现在有两条本地测试路径，而且两条都还能继续用 devnet。

用原来的 CLI 测试
去这个目录：
pxsol-sim-stor
在你已经激活 .venv 的前提下，直接跑：

cd "/Users/yichenlin/Desktop/Claude/Solana*Learning/Solana*开发/Session_1/pxsol-sim-stor"
python3 scripts/test_store.py write "hello from cli"
python3 scripts/test_store.py read
python3 scripts/test_store.py update "new cli message"
这条路理论上还是会成功，因为我没有改你的合约，也没有删掉 CLI 读写逻辑。scripts/test_store.py 还在。

用本地 Phantom 前端版测试
去这个目录：
web
然后开一个静态服务器：

cd "/Users/yichenlin/Desktop/Claude/Solana*Learning/Solana*开发/Session_1/pxsol-sim-stor/web"
python3 -m http.server 8080
浏览器打开：
http://127.0.0.1:8080

然后测试流程是：

安装 Phantom
Phantom 切到 devnet
连接钱包
如果没测试币，去 faucet 领一点 devnet SOL
输入留言
点击提交
你现在本地用 devnet 跑，会不会成功
大概率会，但要满足这几个条件：
你的钱包网络是 devnet
这个 Program ID Fvhhzt6hCB1NjYe9MMKU5Jxq1xzYeod8FWFh3ptsNWK7 确实部署在 devnet
钱包里有一点 devnet SOL
Phantom 没有拦截或拒签
CLI 这条你前面已经成功过，所以说明“合约 + devnet + RPC”基本是通的。
前端版如果失败，最常见原因不是代码，而是：

Phantom 不在 devnet
钱包没测试币
用户取消签名
浏览器扩展没装好
CLI 以后还能不能继续用
可以，完全可以。
现在项目里是两套入口并存：
CLI：适合你自己调试链上逻辑
Phantom 前端：适合做网页 demo
所以你以后可以这样理解：

想快速验证合约：用 CLI
想演示给别人看：用 Phantom 前端
你现在最推荐先跑哪条
先跑 CLI，再跑前端。
推荐顺序：

cd "/Users/yichenlin/Desktop/Claude/Solana*Learning/Solana*开发/Session_1/pxsol-sim-stor"
python3 scripts/test_store.py read
确认 CLI 正常后，再开前端：

cd "/Users/yichenlin/Desktop/Claude/Solana*Learning/Solana*开发/Session_1/pxsol-sim-stor/web"
python3 -m http.server 8080
如果你愿意，我下一条可以直接给你一份“从本地测试到 GitHub push”的完整命令清单，你照着一行一行跑就行。
