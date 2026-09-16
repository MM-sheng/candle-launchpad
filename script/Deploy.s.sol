// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CandleAuctionHouse} from "../src/CandleAuctionHouse.sol";
import {IRandomnessProvider} from "../src/interfaces/IRandomnessProvider.sol";
import {MockRandomnessProvider} from "../src/randomness/MockRandomnessProvider.sol";
import {ChainlinkVRFProvider} from "../src/randomness/ChainlinkVRFProvider.sol";

/// Usage:
///   RANDOMNESS_PROVIDER=mock|chainlink forge script script/Deploy.s.sol \
///     --rpc-url bsc_testnet --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        string memory kind = vm.envOr("RANDOMNESS_PROVIDER", string("mock"));

        vm.startBroadcast(pk);
        IRandomnessProvider provider;
        if (keccak256(bytes(kind)) == keccak256("chainlink")) {
            ChainlinkVRFProvider p = new ChainlinkVRFProvider(
                vm.envAddress("VRF_COORDINATOR"),
                vm.envBytes32("VRF_KEY_HASH"),
                vm.envUint("VRF_SUBSCRIPTION_ID"),
                uint32(vm.envOr("VRF_CALLBACK_GAS_LIMIT", uint256(300_000))),
                uint16(vm.envOr("VRF_REQUEST_CONFIRMATIONS", uint256(3))),
                vm.envOr("VRF_PAY_IN_NATIVE", true)
            );
            CandleAuctionHouse house = new CandleAuctionHouse(p);
            p.setAuctionHouse(address(house));
            provider = p;
            console.log("ChainlinkVRFProvider:", address(p));
            console.log("CandleAuctionHouse:", address(house));
            console.log("NOTE: add the provider as a consumer to VRF subscription", vm.envUint("VRF_SUBSCRIPTION_ID"));
        } else {
            MockRandomnessProvider p = new MockRandomnessProvider();
            CandleAuctionHouse house = new CandleAuctionHouse(p);
            p.setAuctionHouse(address(house));
            provider = p;
            console.log("MockRandomnessProvider:", address(p));
            console.log("CandleAuctionHouse:", address(house));
        }
        vm.stopBroadcast();
    }
}
