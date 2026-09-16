/**
 * Crank: polls an auction and pushes it through the permissionless transitions.
 *
 *   npx ts-node scripts/crank.ts <AUCTION_PUBKEY> [--interval 5000]
 *
 * Uses ANCHOR_PROVIDER_URL / ANCHOR_WALLET (same as `anchor` CLI).
 * With the mock randomness source the wallet must be the auction issuer
 * (it reveals the mock value). With Switchboard (M4) anyone can crank.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { CandleLaunchpad } from "../target/types/candle_launchpad";

const idl = require("../target/idl/candle_launchpad.json");

async function main() {
  const [auctionArg, ...rest] = process.argv.slice(2);
  if (!auctionArg) throw new Error("usage: crank.ts <AUCTION_PUBKEY> [--interval ms]");
  const interval = Number(rest[rest.indexOf("--interval") + 1] || 5000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program<CandleLaunchpad>(idl, provider);
  const auction = new PublicKey(auctionArg);
  const [mockRand] = PublicKey.findProgramAddressSync([Buffer.from("mock_rand"), auction.toBuffer()], program.programId);

  const log = (...a: any[]) => console.log(new Date().toISOString(), ...a);

  for (;;) {
    const a = await program.account.auction.fetch(auction);
    const slot = await provider.connection.getSlot();
    const state = Object.keys(a.state)[0];
    log(`slot=${slot} state=${state} end=${a.endSlot} cutoff=${a.cutoffSlot} revealEnd=${a.revealEndSlot}`);

    try {
      if (state === "committing" && slot > a.endSlot.toNumber()) {
        const existing = await provider.connection.getAccountInfo(mockRand);
        if (!existing) {
          log("creating mock randomness");
          await program.methods
            .mockCreateRandomness()
            .accounts({ payer: provider.wallet.publicKey, auction, randomness: mockRand, systemProgram: SystemProgram.programId } as any)
            .rpc();
        }
        const r = await program.account.mockRandomness.fetch(mockRand);
        if (!r.revealed) {
          log("revealing mock randomness");
          await program.methods
            .mockRevealRandomness(Array.from(randomBytes(32)) as any)
            .accounts({ issuer: provider.wallet.publicKey, auction, randomness: mockRand } as any)
            .rpc();
        }
        log("request_randomness");
        await program.methods.requestRandomness().accounts({ auction, randomness: mockRand } as any).rpc();
      } else if (state === "awaitingRandomness") {
        log("settle_randomness");
        await program.methods.settleRandomness().accounts({ auction, randomnessAccount: a.randomnessAccount } as any).rpc();
      } else if (state === "revealing" && slot > a.revealEndSlot.toNumber()) {
        log("finalize");
        await program.methods.finalize().accounts({ auction } as any).rpc();
      } else if (state === "finalized" || state === "cancelled") {
        log("auction done; exiting");
        return;
      }
    } catch (e: any) {
      log("tx failed:", e.message?.split("\n")[0]);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
