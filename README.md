# AI Agent Guardian

## Secure Human Authentication Layer for Autonomous AI Agents

### Overview

AI Agent Guardian provides a secure human authentication layer for autonomous AI agents operating with blockchain operations(e.g. DeFi). It addresses the critical challenge of ensuring human oversight over high-value or high-risk transactions initiated by AI agents, preventing potential issues arising from hallucinations or unreliable AI behaviors.

### Key Features

- **Transaction Monitoring**: Configurable thresholds for transaction values and gas costs
- **Human Authentication**: Telegram-based approval system for transactions exceeding thresholds
- **Two-Factor Authentication (2FA)**: Optional additional security layer using Google Authenticator
- **Multi-Chain Support**: Configurations stored on-chain for various networks
- **Multi-Agent Management**: Support for multiple AI agents under a single user
- **Fusion+ Integration**: Special handling for cross-chain swaps

### Architecture

The system consists of three main components:

1. **Smart Contracts**: On-chain storage of agent configurations and thresholds
2. **Authentication Server**: Node.js server handling approval requests and Telegram integration
3. **AI Agent SDK**: Python implementation for AI agents to integrate with the authentication system

---

## Smart Contract Infrastructure

### Contract Details

The `AgentsRegistry` contract serves as the backbone of the system, storing and managing AI agent configurations on-chain.

#### Deployment Addresses

[TODO: Add contract addresses for supported chains]

- Base Sepolia: `0x...`
- Base Mainnet: `0x...`
- [Other supported chains...]

#### Key Structures

```solidity
struct AgentConfig {
    uint96 valueThreshold;    // Value threshold in Wei
    uint96 gasThreshold;      // Gas threshold in Wei
    bool isSetup2FA;         // 2FA status
    bool isActive;           // Agent status
    string metadata;         // Telegram chat ID
    address owner;           // Agent owner address
}
```

#### Core Functions

- `registerAgent`: Register new AI agent with initial configurations
- `updateThresholds`: Modify value and gas thresholds
- `toggle2FA`: Enable/disable 2FA for an agent
- `checkTransactionApproval`: Verify if a transaction needs approval

---

## Guardian Bot (Telegram Interface)

The Telegram bot serves as the primary interface for managing AI agents and handling transaction approvals.

### Commands

- `/start`: Initialize bot and get welcome message
- `/register`: Register a new AI agent
- `/settings`: Configure agent security settings
- `/agents`: View list of registered agents
- `/help`: Display available commands

### Security Features

#### Transaction Approval Flow

1. AI agent submits transaction for approval
2. Bot checks thresholds and 2FA requirements
3. Sends approval request to authorized Telegram chat
4. Processes user response (approve/reject)
5. Returns result to AI agent

#### Two-Factor Authentication

- Setup using Google Authenticator
- QR code or manual key entry
- Required for high-value transactions when enabled
- Can be toggled per agent

#### Threshold Management

- Value threshold (ETH/native token)
- Gas threshold (Gwei)
- Configurable per agent
- Real-time monitoring

---

## Python AI Agent Implementation

### Overview

The Python implementation demonstrates how to integrate AI agents with the Guardian system.

### Features

- OpenAI GPT-4 integration for intent parsing
- Multi-chain support (Base, Base Sepolia)
- Transaction history tracking
- Colorized console interface
- Fusion+ cross-chain USDC transfers

### Commands

```
Available Commands:
├─ balance - Check your balance
├─ send X ETH to ADDRESS - Send ETH to an address
├─ fusion X USDC - Swap directly from on different chains(e.g. Base to Arbitrum) without bridging using 1inch Fusion+
├─ help - Show help message
├─ history - Show transaction history
└─ exit - Exit program
```

### Operation Types

1. **Transfer Operations**

   - ETH transfers with threshold checking
   - Automatic gas estimation
   - Human approval integration

2. **Balance Operations**

   - Check account balances
   - Support for any address lookup

3. **Fusion Operations**
   - Swapping via 1inch Fusion+
   - Special threshold handling
   - Progress tracking

### Integration Example

```python
agent = BlockchainAgent()
agent.set_network('base-sepolia')
response = agent.process_message("send 1 ETH to 0x...")
```

---

## API Endpoints

### Transaction Approval

```
POST /api/request-approval
{
    "agentAddress": "0x...",
    "transaction": {
        "to": "0x...",
        "value": "1000000000000000000",
        "gasPrice": "50000000000"
    }
}
```

### Fusion+ Approval

```
POST /api/request-fusion-approval
{
    "agentAddress": "0x...",
    "amount": "1000",
    "type": "fusion"
}
```

---

## Security Considerations

### Threshold Management

- Default value threshold: 0.00001 ETH
- Default gas threshold: 50 Gwei
- Configurable per network and agent
- Real-time price monitoring

### Authentication Layers

1. Telegram chat verification
2. Optional 2FA via Google Authenticator
3. On-chain ownership verification
4. Transaction signing validation

### Best Practices

- Enable 2FA for all production agents
- Set appropriate thresholds based on operation type
- Regular monitoring of transaction history
- Keep Telegram bot token secure
- Monitor gas prices for network conditions

---

## Development Setup

### Prerequisites

- Node.js 16+
- Python 3.8+
- OpenAI API key
- Telegram Bot Token
- Ethereum wallet private key
- Alchemy API key

### Environment Variables

```
BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
PRIVATE_KEY=your_ethereum_private_key
ALCHEMY_API_KEY=your_alchemy_api_key
```

### Installation

[TODO: Add installation steps]

---

## Future Improvements

[TODO: Add future improvments]
