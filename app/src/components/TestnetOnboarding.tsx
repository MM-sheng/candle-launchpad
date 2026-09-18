"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseAbi, parseUnits, type Address } from "viem";
import { CHAIN, EXPLORER } from "@/lib/config";
import { useLanguage } from "./Language";

export const TEST_TOKEN = (process.env.NEXT_PUBLIC_TEST_TOKEN ?? "") as Address;
const FAUCET = "https://www.bnbchain.org/en/testnet-faucet";

/** Shown on testnet only: how to get tBNB and free test tokens to try the launchpad. */
export function TestnetOnboarding({ compact = false }: { compact?: boolean }) {
  const { zh } = useLanguage();
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (CHAIN.id !== 97) return null;

  async function mint() {
    if (!address || !client || !TEST_TOKEN) return;
    setBusy(true);
    setMsg(undefined);
    try {
      const hash = await writeContractAsync({
        address: TEST_TOKEN,
        abi: parseAbi(["function mint(address to, uint256 amount)"]),
        functionName: "mint",
        args: [address, parseUnits("1000", 18)],
      });
      await client.waitForTransactionReceipt({ hash });
      setMsg(zh ? "已向你的钱包铸造 1,000 CNDL。" : "Minted 1,000 CNDL to your wallet.");
    } catch (e: any) {
      setMsg(e.shortMessage ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card onboard">
      <h2>{zh ? "三步开始" : "Try it in three steps"}</h2>
      <ol>
        <li>{zh ? <>连接钱包并切换到 <b>BNB 智能链测试网</b>（chainId 97），RainbowKit 会提示添加网络。</> : <>Connect a wallet and switch to <b>BNB Smart Chain Testnet</b> (chainId 97). RainbowKit will offer to add it.</>}</li>
        <li>{zh ? <>从<a href={FAUCET} target="_blank">官方水龙头</a>领取免费 tBNB，用于 gas 和出价（0.3 tBNB 足够）。</> : <>Get free tBNB for gas and bids from the <a href={FAUCET} target="_blank">official faucet</a> (0.3 tBNB is plenty).</>}</li>
        <li>
          {zh ? <>想要<b>创建</b>拍卖？先领取免费测试代币：</> : <>Want to <b>create</b> an auction? Mint free test tokens: </>}
          <button className="secondary" disabled={!address || busy || !TEST_TOKEN} onClick={mint}>
            {busy ? (zh ? "铸造中…" : "Minting…") : (zh ? "铸造 1,000 测试 CNDL" : "Mint 1,000 test CNDL")}
          </button>
          {TEST_TOKEN && <span className="muted"> — token <a href={`${EXPLORER}/token/${TEST_TOKEN}`} target="_blank">{TEST_TOKEN.slice(0, 8)}…</a></span>}
        </li>
      </ol>
      {msg && <div className="muted">{msg}</div>}
      {!compact && (
        <p className="muted" style={{ margin: 0 }}>
          {zh ? "这里全部使用测试币。出价需要保存密钥（salt）才能揭示；网站会保存在浏览器并下载备份，请妥善保管。拍卖会自动推进，提交窗口关闭后请稍等并刷新。" : "Everything here is test money. Bids need a saved secret (salt) to reveal — the site saves it in your browser and downloads a copy; keep it. Auctions advance automatically (a crank runs every few minutes), so after the commit window closes, wait a bit and refresh."}
        </p>
      )}
    </div>
  );
}
