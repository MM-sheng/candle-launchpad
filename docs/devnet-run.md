# BNB Chain Testnet Run

Date: 2026-09-16  
Chain: BNB Chain Testnet (chainId 97)

## Deployment

- VRF coordinator: [`0xDA3b641D438362C440Ac5458c57e00a712b66700`](https://testnet.bscscan.com/address/0xDA3b641D438362C440Ac5458c57e00a712b66700)
- VRF subscription ID: `49615494738721683681135557242622397181034100324937065982153707844588683613747`
- `ChainlinkVRFProvider`: [`0x4CDe5300Af89972a46A5D66A18d046932a6Cd406`](https://testnet.bscscan.com/address/0x4CDe5300Af89972a46A5D66A18d046932a6Cd406)
- `CandleAuctionHouse`: [`0xBa01c87bDC5B8b9EB94C97BEF156aa44475c14aD`](https://testnet.bscscan.com/address/0xBa01c87bDC5B8b9EB94C97BEF156aa44475c14aD)
- Test token: [`0xcb415e4C71df31128f5597Ad067355396D343c9a`](https://testnet.bscscan.com/address/0xcb415e4C71df31128f5597Ad067355396D343c9a)
- Provider and auction house are exact-match verified on both Sourcify and BscScan.

| Action | Transaction |
|---|---|
| Fund bidder B | [`0x769f3bbfa6fed0dc5cc9d51bba95f4715cdb276985ea7e16109f7ba0e0f74372`](https://testnet.bscscan.com/tx/0x769f3bbfa6fed0dc5cc9d51bba95f4715cdb276985ea7e16109f7ba0e0f74372) |
| Create VRF subscription | [`0x56b2322ebaeffebe70602f15f10b169057e6783d61ad174f9765c24c3bd0a364`](https://testnet.bscscan.com/tx/0x56b2322ebaeffebe70602f15f10b169057e6783d61ad174f9765c24c3bd0a364) |
| Fund VRF subscription | [`0xb650381024ed2dad52f0e09e674432c686e436720914c70f4e5537337ceeee77`](https://testnet.bscscan.com/tx/0xb650381024ed2dad52f0e09e674432c686e436720914c70f4e5537337ceeee77) |
| Deploy provider | [`0x027203e3080e47617a6d96e01b816b3ab0e5637ca6b57b9492f66c66c145afc7`](https://testnet.bscscan.com/tx/0x027203e3080e47617a6d96e01b816b3ab0e5637ca6b57b9492f66c66c145afc7) |
| Deploy auction house | [`0xcf0ce135fe59760a6289a7f816e2502c226de263873e3058b1c150574387210e`](https://testnet.bscscan.com/tx/0xcf0ce135fe59760a6289a7f816e2502c226de263873e3058b1c150574387210e) |
| Bind auction house | [`0x9ba7024ee2e5843c3a1cd1eafa88d129ddd44da49ec2c511f554f28bc073ac7f`](https://testnet.bscscan.com/tx/0x9ba7024ee2e5843c3a1cd1eafa88d129ddd44da49ec2c511f554f28bc073ac7f) |
| Add provider as consumer | [`0xfa13f9676be94295d9872a8f835b20bd190c3688b143862d913d6539ac65f5ba`](https://testnet.bscscan.com/tx/0xfa13f9676be94295d9872a8f835b20bd190c3688b143862d913d6539ac65f5ba) |
| Deploy test token | [`0x11fd6c7dee5d654591bacda9a01af237d436fabc0d8714a6db0ad42bda98fb99`](https://testnet.bscscan.com/tx/0x11fd6c7dee5d654591bacda9a01af237d436fabc0d8714a6db0ad42bda98fb99) |
| Mint test token | [`0xe0a4c0e8d24c1c9e15720bdfc346935c1d684402a81df6ebd5e5f041fc15711a`](https://testnet.bscscan.com/tx/0xe0a4c0e8d24c1c9e15720bdfc346935c1d684402a81df6ebd5e5f041fc15711a) |

## Full Auction (auctionId 3)

- Supply: 100 CNDL
- Bid A: tick 2, quantity 60 CNDL, deposit 0.0018 tBNB
- Bid B: tick 1, quantity 80 CNDL, deposit 0.0016 tBNB
- Commit window: blocks `131372228` through `131372588`
- Random cutoff: block `131372457`
- Clearing tick: 1 (0.00002 tBNB per CNDL)
- Bid A result: 60 CNDL, 0.0012 tBNB payment, 0.0006 tBNB refund
- Bid B result: 40 CNDL, 0.0008 tBNB payment, 0.0008 tBNB refund
- Final conservation checks: 100 CNDL sold, 0 token balance in the auction house, `totalEscrowed == 0`

| Action | Transaction |
|---|---|
| Approve supply | [`0x82728fbc6b344306c6c2898b70679a3effe68358cf6ee7d2df7c4a82b7434ea6`](https://testnet.bscscan.com/tx/0x82728fbc6b344306c6c2898b70679a3effe68358cf6ee7d2df7c4a82b7434ea6) |
| Create auction | [`0xca8dea3d795f2d2adcc2d3ff02c4a179630c6e1119a974ddf2927e3d3f7e71c0`](https://testnet.bscscan.com/tx/0xca8dea3d795f2d2adcc2d3ff02c4a179630c6e1119a974ddf2927e3d3f7e71c0) |
| Commit bid A | [`0x131bc5384eed5719af1f3d0b8b3c3640d355736381fab9fe63657adc3c4c2723`](https://testnet.bscscan.com/tx/0x131bc5384eed5719af1f3d0b8b3c3640d355736381fab9fe63657adc3c4c2723) |
| Commit bid B | [`0x54825689144bb889c6de1aae905015faafe9d42a9fd83abff5d2171a8e8084d6`](https://testnet.bscscan.com/tx/0x54825689144bb889c6de1aae905015faafe9d42a9fd83abff5d2171a8e8084d6) |
| Request randomness | [`0xa55fa37c0c633b7c81c63359f7b27ec3ba36292eb454e16a67e6f6049b890caa`](https://testnet.bscscan.com/tx/0xa55fa37c0c633b7c81c63359f7b27ec3ba36292eb454e16a67e6f6049b890caa) |
| VRF callback | [`0x2861f860c92cbfe64ca2d734761f244345a4c38a7d32c988cf1649a79b45f0d1`](https://testnet.bscscan.com/tx/0x2861f860c92cbfe64ca2d734761f244345a4c38a7d32c988cf1649a79b45f0d1) |
| Reveal bid A | [`0x1f699e42e594c430a17d0993d68d3303da4d9a89ea0bd4468184ca2dc8e40344`](https://testnet.bscscan.com/tx/0x1f699e42e594c430a17d0993d68d3303da4d9a89ea0bd4468184ca2dc8e40344) |
| Reveal bid B | [`0xa200f0287ca9a63995d9b6862c7c8a60355fc7d8c9c065d9de1b0e6a8c11cb2c`](https://testnet.bscscan.com/tx/0xa200f0287ca9a63995d9b6862c7c8a60355fc7d8c9c065d9de1b0e6a8c11cb2c) |
| Finalize | [`0xac1335cb9bf2ef61ad3f2db3960dcbbb0d46b5bb386d338fa4d1ad20029faf5e`](https://testnet.bscscan.com/tx/0xac1335cb9bf2ef61ad3f2db3960dcbbb0d46b5bb386d338fa4d1ad20029faf5e) |
| Claim bid A | [`0xd23118aafd71b3b4c3054bdab0e17a89a9ec05ce1744363447e02a23fb7c6086`](https://testnet.bscscan.com/tx/0xd23118aafd71b3b4c3054bdab0e17a89a9ec05ce1744363447e02a23fb7c6086) |
| Claim bid B | [`0x832adf893baf6483b1fc5076cdabd6ae9a55f070bb09c09ca8d81049fc7f9a80`](https://testnet.bscscan.com/tx/0x832adf893baf6483b1fc5076cdabd6ae9a55f070bb09c09ca8d81049fc7f9a80) |
| Withdraw proceeds | [`0x7f530d04f4ed749468937abb0c80139a2229b272bd5bf59fb5c32b60ac7c7f02`](https://testnet.bscscan.com/tx/0x7f530d04f4ed749468937abb0c80139a2229b272bd5bf59fb5c32b60ac7c7f02) |

## Aborted Setup Auctions

Auctions 0 and 1 received no successful bids because the public RPC delayed the commit transactions past their short windows. Both were settled through the documented fallback path, finalized as cancelled, and their full token supplies were withdrawn. No bidder deposits were accepted by either auction.

Auction 2 received two bids and a successful VRF callback, but the public RPC log endpoint was rate-limited and its original 60-block reveal window elapsed before the callback was detected. It was finalized as cancelled; both deposits were refunded in full and the complete token supply was withdrawn. Auction 3 increased the reveal window and completed successfully as recorded above.

## Verification Status

- [`ChainlinkVRFProvider`](https://testnet.bscscan.com/address/0x4CDe5300Af89972a46A5D66A18d046932a6Cd406#code): BscScan `Source Code Verified — Exact Match`; Sourcify `exact_match`
- [`CandleAuctionHouse`](https://testnet.bscscan.com/address/0xBa01c87bDC5B8b9EB94C97BEF156aa44475c14aD#code): BscScan `Source Code Verified — Exact Match`; Sourcify `exact_match`

## Frontend-parity run (auctionId 4) — `scripts/e2e.ts`

Two wallets, same contract calls the app makes (`commitmentHash` → `commitBid` → `revealBid` → `claim`), crank steps inline.

- Supply: 100 CNDL, 3 ticks from 0.00001 tBNB
- Bid A: tick 2, 50 CNDL (+0.0002 tBNB extra deposit to mask size)
- Bid B: tick 0, 70 CNDL
- Commit window: blocks `131392818`–`131392878`; VRF cutoff: block `131392877`
- Clearing tick 0 (0.00001 tBNB/CNDL), sold 100 CNDL, marginal fill 50000000000000000000/70000000000000000000
- Bid A: 50 CNDL, payment 0.0005 tBNB, refund 0.0012 tBNB
- Bid B: 50 CNDL, payment 0.0005 tBNB, refund 0.0002 tBNB
- After withdraw: house token balance 0, claimed 2/2

| Action | Transaction |
|---|---|
| Create auction | [`0xe3add5ea2dfd913f41372c23a5f64d52fb10848af2a102b91cd0c2377d3c1f2f`](https://testnet.bscscan.com/tx/0xe3add5ea2dfd913f41372c23a5f64d52fb10848af2a102b91cd0c2377d3c1f2f) |
| Commit bid A (tick 2, 50 CNDL, deposit 0.0017) | [`0x8d701c149581cd1c514d9b8dbb53876e42b70b27a5d8616a43af372aecda1922`](https://testnet.bscscan.com/tx/0x8d701c149581cd1c514d9b8dbb53876e42b70b27a5d8616a43af372aecda1922) |
| Commit bid B (tick 0, 70 CNDL, deposit 0.0007) | [`0x5cc424594e8c1592faa7794e70ba3218cd7ba76762c9c80a5332fbafd69782ad`](https://testnet.bscscan.com/tx/0x5cc424594e8c1592faa7794e70ba3218cd7ba76762c9c80a5332fbafd69782ad) |
| Request randomness | [`0xb40756b98d4242109c693dc678f22b74b9d17edcc22499fdf4325edd15bf859a`](https://testnet.bscscan.com/tx/0xb40756b98d4242109c693dc678f22b74b9d17edcc22499fdf4325edd15bf859a) |
| Reveal bid A | [`0xbeae7ec43672aaf14bf813465dea6552c315fcfba4fe9f9f5d3bbaaa3327de6e`](https://testnet.bscscan.com/tx/0xbeae7ec43672aaf14bf813465dea6552c315fcfba4fe9f9f5d3bbaaa3327de6e) |
| Reveal bid B | [`0xe66bc0d1602af169701c640af8d958eb7d979327b25663290fe93b6c0f101f81`](https://testnet.bscscan.com/tx/0xe66bc0d1602af169701c640af8d958eb7d979327b25663290fe93b6c0f101f81) |
| Finalize | [`0x2a7258faf03c0e6d1081e0ce79e90058d982fd54d1d92c2f6b5ecbfdf1cffbec`](https://testnet.bscscan.com/tx/0x2a7258faf03c0e6d1081e0ce79e90058d982fd54d1d92c2f6b5ecbfdf1cffbec) |
| Claim bid A | [`0x547db8ecac70aa7abefa39ecdf861091821c8cdc17a9b25b6c07c8419d2ebba3`](https://testnet.bscscan.com/tx/0x547db8ecac70aa7abefa39ecdf861091821c8cdc17a9b25b6c07c8419d2ebba3) |
| Claim bid B | [`0x2ed080b1d03c965d72bd6805190643aa5f645cb69ce3cb25ced78c7ef16f9a66`](https://testnet.bscscan.com/tx/0x2ed080b1d03c965d72bd6805190643aa5f645cb69ce3cb25ced78c7ef16f9a66) |
| Withdraw proceeds | [`0x45db65b2d93ec8c4ead1ecb175931ae4d3835725d6632eb41fc4353af2c49ba1`](https://testnet.bscscan.com/tx/0x45db65b2d93ec8c4ead1ecb175931ae4d3835725d6632eb41fc4353af2c49ba1) |


---

# Deployment 2 — hardened contract (2026-09-17)

Redeployed after the mainnet-hardening changes (pending-native pull, undelivered-token handling,
nonReentrant everywhere). Same VRF subscription; provider added as consumer.

- `ChainlinkVRFProvider`: [`0x35051c34116338D8DA7dE51963E88Ec41168326f`](https://testnet.bscscan.com/address/0x35051c34116338D8DA7dE51963E88Ec41168326f#code) (verified)
- `CandleAuctionHouse`: [`0x662Fe2bC63A414a020B20a7835832eaeBc594881`](https://testnet.bscscan.com/address/0x662Fe2bC63A414a020B20a7835832eaeBc594881#code) (verified)
- The first deployment (`0xBa01…14aD`) stays live for reference; the app and crank now point at the new one.

## Frontend-parity run (auctionId 0) — `scripts/e2e.ts`

Two wallets, same contract calls the app makes (`commitmentHash` → `commitBid` → `revealBid` → `claim`), crank steps inline.

- Supply: 100 CNDL, 3 ticks from 0.00001 tBNB
- Bid A: tick 2, 50 CNDL (+0.0002 tBNB extra deposit to mask size)
- Bid B: tick 0, 70 CNDL
- Commit window: blocks `131535919`–`131535979`; VRF cutoff: block `131535957`
- Clearing tick 0 (0.00001 tBNB/CNDL), sold 100 CNDL, marginal fill 50000000000000000000/70000000000000000000
- Bid A: 50 CNDL, payment 0.0005 tBNB, refund 0.0012 tBNB
- Bid B: 50 CNDL, payment 0.0005 tBNB, refund 0.0002 tBNB
- After withdraw: house token balance 0, claimed 2/2

| Action | Transaction |
|---|---|
| Approve supply | [`0x318b83983c782f63104394bf446cf861a13098d4ab8ee7b672ab5dc27063ec74`](https://testnet.bscscan.com/tx/0x318b83983c782f63104394bf446cf861a13098d4ab8ee7b672ab5dc27063ec74) |
| Create auction | [`0x1d5ab9b3c91dd01736fb3ef18b791427bc1e16fa43b4867a1e0ff617b45ffeb3`](https://testnet.bscscan.com/tx/0x1d5ab9b3c91dd01736fb3ef18b791427bc1e16fa43b4867a1e0ff617b45ffeb3) |
| Commit bid A (tick 2, 50 CNDL, deposit 0.0017) | [`0x6003ce64dc459f235b96aa189cb1551a870291c359e3404acaaa7e6e820ad5da`](https://testnet.bscscan.com/tx/0x6003ce64dc459f235b96aa189cb1551a870291c359e3404acaaa7e6e820ad5da) |
| Commit bid B (tick 0, 70 CNDL, deposit 0.0007) | [`0xe0876f21899b63fb0b4f57a13eabe115730167ff71953e088da4b0b86046b9ca`](https://testnet.bscscan.com/tx/0xe0876f21899b63fb0b4f57a13eabe115730167ff71953e088da4b0b86046b9ca) |
| Request randomness | [`0x04a8e34d7cd4a03181f1ee9a75f927d7c8322c830623e895ffa5b3ff94c0495e`](https://testnet.bscscan.com/tx/0x04a8e34d7cd4a03181f1ee9a75f927d7c8322c830623e895ffa5b3ff94c0495e) |
| Reveal bid A | [`0xc516539c25352ddf4adc8518f4bedd0c62f34bc35a9636c92e5e21ee0d8fc7c6`](https://testnet.bscscan.com/tx/0xc516539c25352ddf4adc8518f4bedd0c62f34bc35a9636c92e5e21ee0d8fc7c6) |
| Reveal bid B | [`0x941bb90b135ac61f319057dcf552f26854a6bce68f66490441a5970ba1825fc6`](https://testnet.bscscan.com/tx/0x941bb90b135ac61f319057dcf552f26854a6bce68f66490441a5970ba1825fc6) |
| Finalize | [`0x534b5f3b21aea3920699a26fe662668460848b3ef52b3cbc79df761519dc7838`](https://testnet.bscscan.com/tx/0x534b5f3b21aea3920699a26fe662668460848b3ef52b3cbc79df761519dc7838) |
| Claim bid A | [`0x6b560213ca7fc4200df780dabe19840ed5555ac9e1d6f3e394b617da109e39bd`](https://testnet.bscscan.com/tx/0x6b560213ca7fc4200df780dabe19840ed5555ac9e1d6f3e394b617da109e39bd) |
| Claim bid B | [`0xf821bd99cbf1a7dc5243859e53f8177f017cb5ba54a353d787fc0ba80a70df71`](https://testnet.bscscan.com/tx/0xf821bd99cbf1a7dc5243859e53f8177f017cb5ba54a353d787fc0ba80a70df71) |
| Withdraw proceeds | [`0xea356c9770bc32581cbec9752fe381b58e43d36731ffabed81a31a4a5b90b31e`](https://testnet.bscscan.com/tx/0xea356c9770bc32581cbec9752fe381b58e43d36731ffabed81a31a4a5b90b31e) |

## Frontend-parity run (auctionId 2) — `scripts/e2e.ts`

Two wallets, same contract calls the app makes (`commitmentHash` → `commitBid` → `revealBid` → `claim`), crank steps performed by the external crank (Hetzner).

- Supply: 100 CNDL, 3 ticks from 0.00001 tBNB
- Bid A: tick 2, 50 CNDL (+0.0002 tBNB extra deposit to mask size)
- Bid B: tick 0, 70 CNDL
- Commit window: blocks `131580957`–`131581017`; VRF cutoff: block `131581003`
- Clearing tick 0 (0.00001 tBNB/CNDL), sold 100 CNDL, marginal fill 50000000000000000000/70000000000000000000
- Bid A: 50 CNDL, payment 0.0005 tBNB, refund 0.0012 tBNB
- Bid B: 50 CNDL, payment 0.0005 tBNB, refund 0.0002 tBNB
- After withdraw: house token balance 100, claimed 2/2 (the 100 CNDL and 0.0017 tBNB left in the contract belong to auction #1 — a cancelled browser test with one unclaimed bid — not to this run)

| Action | Transaction |
|---|---|
| Approve supply | [`0x0e9897cafd9c68af215bbb49b199d7f09adc667ef46934c475443521841d0253`](https://testnet.bscscan.com/tx/0x0e9897cafd9c68af215bbb49b199d7f09adc667ef46934c475443521841d0253) |
| Create auction | [`0x51ca48a0f1f7d93fe3988ec10423c0cff34ce1c216536cc5b8df38e47485481b`](https://testnet.bscscan.com/tx/0x51ca48a0f1f7d93fe3988ec10423c0cff34ce1c216536cc5b8df38e47485481b) |
| Commit bid A (tick 2, 50 CNDL, deposit 0.0017) | [`0x0dc829df829966b5c3224179a782a14a5ea711b490ddd18690613b32243cd526`](https://testnet.bscscan.com/tx/0x0dc829df829966b5c3224179a782a14a5ea711b490ddd18690613b32243cd526) |
| Commit bid B (tick 0, 70 CNDL, deposit 0.0007) | [`0xbe9186b10f725d039ed248b6b22c1ec7b97bf43eeccf8ec28e0b36258445ba2a`](https://testnet.bscscan.com/tx/0xbe9186b10f725d039ed248b6b22c1ec7b97bf43eeccf8ec28e0b36258445ba2a) |
| Reveal bid A | [`0x32b032bb7d24a69f6dc7a30091ebd3ebb14b27a3179f99bde3e700fdd6c2f0a8`](https://testnet.bscscan.com/tx/0x32b032bb7d24a69f6dc7a30091ebd3ebb14b27a3179f99bde3e700fdd6c2f0a8) |
| Reveal bid B | [`0x62158624d0021c721b6a0dd4ba2fdd11066a9bcee3026591215d58db996e9407`](https://testnet.bscscan.com/tx/0x62158624d0021c721b6a0dd4ba2fdd11066a9bcee3026591215d58db996e9407) |
| Claim bid A | [`0xe46e569b4d03823c82734fb05927c672babbb5d04d49ec00242b6c5e8bb6a891`](https://testnet.bscscan.com/tx/0xe46e569b4d03823c82734fb05927c672babbb5d04d49ec00242b6c5e8bb6a891) |
| Claim bid B | [`0x611a1fbec32e111e3c37ca4a9d5aa527df6a78edd4ae5311ca226f22d1cd5fd8`](https://testnet.bscscan.com/tx/0x611a1fbec32e111e3c37ca4a9d5aa527df6a78edd4ae5311ca226f22d1cd5fd8) |
| Withdraw proceeds | [`0xf9d8aeae5e1d96c0cb75929d4cbf0139bb380794d0b8f60a49e8aed897977243`](https://testnet.bscscan.com/tx/0xf9d8aeae5e1d96c0cb75929d4cbf0139bb380794d0b8f60a49e8aed897977243) |
