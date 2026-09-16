# Candle Launchpad — 给 Codex 的项目说明

你接手的是一个 **Solidity / Foundry** 项目：在 BNB Chain 测试网上做"随机截止 + 加密出价 + 统一清算价"的代币发行拍卖（candle auction）。合约与测试已经完成并全部通过，你的任务是继续后面的里程碑（见"下一步"）。

**请先完整阅读**：`README.md`（机制、结算规则、设计决策）和 `src/CandleAuctionHouse.sol`。

## 项目要证明的三件事

1. 出价在揭示前不可见（commit-reveal，承诺 = `keccak256(abi.encode(chainid, house, auctionId, bidder, tick, quantity, salt))`）。
2. 截止区块在出价窗口结束后才由链上随机数决定（Chainlink VRF v2.5），事前不可知。
3. 所有中标者按同一价格成交，未成交资金全额可退。

## 目录

```
src/CandleAuctionHouse.sol          单合约管理多场拍卖（auctionId），报价资产是原生币
src/interfaces/IRandomnessProvider.sol
src/randomness/MockRandomnessProvider.sol   测试用，手动 fulfill()
src/randomness/ChainlinkVRFProvider.sol     VRF v2.5 消费者，已编译、未在链上验证
test/Base.t.sol                     共用夹具 + claimAllAndCheck()（守恒不变量断言）
test/CandleAuctionHouse.t.sol       19 个单元测试（计划清单 1–11、13、14）
test/Reentrancy.t.sol  test/Fuzz.t.sol  test/Invariant.t.sol
script/Deploy.s.sol                 按 RANDOMNESS_PROVIDER=mock|chainlink 部署
scripts/crank.ts                    viem crank（npm run crank -- --all）
app/                                Next.js + wagmi + RainbowKit 前端
abi/                                导出的 ABI（npm run abi 重新生成）
docs/devnet-run.md                  M4 的部署与完整拍卖记录
foundry.toml  remappings.txt  .env.example
legacy-solana/                      旧的 Anchor 版本，已废弃，不要动
```

依赖：`lib/forge-std`，OpenZeppelin 与 Chainlink 通过 `node_modules`（见 `remappings.txt`）。

## 状态机

```
Committing ──(block > endBlock, requestRandomness)──► AwaitingRandomness
    │                                                        │ onRandomness（只能由登记的 provider 调、每场一次）
    │ settleFallback（超时 randomnessTimeoutBlocks）           ▼
    └───────────────────────────────────────────────────► Revealing ──finalize──► Finalized / Cancelled
```

`cutoffBlock = lower + random % (endBlock − lower + 1)`，`lower = startBlock + ceil(len × minCutoffRatioBps / 10000)`。

## 已经拍板、不要再改的决定

- 清算规则、结算规则（README 表格）、守恒不变量：**一律不得为了省 gas 或简化而改动**。有优化想法先写进本文件末尾"待决问题"，不要直接改。
- 边际档位用 `marginSupply / marginDemand` 原始数计算 `fill = floor(q × S / D)`，不用 1e18 比例。
- `withdrawProceeds` 可重复调用：finalize 后立即可提"确定未售出"代币，边际舍入零头在所有 bid claim 完后释放。
- 随机数请求每场一次；超时后任何人可 `settleFallback`，cutoff = endBlock。
- issuer 只能在 startBlock 之前取消；`minRaise` 未达或零成交 → Cancelled，全额退款、无罚没。
- 罚没归 issuer；单地址出价次数不限；`minCutoffRatioBps` 默认 5000；揭示期默认约 10 分钟对应的区块数。
- fee-on-transfer 代币在 createAuction 里按余额差拒绝。
- BNB 测试网实测 **0.45s/块**（2026-09，Maxwell/Fermi 升级后），10 分钟 ≈ 1300 块；公共 RPC 有延迟/限流：`revealDurationBlocks` 默认 ≥ 1300（M4 的 auction 2 因 60 块揭示期太短而作废）。
- 所有 revert 用自定义 error；所有转出资金的函数 `nonReentrant` + checks-effects-interactions；退款 pull 模式。

## 常用命令

```bash
forge build
forge test                                           # 23 个测试应全部通过
forge test --gas-report --no-match-contract "Invariant|Fuzz"
```

## 下一步（按顺序做，每个里程碑完成后停下汇报测试结果 + gas 报告）

### M4 — Chainlink VRF + BNB 测试网
1. 打开 https://docs.chain.link/vrf/v2-5/supported-networks ，核对 BNB 测试网（chainId 97）的 coordinator 地址和 key hash，更新 `.env.example` 里的 `VRF_COORDINATOR` / `VRF_KEY_HASH`（现在的值是凭记忆写的，必须核对）。
2. 用 `.env` 里的测试私钥（用户自己填，你不要生成、不要打印）部署：`RANDOMNESS_PROVIDER=chainlink forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast --verify`。
3. 把 `ChainlinkVRFProvider` 地址加为 VRF 订阅的 consumer（订阅 ID 在 `.env`）。
4. 用 `cast` 或脚本跑通一场完整拍卖：createAuction → 两个地址 commitBid → 等 endBlock → requestRandomness → 等 VRF 回调 → revealBid → finalize → claim → withdrawProceeds。把每笔交易 hash 记录到 `docs/devnet-run.md`。
5. 在 BscScan 上验证合约。

### M5 — 前端 + crank（Claude 已写好代码，见 app/ 与 scripts/crank.ts；剩余：真机验收）
- `app/`：Next.js + wagmi + viem + RainbowKit。两个页面：创建拍卖（issuer）、拍卖详情（状态、倒计时并明确标注"截止时刻未知"、出价表单、salt 存 localStorage + 下载按钮、Revealing 阶段一键揭示、Finalized 后显示清算价/需求直方图/自己的成交结果/Claim 按钮）。
- `scripts/crank.ts`（viem）：轮询状态，到点自动调 `requestRandomness` / `settleFallback` / `finalize`，监听合约事件。
- 验收：两个钱包在 BNB 测试网上通过网页完成一场拍卖（`cd app && npm run dev`，另开终端 `npm run crank -- --all`）。把交易 hash 追加到 `docs/devnet-run.md`。
- 已完成的替代验收：`scripts/e2e.ts` 用两个钱包走完 auction #4（与前端相同的合约调用），记录在 `docs/devnet-run.md`；页面各阶段显示均与链上一致。剩余只差人用 MetaMask 在网页上点一遍。

### M6 — Robinhood Chain 测试网
- 先在 Chainlink 官方文档确认 VRF v2.5 已在 Robinhood Chain 测试网上线并拿到 coordinator/keyHash。**如果未上线，不要自行换其他随机源**，记录到"待决问题"并停下询问。
- 上线的话用同一合约部署，配置写进 `foundry.toml` 的 `robinhood_testnet`。

## 绝对不要做

- 不部署到任何主网；不使用真实资金或真实私钥；不把 `.env` 提交进仓库。
- 不改动清算/结算规则和守恒不变量；不擅自决定"待决问题"里的事项。
- 不删除或重写现有测试来让它们通过。

## 待决问题（记录在这里，等用户拍板）

- `commitBid` 若把 `deposit`、`quantity` 限制为 `uint128` 可再省一个存储槽（约 22k gas/bid），但会改变接口类型。
- **Robinhood Chain：Chainlink VRF v2.5 未上线**（2026-09-16 核实 https://docs.chain.link/vrf/v2-5/supported-networks ，支持列表 18 条链里没有 Robinhood；Chainlink 在 Robinhood Chain 上目前只有 Data Feeds）。按规划不得自行换随机源，M6 暂停，等用户决定：等待 VRF 上线 / 改用其他方案（需用户指定）/ 放弃 M6。
- BNB 测试网 coordinator：Chainlink 文档当前列的是 `0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06`，M4 实际用的 `0xDA3b641D438362C440Ac5458c57e00a712b66700` 也成功回调过。新部署时以文档为准。
