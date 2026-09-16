import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash, randomBytes } from "crypto";
import { assert } from "chai";
import { CandleLaunchpad } from "../target/types/candle_launchpad";

export const PROGRAM_ID = new PublicKey("DsKyZALPRQX7s4RZLATvm4u37KpSpe6KpTP4P7CjPUNG");
export const DECIMALS = 6;
export const PRICE_UNIT = 10n ** BigInt(DECIMALS);

export type AuctionParams = {
  auctionId: BN;
  supply: BN;
  priceUnit: BN;
  minPrice: BN;
  priceTick: BN;
  numTicks: number;
  startSlot: BN;
  endSlot: BN;
  revealDurationSlots: BN;
  minCutoffRatioBps: number;
  unrevealedPenaltyBps: number;
  minRaise: BN;
  randomnessTimeoutSlots: BN;
};

export class Env {
  svm: LiteSVM;
  provider: LiteSVMProvider;
  program: Program<CandleLaunchpad>;
  issuer: Keypair;
  mint: Keypair;
  issuerAta: PublicKey;

  static create(): Env {
    const e = new Env();
    e.svm = fromWorkspace(".");
    e.issuer = Keypair.generate();
    e.provider = new LiteSVMProvider(e.svm, new anchor.Wallet(e.issuer));
    anchor.setProvider(e.provider);
    const idl = require("../target/idl/candle_launchpad.json");
    e.program = new Program<CandleLaunchpad>(idl, e.provider);
    e.airdrop(e.issuer.publicKey, 100);
    e.mint = Keypair.generate();
    e.createMint(e.mint, e.issuer.publicKey);
    e.issuerAta = e.createAta(e.mint.publicKey, e.issuer.publicKey, 10n ** 15n);
    return e;
  }

  airdrop(pk: PublicKey, sol: number) {
    this.svm.airdrop(pk, BigInt(sol * LAMPORTS_PER_SOL));
  }

  newWallet(sol = 100): Keypair {
    const k = Keypair.generate();
    this.airdrop(k.publicKey, sol);
    return k;
  }

  slot(): bigint {
    return this.svm.getClock().slot;
  }

  warpTo(slot: bigint | number) {
    const c = this.svm.getClock();
    c.slot = BigInt(slot);
    this.svm.setClock(c);
  }

  warpBy(n: number) {
    this.warpTo(this.slot() + BigInt(n));
  }

  lamports(pk: PublicKey): bigint {
    return this.svm.getBalance(pk) ?? 0n;
  }

  tokenBalance(ata: PublicKey): bigint {
    const acc = this.svm.getAccount(ata);
    if (!acc) return 0n;
    return AccountLayout.decode(Buffer.from(acc.data)).amount;
  }

  // ---- raw account setup (no CPI needed) ----
  createMint(mint: Keypair, authority: PublicKey) {
    const data = Buffer.alloc(MINT_SIZE);
    MintLayout.encode(
      {
        mintAuthorityOption: 1,
        mintAuthority: authority,
        supply: 0n,
        decimals: DECIMALS,
        isInitialized: true,
        freezeAuthorityOption: 0,
        freezeAuthority: PublicKey.default,
      },
      data,
    );
    this.svm.setAccount(mint.publicKey, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });
  }

  createAta(mint: PublicKey, owner: PublicKey, amount: bigint): PublicKey {
    const ata = getAssociatedTokenAddressSync(mint, owner, true);
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint,
        owner,
        amount,
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    );
    this.svm.setAccount(ata, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(ACCOUNT_SIZE))),
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });
    return ata;
  }

  // ---- PDAs ----
  auctionPda(issuer: PublicKey, auctionId: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("auction"), issuer.toBuffer(), auctionId.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID,
    )[0];
  }
  vaultPda(auction: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("vault"), auction.toBuffer()], PROGRAM_ID)[0];
  }
  bidPda(auction: PublicKey, bidder: PublicKey, index: number): PublicKey {
    const ib = Buffer.alloc(4);
    ib.writeUInt32LE(index);
    return PublicKey.findProgramAddressSync([Buffer.from("bid"), auction.toBuffer(), bidder.toBuffer(), ib], PROGRAM_ID)[0];
  }
  mockRandPda(auction: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("mock_rand"), auction.toBuffer()], PROGRAM_ID)[0];
  }

  // ---- tx helper ----
  async send(ixs: TransactionInstruction[], signers: Keypair[]) {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = signers[0].publicKey;
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.sign(...signers);
    const res = this.svm.sendTransaction(tx);
    if ("err" in res && typeof (res as any).err === "function") {
      const logs = (res as any).meta().logs().join("\n");
      throw new Error(`tx failed: ${JSON.stringify((res as any).err())}\n${logs}`);
    }
    // make each subsequent tx unique
    this.svm.expireBlockhash();
    return res;
  }

  // ---- instructions ----
  defaultParams(overrides: Partial<AuctionParams> = {}): AuctionParams {
    const now = this.slot();
    return {
      auctionId: new BN(Date.now() % 1_000_000),
      supply: new BN((1_000n * PRICE_UNIT).toString()), // 1000 tokens
      priceUnit: new BN(PRICE_UNIT.toString()),
      minPrice: new BN(1_000_000), // 0.001 SOL per token
      priceTick: new BN(500_000),
      numTicks: 10,
      startSlot: new BN((now + 10n).toString()),
      endSlot: new BN((now + 110n).toString()),
      revealDurationSlots: new BN(100),
      minCutoffRatioBps: 5000,
      unrevealedPenaltyBps: 1000,
      minRaise: new BN(0),
      randomnessTimeoutSlots: new BN(200),
      ...overrides,
    };
  }

  async createAuction(params: AuctionParams, issuer = this.issuer): Promise<PublicKey> {
    const auction = this.auctionPda(issuer.publicKey, params.auctionId);
    const ix = await this.program.methods
      .createAuction(params as any)
      .accounts({
        issuer: issuer.publicKey,
        mint: this.mint.publicKey,
        auction,
        tokenVault: this.vaultPda(auction),
        issuerTokenAccount: getAssociatedTokenAddressSync(this.mint.publicKey, issuer.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();
    await this.send([ix], [issuer]);
    return auction;
  }

  async fetchAuction(auction: PublicKey) {
    const acc = this.svm.getAccount(auction);
    return this.program.coder.accounts.decode("auction", Buffer.from(acc!.data));
  }
  async fetchBid(bid: PublicKey) {
    const acc = this.svm.getAccount(bid);
    if (!acc) return null;
    return this.program.coder.accounts.decode("bid", Buffer.from(acc.data));
  }

  commitment(auction: PublicKey, bidder: PublicKey, tick: number, quantity: bigint, salt: Buffer): Buffer {
    const q = Buffer.alloc(8);
    q.writeBigUInt64LE(quantity);
    return createHash("sha256")
      .update(auction.toBuffer())
      .update(bidder.toBuffer())
      .update(Buffer.from([tick]))
      .update(q)
      .update(salt)
      .digest();
  }

  async commitBid(auction: PublicKey, bidder: Keypair, index: number, tick: number, quantity: bigint, deposit: bigint) {
    const salt = randomBytes(32);
    const c = this.commitment(auction, bidder.publicKey, tick, quantity, salt);
    const bid = this.bidPda(auction, bidder.publicKey, index);
    const ix = await this.program.methods
      .commitBid(index, Array.from(c) as any, new BN(deposit.toString()))
      .accounts({ bidder: bidder.publicKey, auction, bid, systemProgram: SystemProgram.programId } as any)
      .instruction();
    await this.send([ix], [bidder]);
    return { bid, salt, tick, quantity, deposit, bidder, commitSlot: this.slot() };
  }

  async revealBid(auction: PublicKey, b: { bid: PublicKey; bidder: Keypair }, tick: number, quantity: bigint, salt: Buffer) {
    const ix = await this.program.methods
      .revealBid(tick, new BN(quantity.toString()), Array.from(salt) as any)
      .accounts({ bidder: b.bidder.publicKey, auction, bid: b.bid } as any)
      .instruction();
    await this.send([ix], [b.bidder]);
  }

  async mockCreateRandomness(auction: PublicKey, payer = this.issuer) {
    const ix = await this.program.methods
      .mockCreateRandomness()
      .accounts({ payer: payer.publicKey, auction, randomness: this.mockRandPda(auction), systemProgram: SystemProgram.programId } as any)
      .instruction();
    await this.send([ix], [payer]);
  }
  async mockRevealRandomness(auction: PublicKey, value: Buffer, issuer = this.issuer) {
    const ix = await this.program.methods
      .mockRevealRandomness(Array.from(value) as any)
      .accounts({ issuer: issuer.publicKey, auction, randomness: this.mockRandPda(auction) } as any)
      .instruction();
    await this.send([ix], [issuer]);
  }
  async requestRandomness(auction: PublicKey, caller = this.issuer) {
    const ix = await this.program.methods
      .requestRandomness()
      .accounts({ auction, randomness: this.mockRandPda(auction) } as any)
      .instruction();
    await this.send([ix], [caller]);
  }
  async settleRandomness(auction: PublicKey, caller = this.issuer) {
    const ix = await this.program.methods
      .settleRandomness()
      .accounts({ auction, randomnessAccount: this.mockRandPda(auction) } as any)
      .instruction();
    await this.send([ix], [caller]);
  }
  async settleFallback(auction: PublicKey, caller = this.issuer) {
    const ix = await this.program.methods.settleFallback().accounts({ auction } as any).instruction();
    await this.send([ix], [caller]);
  }
  async finalize(auction: PublicKey, caller = this.issuer) {
    const ix = await this.program.methods.finalize().accounts({ auction } as any).instruction();
    await this.send([ix], [caller]);
  }

  /// Full randomness flow: warp past end, create+reveal mock randomness, request, settle.
  async runRandomness(auction: PublicKey, randomU64: bigint) {
    const a = await this.fetchAuction(auction);
    if (this.slot() <= BigInt(a.endSlot.toString())) this.warpTo(BigInt(a.endSlot.toString()) + 1n);
    await this.mockCreateRandomness(auction);
    const v = Buffer.alloc(32);
    v.writeBigUInt64LE(randomU64);
    await this.mockRevealRandomness(auction, v);
    await this.requestRandomness(auction);
    await this.settleRandomness(auction);
  }

  async claim(auction: PublicKey, b: { bid: PublicKey; bidder: Keypair }, payer?: Keypair) {
    const p = payer ?? b.bidder;
    const ix = await this.program.methods
      .claim()
      .accounts({
        payer: p.publicKey,
        bidder: b.bidder.publicKey,
        auction,
        bid: b.bid,
        mint: this.mint.publicKey,
        tokenVault: this.vaultPda(auction),
        bidderTokenAccount: getAssociatedTokenAddressSync(this.mint.publicKey, b.bidder.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .instruction();
    await this.send([ix], [p]);
  }

  async withdrawProceeds(auction: PublicKey, issuer = this.issuer) {
    const ix = await this.program.methods
      .withdrawProceeds()
      .accounts({
        issuer: issuer.publicKey,
        auction,
        tokenVault: this.vaultPda(auction),
        issuerTokenAccount: getAssociatedTokenAddressSync(this.mint.publicKey, issuer.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .instruction();
    await this.send([ix], [issuer]);
  }

  async cancelAuction(auction: PublicKey, issuer = this.issuer) {
    const ix = await this.program.methods
      .cancelAuction()
      .accounts({ issuer: issuer.publicKey, auction } as any)
      .instruction();
    await this.send([ix], [issuer]);
  }

  bidderAta(owner: PublicKey) {
    return getAssociatedTokenAddressSync(this.mint.publicKey, owner);
  }
}

export async function expectFail(p: Promise<any>, errName: string) {
  try {
    await p;
  } catch (e: any) {
    const msg = String(e.message ?? e);
    assert.include(msg, errName, `expected error ${errName}, got: ${msg.slice(0, 400)}`);
    return;
  }
  assert.fail(`expected failure with ${errName}`);
}

export const sol = (n: number) => BigInt(Math.round(n * LAMPORTS_PER_SOL));
export const tokens = (n: number) => BigInt(n) * PRICE_UNIT;
