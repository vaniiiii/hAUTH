require("dotenv").config();
const { ethers } = require("ethers");

const APPROVAL_SERVER = "http://localhost:3000";
const AGENT_ADDRESS = "0xb3a1956Cff1ecc8054B81b0C83b9847CB71384b8";

// Thresholds - bot should be configured with these values:
// Value threshold: 1.0 ETH
// Gas threshold: 50 Gwei

// Test values (70% within limits, 30% exceeding)
const TEST_SCENARIOS = [
  // Within limits (70%)
  { value: "0.5", gasMultiplier: 0.8 }, // 0.5 ETH, 80% of current gas
  { value: "0.75", gasMultiplier: 0.9 }, // 0.75 ETH, 90% of current gas
  { value: "0.3", gasMultiplier: 0.7 }, // 0.3 ETH, 70% of current gas
  { value: "0.8", gasMultiplier: 0.85 }, // 0.8 ETH, 85% of current gas
  { value: "0.6", gasMultiplier: 0.95 }, // 0.6 ETH, 95% of current gas
  { value: "0.4", gasMultiplier: 0.75 }, // 0.4 ETH, 75% of current gas
  { value: "0.9", gasMultiplier: 0.88 }, // 0.9 ETH, 88% of current gas

  // Exceeding limits (30%)
  { value: "1.2", gasMultiplier: 0.9 }, // High value, normal gas
  { value: "0.5", gasMultiplier: 1.2 }, // Normal value, high gas
  { value: "1.5", gasMultiplier: 1.3 }, // Both high
];

let currentScenarioIndex = 0;

const provider = new ethers.JsonRpcProvider(
  "https://base-sepolia-rpc.publicnode.com"
);

function aiDecisionLogic(currentGasPrice) {
  const scenario = TEST_SCENARIOS[currentScenarioIndex];
  currentScenarioIndex = (currentScenarioIndex + 1) % TEST_SCENARIOS.length;

  const adjustedGasPrice = (
    (BigInt(currentGasPrice) *
      BigInt(Math.floor(scenario.gasMultiplier * 100))) /
    BigInt(100)
  ).toString();

  return {
    shouldSend: true,
    value: scenario.value,
    gasPrice: adjustedGasPrice,
  };
}

async function requestApproval(transaction) {
  try {
    console.log("\n📤 Sending approval request to server...");
    const response = await fetch(`${APPROVAL_SERVER}/api/request-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentAddress: AGENT_ADDRESS,
        transaction: {
          to: transaction.to,
          value: transaction.value.toString(),
          gasPrice: transaction.gasPrice.toString(),
        },
      }),
    });
    const result = await response.json();
    console.log("Server response:", result);
    return result.approved;
  } catch (error) {
    console.error("Error requesting approval:", error);
    return false;
  }
}

async function sendTransaction() {
  try {
    const feeData = await provider.getFeeData();
    const baseGasPrice = feeData.gasPrice;

    const decision = aiDecisionLogic(baseGasPrice);
    const valueInWei = ethers.parseEther(decision.value);

    const transaction = {
      to: "0xRecipientAddress",
      value: valueInWei,
      gasPrice: BigInt(decision.gasPrice),
    };

    console.log(`\n🤖 AI preparing transaction...`);
    console.log(`💰 Value: ${decision.value} ETH`);
    console.log(
      `⛽ Gas Price: ${ethers.formatUnits(transaction.gasPrice, "gwei")} Gwei`
    );
    console.log(
      `📊 Base Gas Price: ${ethers.formatUnits(baseGasPrice, "gwei")} Gwei`
    );

    const approved = await requestApproval(transaction);

    if (approved) {
      console.log("✅ Transaction approved - would proceed with sending");
    } else {
      console.log("❌ Transaction rejected or approval not required");
    }
  } catch (error) {
    console.error("❌ Transaction failed:", error.message);
  }
}

async function startAgent() {
  console.log("\n🤖 AI Agent Test Suite Starting...");
  console.log("\n⚠️ IMPORTANT: Configure bot with these thresholds:");
  console.log("• Value Threshold: 1.0 ETH");
  console.log("• Gas Threshold: 50 Gwei");

  console.log("\n📊 Test Scenarios:");
  console.log("• 70% of transactions within limits");
  console.log("• 30% of transactions exceeding limits");

  await sendTransaction();
  setInterval(async () => {
    await sendTransaction();
  }, 20000);
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

(async () => {
  try {
    console.log(
      `\n[${new Date().toLocaleTimeString()}] Starting AI Agent Test Suite...`
    );
    await startAgent();
  } catch (error) {
    console.error("Failed to start agent:", error);
  }
})();
