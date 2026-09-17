# Candle Launchpad — 项目说明（中文）

更新：2026-09-17

## 这是什么

一个跑在 BNB Chain 上的**代币发行拍卖平台**。项目方把要发的代币存进合约开一场拍卖，买家出价，结束后所有中标者按同一个价格成交。

它和普通发售的区别在三个机制（"蜡烛拍卖"）：

| 机制 | 做法 | 解决的问题 |
|---|---|---|
| 密封出价 | 出价时只上链哈希 + 押金，窗口关闭后再揭示 | 没人能看着别人的价来出价 |
| 随机截止 | 窗口关闭后由 Chainlink VRF 决定真正的截止区块，之后的出价全额退 | 最后一秒狙击无意义，鼓励早出价 |
| 统一清算价 | 出价从高到低排到供应量为止，该价格即成交价；出高价者多付的退回 | 定价公平，市场自己发现价格 |

其他规则：边际档按比例成交且永不超发；有效且未揭示的出价按每场参数罚押金（前端默认 10%），归项目方；取消场次和截止后出价不罚；募资未达标自动取消全额退款；VRF 超时退化为普通密封拍卖；任何人可代他人 claim，钱永远只给出价人。

## 现在的状态

**阶段：代码完成并冻结（`v1.0.0-rc1`），在 BNB 测试网跑通，未上主网。**

已完成：

- 合约 `src/CandleAuctionHouse.sol`：单合约管多场拍卖，无管理员、不可升级
- 针对"任何人可开拍卖"做了资金兜底：增加代币交付失败和 BNB 拒收的暂存、重试及退款路径；代币交付失败后须等待 30 天才可尝试退款，不代表无漏洞保证
- 测试：28 个（单元 + 重入 + 恶意代币 + fuzz + invariant），包含两条守恒不变量测试；Slither 扫描过
- BNB 测试网两次部署，各跑通一场真实拍卖（含真实 Chainlink VRF 回调），记录在 `docs/devnet-run.md`
- 前端（Next.js + wagmi）：创建拍卖 / 出价（salt 本地保存 + 自动下载）/ 揭示 / 清算结果 / claim / 项目方提现，多 RPC 容错
- crank 脚本（自动推进状态）、e2e 脚本、部署脚本、上线 checklist（`docs/LAUNCH.md`）
- 代码公开：https://github.com/MM-sheng/candle-launchpad

已决定的范围（v1）：BNB 主网、原生 BNB 报价、**不收手续费、任何人可开拍卖、不自动建 DEX 池**、暂不做 Robinhood Chain（那条链没有 Chainlink VRF）。

## 没有的东西

- **第三方审计**：暂缓。决定是先不审计；这意味着先面向小规模、知情用户开放，网页必须标注"未审计"；规模由运营控制，合约没有全平台额度限制
- 商业模式：v1 不收费，是工具不是生意
- 项目方准入：无审核，第一批用户可能是垃圾盘，需要前端风险提示
- 拍卖后流动性：不自动建池，项目方自己做

## 下一步

### 上主网需要（详见 `docs/LAUNCH.md`）

由你操作（注册账号、花钱，资金预算待按实际 VRF 充值、gas 和托管费用核实）：
1. 专用部署钱包、独立 crank 钱包、Safe 多签及签名人
2. Chainlink VRF 主网订阅并充值
3. 私有 RPC（NodeReal / Alchemy / QuickNode 免费档）
4. BscScan API key、WalletConnect projectId、域名 + Vercel

由 Claude/Codex 操作：
5. 主网部署 + 验证，provider 加为 VRF consumer
6. **provider 所有权转到多签（Safe）**——不审计可以，这步不能省，否则持有 provider 私钥的人能操纵截止块
7. 前端加"未审计"横幅、指向主网、部署
8. crank 用 pm2 常驻
9. 用真钱跑一场极小的拍卖验证

### 更重要的问题

技术已经不是瓶颈，**没验证的是有没有人要用**。建议在花任何主网的钱之前，用测试网版本去找 3–5 个真的要发币的项目方聊。最可能的用户：有真实社区、怕被机器人割的 DAO/应用；第一次发币需要价格发现的项目；想做官方发行工具的链或生态。不是 meme 币。

## 目录速查

```
src/                 合约（CandleAuctionHouse + 随机数 provider）
test/                Foundry 测试
script/Deploy.s.sol  部署
scripts/crank.ts     状态推进脚本      scripts/e2e.ts  两钱包端到端
app/                 前端
abi/                 导出的 ABI
docs/LAUNCH.md       上线 checklist    docs/devnet-run.md  测试网记录
AGENTS.md            给 Codex 的工作说明
legacy-solana/       废弃的 Solana 版本
```
