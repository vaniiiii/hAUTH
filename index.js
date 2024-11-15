require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

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
        [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
      ],
    },
  };
  bot.sendMessage(chatId, "⚙️ Configuration Menu:", options);
}

bot.on("callback_query", (callbackQuery) => {
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
- Gas Price Threshold: ${settings.gasPriceThreshold} Gwei`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Main Menu", callback_data: "menu_main" }],
          ],
        },
      }
    );
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

function send2FAMessage(tx, chatId) {
  const userConfig = userSettings[chatId] || defaultSettings;

  if (
    tx.value > userConfig.valueThreshold ||
    tx.gasPrice > userConfig.gasPriceThreshold
  ) {
    const message = `
🔒 **2FA Required**
- **Recipient Address**: ${tx.to}
- **Value**: ${tx.value} ETH
- **Gas Price**: ${tx.gasPrice} Gwei

Please reply:
✅ *yes* - to approve
❌ *no* - to reject`;
    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
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

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userSettings[chatId]) {
    userSettings[chatId] = { ...defaultSettings };
  }

  bot.sendMessage(chatId, "🤖 Welcome to AI Agent Thai Bot!");
  showMenu(chatId);
});
