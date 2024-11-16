// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {AgentsRegistry} from "../src/AgentsRegistry.sol";

contract AgentsRegistryScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        AgentsRegistry agentRegistry = new AgentsRegistry();

        vm.stopBroadcast();
    }
}
