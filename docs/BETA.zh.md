# 测试网公测（Beta）发布手册

目标：把测试网版本放到公网，任何人用免费测试币就能试；发推收集反馈。**不涉及真钱。**

## 已经准备好的

- 合约在 BNB 测试网：[`0x662F…4881`](https://testnet.bscscan.com/address/0x662Fe2bC63A414a020B20a7835832eaeBc594881#code)
- 测试代币 CNDL `0xcb41…3c9a`，任何人可 mint，首页有一键领取按钮
- 首页"3 步上手"引导：切网络 → 水龙头领 tBNB → mint 测试币
- 全站"未审计"横幅
- crank 已在 Hetzner 上作为 Docker 容器持续运行；`.github/workflows/crank.yml` 保留为手动备用

## 你要做的（约 20 分钟）

### 1. crank（已完成）

Hetzner 上的 `candle-beta-crank` 会持续扫描并推进全部拍卖。GitHub Actions 工作流只作手动备用；若以后启用它，先在仓库 Actions Secrets 中配置 `CRANK_PRIVATE_KEY`。

### 2. 部署前端到 Vercel

1. https://vercel.com 用 GitHub 登录，Import 这个仓库
2. **Root Directory** 填 `app`
3. Environment Variables 填四个（都在 `app/.env.example` 里）：

```
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_AUCTION_HOUSE=0x662Fe2bC63A414a020B20a7835832eaeBc594881
NEXT_PUBLIC_TEST_TOKEN=0xcb415e4C71df31128f5597Ad067355396D343c9a
NEXT_PUBLIC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545,https://bsc-testnet-rpc.publicnode.com
```

4. Deploy。拿到 `xxx.vercel.app` 链接（以后想换域名在 Vercel 里加）
5. 可选：https://cloud.reown.com 免费注册拿 `NEXT_PUBLIC_WC_PROJECT_ID`，加上后手机钱包能扫码

### 3. 自己先走一遍

用两个钱包（比如 MetaMask 两个账户）：mint 测试币 → 创建一场拍卖（窗口设 10 分钟）→ 各出一次价 → 等 crank 推进 → 揭示 → 等 finalize → claim。全程顺利再发推。

### 4. 发推

下面是几版草稿，挑一版改成你的语气。

---

**中文 · 短版**

> 做了个东西：链上「蜡烛拍卖」发币平台，测试网公测 🕯️
>
> · 出价加密，没人能看别人的价
> · 截止时间由 Chainlink VRF 随机决定，最后一秒狙击无效
> · 所有人按同一清算价成交，多付的退
>
> BNB 测试网，免费试：[链接]
> 代码开源：github.com/MM-sheng/candle-launchpad
>
> 未审计，测试币，欢迎来找 bug。

**中文 · 长版（thread）**

> 1/ 新币发售的老问题：机器人抢跑、大户看着你出价、先到先得不公平。我把 17 世纪的「蜡烛拍卖」搬到了链上，测试网今天开放。🧵
>
> 2/ 三个机制：
> ① 密封出价 — 提交的是哈希，窗口关闭后才揭示
> ② 随机截止 — 窗口关了之后 Chainlink VRF 才决定真正的截止块，之后的出价全退。你不知道蜡烛什么时候灭，所以早出价才是最优策略
> ③ 统一清算价 — 从高到低排到卖完，那个价格所有人一样付
>
> 3/ 这是 Polkadot 平行链拍卖用过的机制，但在 EVM 上做成可用产品的很少。合约无管理员、不可升级、任何人可开拍卖；恶意代币也不能锁住别人的押金。
>
> 4/ 现在是测试网 beta：免费测试币、未审计、可能有 bug。想试的：[链接]。想看代码的：github.com/MM-sheng/candle-launchpad
>
> 5/ 最想听到的反馈：如果你要发币，你会用这个吗？为什么不会？DM 开着。

**English · short**

> Shipped a testnet beta: an on-chain candle-auction launchpad 🕯️
>
> · Sealed bids — nobody sees your price
> · Random cutoff via Chainlink VRF — last-second sniping is pointless
> · One uniform clearing price for everyone; overpayment refunded
>
> BNB testnet, free to try: [link]
> Open source: github.com/MM-sheng/candle-launchpad
>
> Unaudited. Test money only. Break it and tell me.

---

## 发推之后

- 看 GitHub Actions 的 crank 有没有一直绿。它失败最常见的原因是 crank 钱包没 tBNB 了
- 别人创建的拍卖会出现在首页列表里；有人报"卡住了"，先看那场拍卖的状态和 crank 日志
- 收集的反馈记到 `docs/FEEDBACK.md`（新建即可）

## 已知限制（有人问的时候）

- 出价的 salt 存在浏览器 + 下载的 JSON 里，换设备要导入
- 公共 RPC 偶尔限流，页面刷新一下就好
- 手机钱包扫码要配 WalletConnect id（第 2 步第 5 点）
- Chainlink VRF 测试网偶尔慢，超过超时会自动退化为普通密封拍卖（页面会标 fallback）
