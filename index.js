require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
bot.setMyCommands([
  { command: "start", description: "🚀 Start" },
  { command: "menu", description: "📱 Menu" },
  { command: "settings", description: "⚙️ Settings" },
]);

const userSettings = {};
const defaultSettings = {
  valueThreshold: 20,
  gasPriceThreshold: 100,
};

function showMenu(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⚙️ Configure Settings", callback_data: "menu_config" }],
        [{ text: "📄 View Current Settings", callback_data: "menu_view" }],
        [{ text: "🎲 Simulate Transaction", callback_data: "menu_simulate" }],
      ],
    },
  };
  bot.sendMessage(chatId, "Select an option:", options);
}

function sendConfigMenu(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Set Value Threshold", callback_data: "config_value" }],
        [{ text: "Set Gas Price Threshold", callback_data: "config_gasprice" }],
        [{ text: "Setup 2FA", callback_data: "setup_2fa" }],
        [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
      ],
    },
  };
  bot.sendMessage(chatId, "⚙️ Configuration Menu:", options);
}

async function setup2FA(chatId) {
  const secret = speakeasy.generateSecret({
    name: `AI Agent Thai Bot (${chatId})`,
  });

  userSettings[chatId] = userSettings[chatId] || { ...defaultSettings };
  userSettings[chatId].secret = secret.base32;
  userSettings[chatId].isSetup2FA = false;

  const qrBuffer = await qrcode.toBuffer(secret.otpauth_url);
  return { buffer: qrBuffer, secret };
}

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  if (action === "menu_main") {
    showMenu(chatId);
  } else if (action === "menu_config") {
    sendConfigMenu(chatId);
  } else if (action === "menu_view") {
    const settings = userSettings[chatId] || defaultSettings;
    bot.sendMessage(
      chatId,
      `⚙️ Your Current Settings:
- Value Threshold: ${settings.valueThreshold} ETH
- Gas Price Threshold: ${settings.gasPriceThreshold} Gwei
- 2FA Setup: ${settings.isSetup2FA ? "✅" : "❌"}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
          ],
        },
      }
    );
  } else if (action === "setup_2fa") {
    const { buffer, secret } = await setup2FA(chatId);
    bot.sendMessage(chatId, "Scan this QR code with Google Authenticator:");
    bot.sendPhoto(chatId, buffer, { filename: "qr-code.png" });
    bot.sendMessage(
      chatId,
      "Enter the code from Google Authenticator to verify setup:"
    );

    bot.once("message", (msg) => {
      const code = msg.text;
      const verified = speakeasy.totp.verify({
        secret: userSettings[chatId].secret,
        encoding: "base32",
        token: code,
      });

      if (verified) {
        userSettings[chatId].isSetup2FA = true;
        bot.sendMessage(chatId, "✅ 2FA setup successful!");
        showMenu(chatId);
      } else {
        bot.sendMessage(chatId, "❌ Invalid code. Please try setup again.");
        showMenu(chatId);
      }
    });
  } else if (action === "menu_simulate") {
    simulateTransaction(chatId);
    bot.sendMessage(chatId, "🎲 Simulating transaction...", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
        ],
      },
    });
  } else if (action === "config_value") {
    bot.sendMessage(chatId, "💡 Enter the new Value Threshold in ETH:");
    bot.once("message", (msg) => {
      const newThreshold = parseFloat(msg.text);
      if (!isNaN(newThreshold)) {
        userSettings[chatId] = userSettings[chatId] || { ...defaultSettings };
        userSettings[chatId].valueThreshold = newThreshold;
        bot.sendMessage(
          chatId,
          `✅ Value Threshold updated to ${newThreshold} ETH`
        );
        showMenu(chatId);
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid input. Please enter a valid number."
        );
        sendConfigMenu(chatId);
      }
    });
  } else if (action === "config_gasprice") {
    bot.sendMessage(chatId, "💡 Enter the new Gas Price Threshold in Gwei:");
    bot.once("message", (msg) => {
      const newThreshold = parseFloat(msg.text);
      if (!isNaN(newThreshold)) {
        userSettings[chatId] = userSettings[chatId] || { ...defaultSettings };
        userSettings[chatId].gasPriceThreshold = newThreshold;
        bot.sendMessage(
          chatId,
          `✅ Gas Price Threshold updated to ${newThreshold} Gwei`
        );
        showMenu(chatId);
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid input. Please enter a valid number."
        );
        sendConfigMenu(chatId);
      }
    });
  }
});

function executeTransaction(tx, chatId) {
  console.log(`Executing transaction for user ${chatId}:`, tx);
  setTimeout(() => {
    console.log(`Transaction for user ${chatId} executed successfully!`);
  }, 2000);
}

async function send2FAMessage(tx, chatId) {
  const userConfig = userSettings[chatId] || defaultSettings;

  if (
    tx.value > userConfig.valueThreshold ||
    tx.gasPrice > userConfig.gasPriceThreshold
  ) {
    if (!userConfig.isSetup2FA) {
      bot.sendMessage(
        chatId,
        "⚠️ Please setup 2FA first in Configuration Menu"
      );
      sendConfigMenu(chatId);
      return;
    }

    bot.sendMessage(
      chatId,
      `🔒 **2FA Required**
- **Recipient Address**: ${tx.to}
- **Value**: ${tx.value} ETH
- **Gas Price**: ${tx.gasPrice} Gwei

Enter your Google Authenticator code:`,
      { parse_mode: "Markdown" }
    );

    bot.once("message", (msg) => {
      const code = msg.text;
      const verified = speakeasy.totp.verify({
        secret: userConfig.secret,
        encoding: "base32",
        token: code,
      });

      if (verified) {
        bot.sendMessage(chatId, "✅ Code verified. Executing transaction...");
        executeTransaction(tx, chatId);
      } else {
        bot.sendMessage(chatId, "❌ Invalid code. Please try again.");
        send2FAMessage(tx, chatId);
      }
    });
  } else {
    bot.sendMessage(
      chatId,
      "✅ Transaction does not require 2FA. Executing..."
    );
    executeTransaction(tx, chatId);
  }
}

function simulateTransaction(chatId) {
  const mockTransaction = {
    to: "0xRecipientAddress",
    value: 25,
    gasPrice: 150,
  };

  console.log(`Simulating transaction for user ${chatId}...`);
  send2FAMessage(mockTransaction, chatId);
}

bot.onText(/\/menu/, (msg) => {
  showMenu(msg.chat.id);
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const settings = userSettings[chatId] || defaultSettings;
  bot.sendMessage(
    chatId,
    `⚙️ Your Current Settings:
- Value Threshold: ${settings.valueThreshold} ETH
- Gas Price Threshold: ${settings.gasPriceThreshold} Gwei
- 2FA Setup: ${settings.isSetup2FA ? "✅" : "❌"}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
        ],
      },
    }
  );
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userSettings[chatId]) {
    userSettings[chatId] = {
      ...defaultSettings,
      secret: null,
      isSetup2FA: false,
    };
  }

  bot.sendMessage(chatId, "🤖 Welcome to AI Agent Thai Bot!");
  showMenu(chatId);
});
