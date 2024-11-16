require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const cors = require("cors");
const { ethers } = require("ethers");
const {
  validateAndFormatThreshold,
  formatWeiValue,
  isExceedingThreshold,
} = require("./utils");
const {
  registerAgentOnChain,
  updateThresholdsOnChain,
  toggle2FAOnChain,
  getAgentConfigFromChain,
  getUserAgentsFromChain,
  checkTransactionApproval,
} = require("./contract");
const winston = require("winston");

const app = express();
app.use(cors());
app.use(express.json());
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Initialize ethers provider (you can use Infura, Alchemy, or any other provider)
const provider = new ethers.AlchemyProvider(
  "sepolia",
  process.env.ALCHEMY_API_KEY
);

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// TODO Data storage like Filecoin/Storacha/Nillio
const agentSettings = new Map(); // Only for 2FA secrets
const pendingApprovals = new Map();
const userAgents = new Map(); // For quick telegram chat ID lookups

const defaultSettings = {
  valueThreshold: "10000000000000", // 0.00001 ETH in Wei
  gasThreshold: "50000000000", // 50 Gwei in Wei
  isSetup2FA: false,
  secret: null,
  telegramChatId: null,
};

bot.setMyCommands([
  { command: "start", description: "🚀 Start" },
  { command: "register", description: "📝 Register AI Agent" },
  { command: "settings", description: "⚙️ View Settings" },
  { command: "agents", description: "🤖 View My Agents" },
  { command: "help", description: "❓ Get Help" },
]);

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `🤖 *Welcome to AI Agent Security Bot!*

This bot helps secure your AI agents by:
• Monitoring transaction values
• Requiring approval for high-value transactions
• Providing 2FA security
• Managing multiple AI agents

To get started:
1. Register your AI agent with /register
2. Configure security settings
3. Integrate API endpoint with your agent

Need help? Use /help for commands.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/^\/register(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  logger.info(`Registration attempt from chat ID: ${chatId}`);

  try {
    if (!match || !match[1]) {
      await bot.sendMessage(
        chatId,
        "*How to Register Your AI Agent:*\n\n" +
          "Provide agent and owner addresses using the format:\n" +
          "`/register <agent_address> <owner_address>`\n\n" +
          "*Example:*\n" +
          "`/register 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0x123...`\n\n" +
          "*Requirements:*\n" +
          "• Valid Ethereum addresses\n" +
          "• One registration per agent\n" +
          "• Agent and owner addresses must be different",
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
      return;
    }

    const addresses = match[1].trim().split(/\s+/);
    if (addresses.length !== 2) {
      await bot.sendMessage(
        chatId,
        "Please provide both agent and owner addresses.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    let [agentAddress, ownerAddress] = addresses;

    if (!ethers.isAddress(agentAddress) || !ethers.isAddress(ownerAddress)) {
      await bot.sendMessage(
        chatId,
        "*Error:* Invalid Ethereum address(es)\n\n" +
          "Please provide valid addresses.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    try {
      await registerAgentOnChain(agentAddress, ownerAddress, chatId, bot);
      logger.info(
        `Successfully registered agent ${agentAddress} for chat ID ${chatId}`
      );

      agentSettings.set(agentAddress, {
        secret: null,
        isSetup2FA: false,
        telegramChatId: chatId,
      });

      // Add to user's local agents list
      if (!userAgents.has(chatId)) {
        userAgents.set(chatId, new Set());
      }
      userAgents.get(chatId).add(agentAddress);

      await bot.sendMessage(
        chatId,
        "*✅ AI Agent Successfully Registered*\n\n" +
          `*Agent Address:* \`${agentAddress}\`\n` +
          `*Owner Address:* \`${ownerAddress}\`\n\n` +
          "Please configure your security settings:",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⚙️ Configure Settings",
                  callback_data: `config_${agentAddress}`,
                },
              ],
              [
                {
                  text: "🔐 Setup 2FA",
                  callback_data: `setup_2fa_${agentAddress}`,
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      logger.error(
        `Registration failed for agent ${agentAddress}: ${error.message}`
      );
      console.error("Error during registration:", error);
      await bot.sendMessage(
        chatId,
        "*Error:* Registration failed. Please try again later.",
        { parse_mode: "Markdown" }
      );

      agentSettings.delete(agentAddress);
      if (userAgents.has(chatId)) {
        userAgents.get(chatId).delete(agentAddress);
      }
    }
  } catch (error) {
    console.error("Error in register command:", error);
    await bot.sendMessage(chatId, "An error occurred. Please try again.");
  }
});

bot.onText(/\/agents/, async (msg) => {
  const chatId = msg.chat.id;
  const agents = userAgents.get(chatId);

  if (!agents || agents.size === 0) {
    bot.sendMessage(
      chatId,
      "You haven't registered any AI agents yet.\nUse /register to add one.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Register New Agent", callback_data: "register_new" }],
          ],
        },
      }
    );
    return;
  }

  try {
    let message = "*Your Registered AI Agents:*\n\n";
    const inlineKeyboard = [];

    for (const agentAddress of agents) {
      const onChainConfig = await getAgentConfigFromChain(agentAddress);
      const localSettings = agentSettings.get(agentAddress); // For 2FA status only

      message += `*Agent:* \`${agentAddress}\`\n`;
      message += `├ Value Threshold: ${ethers.formatEther(onChainConfig.valueThreshold)} ETH\n`;
      message += `├ Gas Threshold: ${ethers.formatUnits(onChainConfig.gasThreshold, "gwei")} Gwei\n`;
      message += `└ 2FA: ${localSettings.isSetup2FA ? "✅" : "❌"}\n\n`;

      inlineKeyboard.push([
        {
          text: `⚙️ Configure ${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`,
          callback_data: `config_${agentAddress}`,
        },
      ]);
    }

    inlineKeyboard.push([
      { text: "➕ Register New Agent", callback_data: "register_new" },
    ]);

    inlineKeyboard.push([
      {
        text: "🤖 View My Agents Metrics In Mini App",
        web_app: { url: "https://google.com" },
      },
    ]);

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  } catch (error) {
    console.error("Error in /agents command:", error);
    await bot.sendMessage(
      chatId,
      "Error fetching agent configurations. Please try again."
    );
  }
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const agents = userAgents.get(chatId);

  if (!agents || agents.size === 0) {
    bot.sendMessage(
      chatId,
      "You haven't registered any AI agents yet.\nUse /register to add one."
    );
    return;
  }

  const buttons = Array.from(agents).map((address) => [
    {
      text: `⚙️ ${address.slice(0, 6)}...${address.slice(-4)}`,
      callback_data: `config_${address}`,
    },
  ]);

  bot.sendMessage(chatId, "Select an agent to configure:", {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `*📚 Available Commands:*

/start - Start the bot and get welcome message
/register - Register a new AI agent with its ETH address
/settings - Configure your agents' security settings
/agents - View list of your registered agents
/help - Show this help message

*🔐 Security Features:*
• Value threshold monitoring
• 2FA protection for high-value transactions
• Real-time transaction approval
• Multiple agent management

*🤖 How to Use:*
1. Register your agent with /register
2. Set value threshold in settings
3. Enable 2FA (recommended)
4. Bot will notify you of high-value transactions

Need more help? Contact support at support@guardianbot.com`,
    { parse_mode: "Markdown" }
  );
});

async function sendConfigMenu(chatId, agentAddress) {
  try {
    const onChainConfig = await getAgentConfigFromChain(agentAddress);

    if (!agentSettings.has(agentAddress)) {
      agentSettings.set(agentAddress, {
        secret: null,
        isSetup2FA: false,
        telegramChatId: chatId,
      });
    }
    const localSettings = agentSettings.get(agentAddress);

    const menuItems = [
      [
        {
          text: "📊 Set Value Threshold",
          callback_data: `threshold_${agentAddress}`,
        },
      ],
      [
        {
          text: "⛽ Set Gas Threshold",
          callback_data: `gas_${agentAddress}`,
        },
      ],
    ];

    if (localSettings.isSetup2FA) {
      menuItems.push([
        { text: "❌ Remove 2FA", callback_data: `remove_2fa_${agentAddress}` },
      ]);
    } else {
      menuItems.push([
        { text: "🔐 Setup 2FA", callback_data: `setup_2fa_${agentAddress}` },
      ]);
    }

    menuItems.push([
      { text: "🗑️ Delete Agent", callback_data: `delete_${agentAddress}` },
    ]);

    menuItems.push([
      { text: "↩️ Back to Agents", callback_data: "back_to_agents" },
    ]);

    const message = `*AI Agent Settings*
Address: \`${agentAddress}\`

Current Configuration:
- Value Threshold: ${ethers.formatEther(onChainConfig.valueThreshold)} ETH
- Gas Threshold: ${ethers.formatUnits(onChainConfig.gasThreshold, "gwei")} Gwei
- 2FA Enabled: ${localSettings.isSetup2FA ? "✅" : "❌"}`;

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: menuItems,
      },
    });
  } catch (error) {
    console.error("Error in sendConfigMenu:", error);
    await bot.sendMessage(
      chatId,
      "Error fetching configuration. Please try again."
    );
  }
}

async function setup2FA(chatId, agentAddress) {
  logger.info(`2FA setup initiated for agent ${agentAddress}`);
  const secret = speakeasy.generateSecret({
    name: `AI Agent Monitor (${agentAddress})`,
  });

  const settings = agentSettings.get(agentAddress);
  settings.secret = secret.base32;
  agentSettings.set(agentAddress, settings);

  const qrBuffer = await qrcode.toBuffer(secret.otpauth_url);

  await bot.sendMessage(
    chatId,
    "1️⃣ Scan this QR code with Google Authenticator:"
  );

  await bot.sendPhoto(chatId, qrBuffer);

  await bot.sendMessage(
    chatId,
    `2️⃣ Or manually enter this key in your authenticator app:
\`${secret.base32}\`

Once added, please enter the 6-digit code to verify setup:`,
    { parse_mode: "Markdown" }
  );

  bot.once("message", async (msg) => {
    if (msg.chat.id !== chatId) return;

    const code = msg.text;
    const verified = speakeasy.totp.verify({
      secret: secret.base32,
      encoding: "base32",
      token: code,
    });

    if (verified) {
      logger.info(`2FA setup successful for agent ${agentAddress}`);
      settings.isSetup2FA = true;
      agentSettings.set(agentAddress, settings);
      await bot.sendMessage(chatId, "✅ 2FA setup successful!");
      sendConfigMenu(chatId, agentAddress);
    } else {
      logger.warn(`2FA setup failed for agent ${agentAddress}: Invalid code`);
      await bot.sendMessage(chatId, "❌ Invalid code. Please try setup again.");
      settings.secret = null;
      agentSettings.set(agentAddress, settings);
      sendConfigMenu(chatId, agentAddress);
    }
  });
}

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === "back_to_agents") {
    try {
      const agents = userAgents.get(chatId);

      let message = "*Your Registered AI Agents:*\n\n";
      const inlineKeyboard = [];

      for (const agentAddress of agents) {
        const onChainConfig = await getAgentConfigFromChain(agentAddress);
        const localSettings = agentSettings.get(agentAddress); // For 2FA status only

        message += `*Agent:* \`${agentAddress}\`\n`;
        message += `├ Value Threshold: ${ethers.formatEther(onChainConfig.valueThreshold)} ETH\n`;
        message += `├ Gas Threshold: ${ethers.formatUnits(onChainConfig.gasThreshold, "gwei")} Gwei\n`;
        message += `└ 2FA: ${localSettings.isSetup2FA ? "✅" : "❌"}\n\n`;

        inlineKeyboard.push([
          {
            text: `⚙️ Configure ${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`,
            callback_data: `config_${agentAddress}`,
          },
        ]);
      }

      inlineKeyboard.push([
        { text: "➕ Register New Agent", callback_data: "register_new" },
      ]);

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
    } catch (error) {
      console.error("Error in back_to_agents:", error);
      await bot.sendMessage(
        chatId,
        "Error fetching agent configurations. Please try again."
      );
    }
  } else if (data.startsWith("config_")) {
    const agentAddress = data.split("_")[1];
    sendConfigMenu(chatId, agentAddress);
  }
  if (data.startsWith("threshold_")) {
    const agentAddress = data.split("_")[1];
    await bot.sendMessage(
      chatId,
      "Enter new value threshold in ETH (e.g., 0.01, 1, 10):"
    );

    bot.once("message", async (msg) => {
      if (msg.chat.id !== chatId) return;

      try {
        const { weiValue } = validateAndFormatThreshold(msg.text);
        const onChainConfig = await getAgentConfigFromChain(agentAddress);

        await updateThresholdsOnChain(
          agentAddress,
          weiValue,
          onChainConfig.gasThreshold,
          chatId,
          bot
        );

        await bot.sendMessage(
          chatId,
          `✅ Value threshold updated to ${ethers.formatEther(weiValue)} ETH`
        );
        await sendConfigMenu(chatId, agentAddress);
      } catch (error) {
        await bot.sendMessage(chatId, `❌ ${error.message}`);
        await sendConfigMenu(chatId, agentAddress);
      }
    });
  } else if (data.startsWith("gas_")) {
    const agentAddress = data.split("_")[1];
    await bot.sendMessage(
      chatId,
      "Enter new gas threshold in Gwei (e.g., 50, 100):"
    );

    bot.once("message", async (msg) => {
      if (msg.chat.id !== chatId) return;

      try {
        const { weiValue } = validateAndFormatThreshold(msg.text, "gwei");
        const onChainConfig = await getAgentConfigFromChain(agentAddress);

        await updateThresholdsOnChain(
          agentAddress,
          weiValue,
          onChainConfig.gasThreshold,
          chatId,
          bot
        );

        await bot.sendMessage(
          chatId,
          `✅ Gas threshold updated to ${ethers.formatUnits(weiValue, "gwei")} Gwei`
        );
        await sendConfigMenu(chatId, agentAddress);
      } catch (error) {
        await bot.sendMessage(chatId, `❌ ${error.message}`);
        await sendConfigMenu(chatId, agentAddress);
      }
    });
  } else if (data === "register_new") {
    await bot.sendMessage(
      chatId,
      "*How to Register Your AI Agent:*\n\n" +
        "Provide your agent's Ethereum address using the format:\n" +
        "`/register <ethereum_address>`\n\n" +
        "*Example:*\n" +
        "`/register 0x742d35Cc6634C0532925a3b844Bc454e4438f44e`",
      {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );
  } else if (data.startsWith("setup_2fa_")) {
    const agentAddress = data.split("_")[2];
    setup2FA(chatId, agentAddress);
  } else if (data.startsWith("remove_2fa_")) {
    const agentAddress = data.split("_")[2];
    await bot.sendMessage(
      chatId,
      "Are you sure you want to remove 2FA?\nType 'CONFIRM' to proceed:"
    );

    bot.once("message", async (msg) => {
      if (msg.chat.id !== chatId) return;

      if (msg.text === "CONFIRM") {
        const settings = agentSettings.get(agentAddress);
        settings.isSetup2FA = false;
        settings.secret = null;
        agentSettings.set(agentAddress, settings);

        await bot.sendMessage(chatId, "✅ 2FA removed successfully");
        sendConfigMenu(chatId, agentAddress);
      } else {
        await bot.sendMessage(chatId, "❌ 2FA removal cancelled");
        sendConfigMenu(chatId, agentAddress);
      }
    });
  } else if (data.startsWith("delete_")) {
    const agentAddress = data.split("_")[1];
    await bot.sendMessage(
      chatId,
      `Are you sure you want to delete this AI agent?\n\`${agentAddress}\`\n\nType 'DELETE' to confirm:`,
      { parse_mode: "Markdown" }
    );

    bot.once("message", async (msg) => {
      if (msg.chat.id !== chatId) return;

      if (msg.text === "DELETE") {
        agentSettings.delete(agentAddress);
        userAgents.get(chatId).delete(agentAddress);

        await bot.sendMessage(chatId, "✅ AI agent deleted successfully");
      } else {
        await bot.sendMessage(chatId, "❌ Deletion cancelled");
        sendConfigMenu(chatId, agentAddress);
      }
    });
  } else if (data.startsWith("approve_") || data.startsWith("reject_")) {
    const approvalId = data.split("_")[1];
    const approval = pendingApprovals.get(approvalId);

    if (!approval) {
      logger.warn(`Attempted to process non-existent approval: ${approvalId}`);
      await bot.sendMessage(
        chatId,
        "❌ This approval request has expired or was already processed.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    logger.info(
      `Processing ${data.startsWith("approve_") ? "approval" : "rejection"} for request ${approvalId}`
    );

    const settings = agentSettings.get(approval.agentAddress);

    if (settings.isSetup2FA) {
      await bot.sendMessage(
        chatId,
        "*🔐 2FA Required*\n\nPlease enter your 6-digit authentication code:",
        { parse_mode: "Markdown" }
      );

      bot.once("message", async (msg) => {
        if (msg.chat.id !== chatId) return;

        const code = msg.text;
        const verified = speakeasy.totp.verify({
          secret: settings.secret,
          encoding: "base32",
          token: code,
        });

        if (verified) {
          approval.status = data.startsWith("approve_")
            ? "approved"
            : "rejected";
          pendingApprovals.set(approvalId, approval);

          await bot.sendMessage(
            chatId,
            data.startsWith("approve_")
              ? "✅ Transaction approved with 2FA verification"
              : "❌ Transaction rejected with 2FA verification",
            { parse_mode: "Markdown" }
          );
        } else {
          await bot.sendMessage(
            chatId,
            "❌ Invalid 2FA code. Transaction cancelled.",
            { parse_mode: "Markdown" }
          );
          approval.status = "rejected";
          pendingApprovals.set(approvalId, approval);
        }
      });
    } else {
      approval.status = data.startsWith("approve_") ? "approved" : "rejected";
      pendingApprovals.set(approvalId, approval);

      await bot.sendMessage(
        chatId,
        data.startsWith("approve_")
          ? "✅ Transaction approved"
          : "❌ Transaction rejected",
        { parse_mode: "Markdown" }
      );
    }
  }
});

bot.on("polling_error", (error) => {
  console.error("Bot polling error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

app.post("/api/request-approval", async (req, res) => {
  try {
    const { agentAddress, transaction } = req.body;
    logger.info(`Approval request received for agent ${agentAddress}`);
    logger.info(`Transaction details: ${JSON.stringify(transaction)}`);

    if (
      !transaction ||
      !transaction.value ||
      !transaction.to ||
      !transaction.gasPrice
    ) {
      return res.status(400).json({
        error: "Invalid transaction format",
      });
    }

    const { needsApproval, needs2FA } = await checkTransactionApproval(
      agentAddress,
      transaction.value,
      transaction.gasPrice
    );

    if (needsApproval) {
      const onChainConfig = await getAgentConfigFromChain(agentAddress);
      const approvalId = Date.now().toString();
      logger.info(
        `Created approval request ${approvalId} for agent ${agentAddress}`
      );

      pendingApprovals.set(approvalId, {
        transaction,
        agentAddress,
        status: "pending",
        timestamp: Date.now(),
      });

      const valueInEth = ethers.formatEther(transaction.value);
      const thresholdInEth = ethers.formatEther(onChainConfig.valueThreshold);
      const gasInGwei = ethers.formatUnits(transaction.gasPrice, "gwei");
      const gasThresholdGwei = ethers.formatUnits(
        onChainConfig.gasThreshold,
        "gwei"
      );

      // Calculate if thresholds are exceeded
      const valueExceeded =
        BigInt(transaction.value) > BigInt(onChainConfig.valueThreshold);
      const gasExceeded =
        BigInt(transaction.gasPrice) > BigInt(onChainConfig.gasThreshold);

      const message = `🚨 *High Risk Transaction Detected!*

*AI Agent:* \`${agentAddress}\`

*Transaction Details:*
• To: \`${transaction.to}\`
• Value: ${valueInEth} ETH ${valueExceeded ? "⚠️" : ""}
• Gas Price: ${gasInGwei} Gwei ${gasExceeded ? "⚠️" : ""}

*Thresholds:*
• Value: ${thresholdInEth} ETH
• Gas: ${gasThresholdGwei} Gwei

${valueExceeded ? "❗ Value exceeds threshold" : ""}
${gasExceeded ? "⛽ Gas price exceeds threshold" : ""}

Do you approve this transaction?`;

      await bot.sendMessage(onChainConfig.metadata, message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: `approve_${approvalId}` },
              { text: "❌ Reject", callback_data: `reject_${approvalId}` },
            ],
          ],
        },
      });

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const approval = pendingApprovals.get(approvalId);

          if (Date.now() - approval.timestamp > 300000) {
            logger.warn(`Approval request ${approvalId} timed out`);
            clearInterval(checkInterval);
            pendingApprovals.delete(approvalId);
            resolve(res.json({ approved: false, reason: "Approval timeout" }));
          }

          if (approval.status !== "pending") {
            logger.info(
              `Approval request ${approvalId} completed with status: ${approval.status}`
            );
            clearInterval(checkInterval);
            pendingApprovals.delete(approvalId);
            resolve(res.json({ approved: approval.status === "approved" }));
          }
        }, 1000);
      });
    }

    return res.json({ approved: true });
  } catch (error) {
    console.error("Error processing approval request:", error);
    logger.error(`Error processing approval request: ${error.message}`);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
  logger.info("Bot initialized and ready to handle requests");
  console.log(`Server running on port ${PORT}`);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, approval] of pendingApprovals.entries()) {
    if (now - approval.timestamp > 300000) {
      pendingApprovals.delete(id);
    }
  }
}, 60000);
