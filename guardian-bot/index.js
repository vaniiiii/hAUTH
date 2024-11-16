require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const cors = require("cors");
const ethers = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// TODO Data storage like Filecoin/Storacha/Nillio
const agentSettings = new Map();
const pendingApprovals = new Map();
const userAgents = new Map();

const defaultSettings = {
  valueThreshold: 0.00001, // ETH
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

  try {
    if (!match || !match[1]) {
      await bot.sendMessage(
        chatId,
        "*How to Register Your AI Agent:*\n\n" +
          "Provide your agent's Ethereum address using the format:\n" +
          "`/register <ethereum_address>`\n\n" +
          "*Example:*\n" +
          "`/register 0x742d35Cc6634C0532925a3b844Bc454e4438f44e`\n\n" +
          "*Requirements:*\n" +
          "• Valid Ethereum address\n" +
          "• One registration per agent\n" +
          "• Secure address storage",
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
      return;
    }

    const agentAddress = match[1].trim();

    if (!ethers.isAddress(agentAddress)) {
      await bot.sendMessage(
        chatId,
        "*Error:* Invalid Ethereum address\n\n" +
          "Please provide a valid address like:\n" +
          "`0x742d35Cc6634C0532925a3b844Bc454e4438f44e`",
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
      return;
    }

    if (agentSettings.has(agentAddress)) {
      const existingAgent = agentSettings.get(agentAddress);
      if (existingAgent.telegramChatId === chatId) {
        await bot.sendMessage(
          chatId,
          "*Error:* Agent already registered\n\n" +
            "Use /agents to view your registered agents.",
          { parse_mode: "Markdown" }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "*Error:* This agent is registered to another user.",
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    try {
      agentSettings.set(agentAddress, {
        ...defaultSettings,
        telegramChatId: chatId,
      });

      // Add to user's agents
      if (!userAgents.has(chatId)) {
        userAgents.set(chatId, new Set());
      }
      userAgents.get(chatId).add(agentAddress);

      await bot.sendMessage(
        chatId,
        "*✅ AI Agent Successfully Registered*\n\n" +
          `*Address:* \`${agentAddress}\`\n\n` +
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
    } catch (registerError) {
      console.error("Error during registration:", registerError);
      await bot.sendMessage(
        chatId,
        "*Error:* Registration failed. Please try again later.",
        { parse_mode: "Markdown" }
      );

      if (agentSettings.has(agentAddress)) {
        agentSettings.delete(agentAddress);
      }
      if (userAgents.has(chatId)) {
        userAgents.get(chatId).delete(agentAddress);
      }
    }
  } catch (error) {
    console.error("Error in register command:", error);
    try {
      await bot.sendMessage(
        chatId,
        "*Error:* Something went wrong. Please try again.",
        { parse_mode: "Markdown" }
      );
    } catch (sendError) {
      console.error("Error sending error message:", sendError);
    }
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

  let message = "*Your Registered AI Agents:*\n\n";
  const inlineKeyboard = [];

  for (const agentAddress of agents) {
    const settings = agentSettings.get(agentAddress);
    message += `*Agent:* \`${agentAddress}\`\n`;
    message += `├ Threshold: ${settings.valueThreshold} ETH\n`;
    message += `└ 2FA: ${settings.isSetup2FA ? "✅" : "❌"}\n\n`;

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

  bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });
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

function sendConfigMenu(chatId, agentAddress) {
  const settings = agentSettings.get(agentAddress);
  const menuItems = [
    [
      {
        text: "📊 Set Value Threshold",
        callback_data: `threshold_${agentAddress}`,
      },
    ],
  ];

  if (settings.isSetup2FA) {
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
• Value Threshold: ${settings.valueThreshold} ETH
• 2FA Enabled: ${settings.isSetup2FA ? "✅" : "❌"}`;

  bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: menuItems,
    },
  });
}

async function setup2FA(chatId, agentAddress) {
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
      settings.isSetup2FA = true;
      agentSettings.set(agentAddress, settings);
      await bot.sendMessage(chatId, "✅ 2FA setup successful!");
      sendConfigMenu(chatId, agentAddress);
    } else {
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
    const agents = userAgents.get(chatId);

    let message = "*Your Registered AI Agents:*\n\n";
    const inlineKeyboard = [];

    for (const agentAddress of agents) {
      const settings = agentSettings.get(agentAddress);
      message += `*Agent:* \`${agentAddress}\`\n`;
      message += `├ Threshold: ${settings.valueThreshold} ETH\n`;
      message += `└ 2FA: ${settings.isSetup2FA ? "✅" : "❌"}\n\n`;

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
  } else if (data.startsWith("config_")) {
    const agentAddress = data.split("_")[1];
    sendConfigMenu(chatId, agentAddress);
  } else if (data.startsWith("threshold_")) {
    const agentAddress = data.split("_")[1];
    await bot.sendMessage(
      chatId,
      "Enter new value threshold in ETH (e.g., 0.01):"
    );

    bot.once("message", async (msg) => {
      if (msg.chat.id !== chatId) return;

      const value = parseFloat(msg.text);
      if (isNaN(value) || value <= 0) {
        await bot.sendMessage(
          chatId,
          "❌ Invalid value. Please enter a positive number."
        );
        return;
      }

      const settings = agentSettings.get(agentAddress);
      settings.valueThreshold = value;
      agentSettings.set(agentAddress, settings);

      await bot.sendMessage(
        chatId,
        `✅ Value threshold updated to ${value} ETH`
      );
      sendConfigMenu(chatId, agentAddress);
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
      await bot.sendMessage(
        chatId,
        "❌ This approval request has expired or was already processed.",
        { parse_mode: "Markdown" }
      );
      return;
    }

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

    if (!agentSettings.has(agentAddress)) {
      return res.status(400).json({ error: "Agent not registered" });
    }

    const settings = agentSettings.get(agentAddress);
    const txValueInETH = parseFloat(transaction.value);

    if (txValueInETH > settings.valueThreshold) {
      const approvalId = Date.now().toString();

      pendingApprovals.set(approvalId, {
        transaction,
        agentAddress,
        status: "pending",
        timestamp: Date.now(),
      });

      await bot.sendMessage(
        settings.telegramChatId,
        `🚨 *High Value Transaction Detected!*

*AI Agent:* \`${agentAddress}\`

*Transaction Details:*
• To: \`${transaction.to}\`
• Value: ${txValueInETH} ETH
• Gas: ${transaction.gasPrice} Gwei

Do you approve this transaction?`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Approve", callback_data: `approve_${approvalId}` },
                { text: "❌ Reject", callback_data: `reject_${approvalId}` },
              ],
            ],
          },
        }
      );

      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const approval = pendingApprovals.get(approvalId);

          if (Date.now() - approval.timestamp > 300000) {
            clearInterval(checkInterval);
            pendingApprovals.delete(approvalId);
            resolve(res.json({ approved: false, reason: "Approval timeout" }));
          }

          if (approval.status !== "pending") {
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
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
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
