# Hetzner 测试网公测部署

正式前端运行在 Vercel（https://wickbid.com）。Hetzner 只运行 crank；crank 的私钥通过服务器上的环境文件注入，不进入镜像或 Git。

当前公测配置：

- BNB Chain Testnet（chain ID 97）
- Auction House：`0x662Fe2bC63A414a020B20a7835832eaeBc594881`
- 测试代币：`0xcb415e4C71df31128f5597Ad067355396D343c9a`
- crank 容器：`candle-beta-crank`

检查运行状态：

```bash
docker ps --filter name=candle-beta
docker logs --tail 100 candle-beta-crank
```

更新时重新构建镜像并用相同名称重建容器。不要把 `.env`、私钥或 WalletConnect 密钥复制进镜像。
