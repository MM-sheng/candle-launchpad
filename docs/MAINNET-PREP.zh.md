# 主网上线准备（未审计）

当前尚未部署主网。用户已决定暂不第三方审计，合约冻结于 v1.0.0-rc1。

已登记的公开地址（2026-09-17）：

- 部署钱包：`0xd4F120e798e17A896f4939bd77e90B0A8803c95a`
- crank 钱包：`0x0b57d0Ce1C3577cD0Fd08EaBEA98D39B1947BF63`
- Safe 第二签名人：`0xD4aFFea16389190eA8FBCb8b1a8F4f430F767647`

## 用户准备顺序

1. 在自己的钱包中建立专用部署账号和独立 crank 账号；保管恢复信息，不发送到聊天。不要复用测试网私钥。
2. 创建 BNB Chain Safe 多签，确定独立签名人和阈值。提供公开 Safe 地址。不能把一个人持有的多个热钱包当作独立保管。
3. 建立 BNB 主网 Chainlink VRF v2.5 订阅，提供公开订阅 ID。按实时费用估算充值，不沿用旧文档的固定预算。
4. 准备主网 RPC、区块浏览器验证 API key、Reown WalletConnect projectId。服务密钥只填本地或托管平台；NEXT_PUBLIC 配置会公开给浏览器。
5. 准备 Vercel 账号、域名及 crank 服务器。上线 checklist 要求两个节点和告警，目前只提供 PM2 运行模板，服务器与告警尚未部署。

入口：Safe https://app.safe.global/ · VRF https://vrf.chain.link/ · Reown https://cloud.reown.com/ · Vercel https://vercel.com/

## 本地配置

- `.env.mainnet.example` → `.env.mainnet`：主网部署配置，coordinator / key hash 必须部署前对照官方文档核实。
- `.env.crank.example` → `.env.crank`：独立 crank 配置，不放部署私钥。
- `app/.env.mainnet.example`：填入前端托管平台的生产环境变量。变更 NEXT_PUBLIC 配置后重新构建。
- 保留现有测试网配置。主网不允许使用 mock provider。

## 部署前验收

- `git diff v1.0.0-rc1 -- src/` 应为空；运行完整 Foundry 测试和前端生产构建。
- 用两个钱包在测试网页走完创建、出价、保存并重新导入 salt、揭示、清算、领取、提现。自动测试不能代替钱包交互验收。
- 核实实际链 ID 为 56、部署钱包、订阅、RPC、Safe 地址及预算。先模拟部署，再广播。

## 部署及交接

1. 部署真实 Chainlink provider 和 auction house，验证源码，记录地址与交易 hash。
2. 在 VRF 订阅中添加 provider 为 consumer。
3. 部署者调用 provider 的 `transferOwnership(SAFE_ADDRESS)`；Safe 执行 `acceptOwnership()`；读回 `owner()`，必须等于 Safe。只提交 transfer 不算完成。
4. 核实 house 的 `randomnessProvider()`、provider 的 `auctionHouse()`、coordinator、订阅 ID 和 consumer 登记。
5. 填好 `.env.crank` 后以 PM2 加载 `ecosystem.config.cjs`。在独立服务器/RPC 上运行第二个实例，完成钱包余额、VRF 余额和拍卖异常告警。
6. 发布前端，核对 BNB mainnet 标签、未审计提示、浏览器链接和钱包网络。
7. 用极小额真实 BNB 完成一场内部端到端拍卖，记录全部交易，再邀请知情用户。

小规模是运营政策，合约没有全平台额度限制。未审计提示、多签和测试不构成无漏洞保证。
