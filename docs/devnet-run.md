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
