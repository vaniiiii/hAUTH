// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AgentsRegistry} from "../src/AgentsRegistry.sol";

contract AgentsRegistryTest is Test {
    AgentsRegistry public registry;
    address public owner;
    address public user;
    address public agentAddress;

    uint256 constant DEFAULT_VALUE_THRESHOLD = 1 ether;
    uint256 constant DEFAULT_GAS_THRESHOLD = 50 gwei;
    string constant DEFAULT_METADATA = "telegram:@agent1";

    event AgentRegistered(address indexed agentAddress, string metadata);
    event AgentConfigUpdated(
        address indexed agentAddress,
        uint256 valueThreshold,
        uint256 gasThreshold
    );
    event Agent2FAStatusChanged(address indexed agentAddress, bool isEnabled);
    event AgentDeactivated(address indexed agentAddress);
    event MetadataUpdated(address indexed agentAddress, string metadata);

    error OwnableUnauthorizedAccount(address account);

    function setUp() public {
        owner = makeAddr("owner");
        user = makeAddr("user");
        agentAddress = makeAddr("agent");

        vm.startPrank(owner);
        registry = new AgentsRegistry();
        vm.stopPrank();
    }

    // ============================================
    // Registration Tests
    // ============================================

    function test_RegisterAgent() public {
        vm.startPrank(owner);

        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(agentAddress, DEFAULT_METADATA);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        (
            uint96 valueThreshold,
            uint96 gasThreshold,
            bool isSetup2FA,
            bool isActive,
            string memory metadata
        ) = registry.agentConfigs(agentAddress);

        assertEq(valueThreshold, DEFAULT_VALUE_THRESHOLD);
        assertEq(gasThreshold, DEFAULT_GAS_THRESHOLD);
        assertFalse(isSetup2FA);
        assertTrue(isActive);
        assertEq(metadata, DEFAULT_METADATA);

        vm.stopPrank();
    }

    function test_RevertWhenNonOwnerRegisters() public {
        vm.startPrank(user);

        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, user)
        );
        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.stopPrank();
    }

    function test_RevertWhenRegisteringExistingAgent() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.expectRevert(AgentsRegistry.AgentAlreadyRegistered.selector);
        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.stopPrank();
    }

    function test_RevertWhenZeroValueThreshold() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.InvalidThresholdValue.selector);
        registry.registerAgent(
            agentAddress,
            0,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.stopPrank();
    }

    function test_RevertWhenZeroGasThreshold() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.InvalidThresholdValue.selector);
        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            0,
            DEFAULT_METADATA
        );

        vm.stopPrank();
    }

    function testFuzz_RegisterWithDifferentThresholds(
        uint96 valueThreshold,
        uint96 gasThreshold
    ) public {
        vm.assume(valueThreshold > 0 && gasThreshold > 0);

        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            valueThreshold,
            gasThreshold,
            DEFAULT_METADATA
        );

        (
            uint96 storedValueThreshold,
            uint96 storedGasThreshold,
            ,
            ,

        ) = registry.agentConfigs(agentAddress);
        assertEq(storedValueThreshold, valueThreshold);
        assertEq(storedGasThreshold, gasThreshold);

        vm.stopPrank();
    }

    // ============================================
    // Update Threshold Tests
    // ============================================

    function test_UpdateThresholds() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        uint256 newValueThreshold = 2 ether;
        uint256 newGasThreshold = 100 gwei;

        vm.expectEmit(true, false, false, true);
        emit AgentConfigUpdated(
            agentAddress,
            newValueThreshold,
            newGasThreshold
        );

        registry.updateThresholds(
            agentAddress,
            newValueThreshold,
            newGasThreshold
        );

        (uint96 valueThreshold, uint96 gasThreshold, , , ) = registry
            .agentConfigs(agentAddress);
        assertEq(valueThreshold, newValueThreshold);
        assertEq(gasThreshold, newGasThreshold);

        vm.stopPrank();
    }

    function test_RevertWhenUpdatingNonExistentAgent() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.AgentNotRegistered.selector);
        registry.updateThresholds(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD
        );

        vm.stopPrank();
    }

    function test_RevertWhenUpdateThresholdsWithZeroValues() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.expectRevert(AgentsRegistry.InvalidThresholdValue.selector);
        registry.updateThresholds(agentAddress, 0, DEFAULT_GAS_THRESHOLD);

        vm.expectRevert(AgentsRegistry.InvalidThresholdValue.selector);
        registry.updateThresholds(agentAddress, DEFAULT_VALUE_THRESHOLD, 0);

        vm.stopPrank();
    }

    // ============================================
    // 2FA Tests
    // ============================================

    function test_Toggle2FA() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.expectEmit(true, false, false, true);
        emit Agent2FAStatusChanged(agentAddress, true);

        registry.toggle2FA(agentAddress, true);

        (, , bool isSetup2FA, , ) = registry.agentConfigs(agentAddress);
        assertTrue(isSetup2FA);

        registry.toggle2FA(agentAddress, false);
        (, , isSetup2FA, , ) = registry.agentConfigs(agentAddress);
        assertFalse(isSetup2FA);

        vm.stopPrank();
    }

    function test_RevertWhenToggling2FAForNonExistentAgent() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.AgentNotRegistered.selector);
        registry.toggle2FA(agentAddress, true);

        vm.stopPrank();
    }

    // ============================================
    // Metadata Tests
    // ============================================

    function test_UpdateMetadata() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        string memory newMetadata = "telegram:@agent1_updated";

        vm.expectEmit(true, false, false, true);
        emit MetadataUpdated(agentAddress, newMetadata);

        registry.updateMetadata(agentAddress, newMetadata);

        (, , , , string memory metadata) = registry.agentConfigs(agentAddress);
        assertEq(metadata, newMetadata);

        vm.stopPrank();
    }

    function test_RevertWhenUpdatingMetadataForNonExistentAgent() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.AgentNotRegistered.selector);
        registry.updateMetadata(agentAddress, "new_metadata");

        vm.stopPrank();
    }

    // ============================================
    // Deactivation Tests
    // ============================================

    function test_DeactivateAgent() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        vm.expectEmit(true, false, false, true);
        emit AgentDeactivated(agentAddress);

        registry.deactivateAgent(agentAddress);

        (, , , bool isActive, ) = registry.agentConfigs(agentAddress);
        assertFalse(isActive);

        vm.stopPrank();
    }

    function test_RevertWhenDeactivatingNonExistentAgent() public {
        vm.startPrank(owner);

        vm.expectRevert(AgentsRegistry.AgentNotRegistered.selector);
        registry.deactivateAgent(agentAddress);

        vm.stopPrank();
    }

    // ============================================
    // Transaction Approval Tests
    // ============================================

    function test_CheckTransactionApproval() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        (bool needsApproval, bool needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            0.5 ether,
            40 gwei
        );
        assertFalse(needsApproval);
        assertFalse(needs2FA);

        (needsApproval, needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            1.5 ether,
            40 gwei
        );
        assertTrue(needsApproval);
        assertFalse(needs2FA);

        (needsApproval, needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            0.5 ether,
            60 gwei
        );
        assertTrue(needsApproval);
        assertFalse(needs2FA);

        registry.toggle2FA(agentAddress, true);
        (needsApproval, needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            1.5 ether,
            40 gwei
        );
        assertTrue(needsApproval);
        assertTrue(needs2FA);

        vm.stopPrank();
    }

    function test_CheckTransactionApprovalEdgeCases() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        (bool needsApproval, bool needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD
        );
        assertFalse(needsApproval);
        assertFalse(needs2FA);

        (needsApproval, needs2FA) = registry.checkTransactionApproval(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD + 1,
            DEFAULT_GAS_THRESHOLD + 1
        );
        assertTrue(needsApproval);
        assertFalse(needs2FA);

        vm.stopPrank();
    }

    function test_RevertWhenCheckingInactiveAgent() public {
        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );

        registry.deactivateAgent(agentAddress);

        vm.expectRevert(AgentsRegistry.AgentNotActive.selector);
        registry.checkTransactionApproval(agentAddress, 1 ether, 50 gwei);

        vm.stopPrank();
    }

    function testFuzz_CheckTransactionApproval(
        uint96 value,
        uint96 gasPrice,
        uint96 valueThreshold,
        uint96 gasThreshold
    ) public {
        vm.assume(valueThreshold > 0 && gasThreshold > 0);

        vm.startPrank(owner);

        registry.registerAgent(
            agentAddress,
            valueThreshold,
            gasThreshold,
            DEFAULT_METADATA
        );

        (bool needsApproval, ) = registry.checkTransactionApproval(
            agentAddress,
            value,
            gasPrice
        );

        bool expectedNeedsApproval = (value > valueThreshold ||
            gasPrice > gasThreshold);
        assertEq(needsApproval, expectedNeedsApproval);

        vm.stopPrank();
    }

    // ============================================
    // Access Control Tests
    // ============================================

    function test_NonOwnerOperations() public {
        vm.startPrank(owner);
        registry.registerAgent(
            agentAddress,
            DEFAULT_VALUE_THRESHOLD,
            DEFAULT_GAS_THRESHOLD,
            DEFAULT_METADATA
        );
        vm.stopPrank();

        vm.startPrank(user);

        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, user)
        );
        registry.updateThresholds(agentAddress, 2 ether, 100 gwei);

        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, user)
        );
        registry.toggle2FA(agentAddress, true);

        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, user)
        );
        registry.updateMetadata(agentAddress, "new_metadata");

        vm.expectRevert(
            abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, user)
        );
        registry.deactivateAgent(agentAddress);

        vm.stopPrank();
    }
}
