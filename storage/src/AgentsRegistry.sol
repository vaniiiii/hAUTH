// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ░█████╗░██╗  ░█████╗░░██████╗░███████╗███╗░░██╗████████╗░██████╗
    ██╔══██╗██║  ██╔══██╗██╔════╝░██╔════╝████╗░██║╚══██╔══╝██╔════╝
    ███████║██║  ███████║██║░░██╗░█████╗░░██╔██╗██║░░░██║░░░╚█████╗░
    ██╔══██║██║  ██╔══██║██║░░╚██╗██╔══╝░░██║╚████║░░░██║░░░░╚═══██╗
    ██║░░██║██║  ██║░░██║╚██████╔╝███████╗██║░╚███║░░░██║░░░██████╔╝
    ╚═╝░░╚═╝╚═╝  ╚═╝░░╚═╝░╚═════╝░╚══════╝╚═╝░░╚══╝░░░╚═╝░░░╚═════╝░
    =====================================================================
    ████████╗██████╗░██╗░░░██╗░██████╗████████╗███████╗██████╗░
    ╚══██╔══╝██╔══██╗██║░░░██║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
    ░░░██║░░░██████╔╝██║░░░██║╚█████╗░░░░██║░░░█████╗░░██║░░██║
    ░░░██║░░░██╔══██╗██║░░░██║░╚═══██╗░░░██║░░░██╔══╝░░██║░░██║
    ░░░██║░░░██║░░██║╚██████╔╝██████╔╝░░░██║░░░███████╗██████╔╝
    ░░░╚═╝░░░╚═╝░░╚═╝░╚═════╝░╚═════╝░░░░╚═╝░░░╚══════╝╚═════╝░
    =====================================================================
    ██████╗░███████╗░██████╗░██╗░██████╗████████╗██████╗░██╗░░░██╗
    ██╔══██╗██╔════╝██╔════╝░██║██╔════╝╚══██╔══╝██╔══██╗╚██╗░██╔╝
    ██████╔╝█████╗░░██║░░██╗░██║╚█████╗░░░░██║░░░██████╔╝░╚████╔╝░
    ██╔══██╗██╔══╝░░██║░░╚██╗██║░╚═══██╗░░░██║░░░██╔══██╗░░╚██╔╝░░
    ██║░░██║███████╗╚██████╔╝██║██████╔╝░░░██║░░░██║░░██║░░░██║░░░
    ╚═╝░░╚═╝╚══════╝░╚═════╝░╚═╝╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝░░░╚═╝░░░
    =====================================================================
    Version: 1.0.0
    Description: Secure on-chain configuration storage for AI agents
*/

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title AgentsRegistry
 * @dev Stores and manages AI agent security configurations on-chain
 */
contract AgentsRegistry is Ownable2Step {
    struct AgentConfig {
        uint96 valueThreshold; // Value threshold in Wei
        uint96 gasThreshold; // Gas threshold in Wei
        bool isSetup2FA; // Whether 2FA is enabled
        bool isActive; // Whether agent is active
        string metadata; // Optional metadata (e.g., Telegram username)
    }

    // Mapping from agent address to its configuration
    mapping(address => AgentConfig) public agentConfigs;

    // Events
    event AgentRegistered(address indexed agentAddress, string metadata);
    event AgentConfigUpdated(
        address indexed agentAddress,
        uint256 valueThreshold,
        uint256 gasThreshold
    );
    event Agent2FAStatusChanged(address indexed agentAddress, bool isEnabled);
    event AgentDeactivated(address indexed agentAddress);
    event MetadataUpdated(address indexed agentAddress, string metadata);

    // Custom errors
    error AgentAlreadyRegistered();
    error AgentNotRegistered();
    error InvalidThresholdValue();
    error AgentNotActive();

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Register a new AI agent (only owner/relayer can call)
     */
    function registerAgent(
        address agentAddress,
        uint256 valueThreshold,
        uint256 gasThreshold,
        string calldata metadata
    ) external onlyOwner {
        if (agentConfigs[agentAddress].isActive) {
            revert AgentAlreadyRegistered();
        }

        if (valueThreshold == 0 || gasThreshold == 0) {
            revert InvalidThresholdValue();
        }

        agentConfigs[agentAddress] = AgentConfig({
            valueThreshold: uint96(valueThreshold),
            gasThreshold: uint96(gasThreshold),
            isSetup2FA: false,
            isActive: true,
            metadata: metadata
        });

        emit AgentRegistered(agentAddress, metadata);
    }

    /**
     * @dev Update agent thresholds (only owner/relayer can call)
     */
    function updateThresholds(
        address agentAddress,
        uint256 newValueThreshold,
        uint256 newGasThreshold
    ) external onlyOwner {
        if (!agentConfigs[agentAddress].isActive) {
            revert AgentNotRegistered();
        }

        if (newValueThreshold == 0 || newGasThreshold == 0) {
            revert InvalidThresholdValue();
        }

        AgentConfig storage config = agentConfigs[agentAddress];
        config.valueThreshold = uint96(newValueThreshold);
        config.gasThreshold = uint96(newGasThreshold);

        emit AgentConfigUpdated(
            agentAddress,
            newValueThreshold,
            newGasThreshold
        );
    }

    /**
     * @dev Toggle 2FA status (only owner/relayer can call)
     */
    function toggle2FA(address agentAddress, bool enabled) external onlyOwner {
        if (!agentConfigs[agentAddress].isActive) {
            revert AgentNotRegistered();
        }

        agentConfigs[agentAddress].isSetup2FA = enabled;
        emit Agent2FAStatusChanged(agentAddress, enabled);
    }

    /**
     * @dev Update agent metadata (only owner/relayer can call)
     */
    function updateMetadata(
        address agentAddress,
        string calldata metadata
    ) external onlyOwner {
        if (!agentConfigs[agentAddress].isActive) {
            revert AgentNotRegistered();
        }

        agentConfigs[agentAddress].metadata = metadata;
        emit MetadataUpdated(agentAddress, metadata);
    }

    /**
     * @dev Deactivate an agent (only owner/relayer can call)
     */
    function deactivateAgent(address agentAddress) external onlyOwner {
        if (!agentConfigs[agentAddress].isActive) {
            revert AgentNotRegistered();
        }

        agentConfigs[agentAddress].isActive = false;
        emit AgentDeactivated(agentAddress);
    }

    /**
     * @dev Check if transaction needs approval based on thresholds
     */
    function checkTransactionApproval(
        address agentAddress,
        uint256 value,
        uint256 gasPrice
    ) external view returns (bool needsApproval, bool needs2FA) {
        AgentConfig memory config = agentConfigs[agentAddress];

        if (!config.isActive) {
            revert AgentNotActive();
        }

        needsApproval = (value > config.valueThreshold ||
            gasPrice > config.gasThreshold);
        needs2FA = config.isSetup2FA;
    }
}
