# AgentsRegistry

A Solidity contract for managing on-chain configurations of AI agents. It allows secure and flexible configuration of value thresholds, gas thresholds, 2FA, and metadata.

## Features

- **Agent Management**: Register, update, and deactivate AI agents.
- **Threshold Settings**: Set value and gas thresholds for transaction approvals.
- **2FA Integration**: Enable or disable two-factor authentication for agents.
- **Metadata Support**: Add and update agent-specific metadata (e.g., Telegram usernames).
- **User-Friendly Queries**: Retrieve all agents associated with a specific user.

## Usage

1. **Register an Agent**:
   - Define thresholds, metadata, and ownership.
2. **Update Configurations**:
   - Modify thresholds or metadata as needed.
3. **Transaction Approval**:
   - Verify if a transaction requires approval or 2FA.

## Events

- `AgentRegistered`: Logs new agent registrations.
- `AgentConfigUpdated`: Logs threshold updates.
- `Agent2FAStatusChanged`: Logs 2FA status changes.
- `AgentDeactivated`: Logs agent deactivations.
- `MetadataUpdated`: Logs metadata updates.

## Compilation

```bash
forge install
forge build
```

## Test

```bash
forge test
```

## Deployment

```bash
forge script script/AgentsRegistry.s.sol:AgentsRegistryScript --rpc-url $RPC_URL --broadcast
```
