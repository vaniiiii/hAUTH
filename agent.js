require("dotenv").config();
const { ethers } = require("ethers");

const APPROVAL_SERVER = "http://localhost:3000";
const AGENT_ADDRESS = "0x6B1dca08155232943ca69FA726a8A1C76f4Ebb8C";
const VALUE_THRESHOLD = 0.001;
const TEST_VALUES = [0.0005, 0.002, 0.003, 0.0008, 0.004];

const provider = new ethers.JsonRpcProvider(
  "https://base-sepolia-rpc.publicnode.com"
);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
let currentValueIndex = 0;

function aiDecisionLogic() {
  const value = TEST_VALUES[currentValueIndex];
  currentValueIndex = (currentValueIndex + 1) % TEST_VALUES.length;
  return {
    shouldSend: true,
    value: value.toFixed(6),
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
          value: transaction.value,
          gasPrice: transaction.gasPrice,
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
  const decision = aiDecisionLogic();

  try {
    const feeData = await provider.getFeeData();

    const transaction = {
      to: "0xRecipientAddress",
      value: ethers.parseEther(decision.value.toString()),
      gasPrice: feeData.gasPrice,
    };

    console.log(`\n🤖 AI preparing transaction...`);
    console.log(`💰 Value: ${decision.value} ETH`);
    console.log(
      `⛽ Gas Price: ${ethers.formatUnits(feeData.gasPrice, "gwei")} Gwei`
    );
    console.log(`🔒 Threshold: ${VALUE_THRESHOLD} ETH`);

    if (parseFloat(decision.value) > VALUE_THRESHOLD) {
      console.log(
        `\n🔐 Transaction requires approval (> ${VALUE_THRESHOLD} ETH)`
      );

      const approved = await requestApproval({
        to: transaction.to,
        value: decision.value,
        gasPrice: ethers.formatUnits(feeData.gasPrice, "gwei"),
      });

      if (!approved) {
        console.log("❌ Transaction rejected by user");
        return;
      }
      console.log("✅ Transaction approved by user");
    } else {
      console.log(`\n✨ Transaction below threshold, no approval needed`);
    }

    console.log("\n🔄 Simulating transaction (not actually sending)...");
    console.log(`📋 Would send transaction with value: ${decision.value} ETH`);
  } catch (error) {
    console.error("❌ Transaction failed:", error.message);
  }
}

async function startAgent() {
  console.log("🤖 AI Agent starting...");
  console.log(`📍 Agent address: ${AGENT_ADDRESS}`);
  console.log(`🔒 Value threshold: ${VALUE_THRESHOLD} ETH`);
  console.log(`🔄 Will test with values:`, TEST_VALUES);

  await sendTransaction();

  setInterval(async () => {
    await sendTransaction();
  }, 20000); // 20 Seconds
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

function getTimestamp() {
  return new Date().toLocaleTimeString();
}

(async () => {
  try {
    console.log(`\n[${getTimestamp()}] Starting AI Agent...`);
    await startAgent();
    console.log(`[${getTimestamp()}] Agent running with 20-second intervals`);
  } catch (error) {
    console.error("Failed to start agent:", error);
  }
})();
