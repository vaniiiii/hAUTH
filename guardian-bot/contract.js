const { ethers } = require("ethers");
const {
  REGISTRY_ADDRESS,
  REGISTRY_ABI,
  BASE_SEPOLIA_URL,
} = require("./constants.js");

const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);
const agentsRegistry = new ethers.Contract(
  REGISTRY_ADDRESS,
  REGISTRY_ABI,
  wallet
);

const getExplorerLink = (txHash) => {
  return `https://base-sepolia.blockscout.com/tx/${txHash}`;
};

const handleTransactionWithStatus = async (bot, chatId, tx, operation) => {
  try {
    const statusMsg = await bot.sendMessage(
      chatId,
      `🕒 *${operation} - Transaction Pending*\n\nTransaction has been submitted and is being processed.\n\nTransaction Hash: \`${tx.hash}\`\n\n[View on Explorer](${getExplorerLink(tx.hash)})`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );

    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(
        () => reject(new Error("Transaction confirmation timeout")),
        60000
      );
    });

    const receipt = await Promise.race([tx.wait(), timeoutPromise]);

    await bot.editMessageText(
      `✅ *${operation} - Transaction Confirmed*\n\nTransaction has been successfully confirmed!\n\nTransaction Hash: \`${tx.hash}\`\n\n[View on Explorer](${getExplorerLink(tx.hash)})`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );

    return { success: true, receipt };
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `❌ *${operation} Failed*\n\nError: ${error.message}\n\nPlease try again.`,
      { parse_mode: "Markdown" }
    );
    throw error;
  }
};

const registerAgentOnChain = async (
  agentAddress,
  ownerAddress,
  telegramChatId,
  bot
) => {
  const valueThresholdWei = ethers.parseEther("0.00001");
  const gasThresholdWei = ethers.parseUnits("50", "gwei");
  try {
    const tx = await agentsRegistry.registerAgent(
      agentAddress,
      ownerAddress,
      valueThresholdWei,
      gasThresholdWei,
      telegramChatId.toString()
    );
    return await handleTransactionWithStatus(
      bot,
      telegramChatId,
      tx,
      "Agent Registration"
    );
  } catch (error) {
    await bot.sendMessage(
      telegramChatId,
      `❌ *Agent Registration Failed*\n\nError: ${error.message}\n\nPlease try again.`,
      { parse_mode: "Markdown" }
    );
    throw error;
  }
};

const updateThresholdsOnChain = async (
  agentAddress,
  valueThreshold,
  gasThreshold,
  telegramChatId,
  bot
) => {
  try {
    const currentConfig = await getAgentConfigFromChain(agentAddress);
    const newValueThreshold =
      valueThreshold !== null ? valueThreshold : currentConfig.valueThreshold;
    const newGasThreshold =
      gasThreshold !== null ? gasThreshold : currentConfig.gasThreshold;

    const tx = await agentsRegistry.updateThresholds(
      agentAddress,
      newValueThreshold,
      newGasThreshold
    );
    return await handleTransactionWithStatus(
      bot,
      telegramChatId,
      tx,
      "Update Thresholds"
    );
  } catch (error) {
    await bot.sendMessage(
      telegramChatId,
      `❌ *Threshold Update Failed*\n\nError: ${error.message}\n\nPlease try again.`,
      { parse_mode: "Markdown" }
    );
    throw error;
  }
};

const toggle2FAOnChain = async (agentAddress, enabled, telegramChatId, bot) => {
  try {
    const tx = await agentsRegistry.toggle2FA(agentAddress, enabled);
    return await handleTransactionWithStatus(
      bot,
      telegramChatId,
      tx,
      "2FA Configuration"
    );
  } catch (error) {
    await bot.sendMessage(
      telegramChatId,
      `❌ *2FA Configuration Failed*\n\nError: ${error.message}\n\nPlease try again.`,
      { parse_mode: "Markdown" }
    );
    throw error;
  }
};

async function getAgentConfigFromChain(agentAddress) {
  try {
    const config = await agentsRegistry.agentConfigs(agentAddress);
    return {
      valueThreshold: config.valueThreshold.toString(),
      gasThreshold: config.gasThreshold.toString(),
      isSetup2FA: config.isSetup2FA,
      isActive: config.isActive,
      metadata: config.metadata,
      owner: config.owner,
    };
  } catch (error) {
    console.error("Error getting agent config from chain:", error);
    throw error;
  }
}

async function getUserAgentsFromChain(ownerAddress) {
  try {
    return await agentsRegistry.getUserAgents(ownerAddress);
  } catch (error) {
    console.error("Error getting user agents from chain:", error);
    throw error;
  }
}

async function checkTransactionApproval(agentAddress, value, gasPrice) {
  try {
    return await agentsRegistry.checkTransactionApproval(
      agentAddress,
      value,
      gasPrice
    );
  } catch (error) {
    console.error("Error checking transaction approval:", error);
    throw error;
  }
}

module.exports = {
  provider,
  agentsRegistry,
  registerAgentOnChain,
  updateThresholdsOnChain,
  toggle2FAOnChain,
  getAgentConfigFromChain,
  getUserAgentsFromChain,
  checkTransactionApproval,
};
