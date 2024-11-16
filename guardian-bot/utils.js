const ethers = require("ethers");

const parseEthToWei = (ethValue) => {
  try {
    if (ethValue === "") return "0";

    const cleanValue = ethValue.toString().trim();

    return ethers.parseEther(cleanValue);
  } catch (error) {
    throw new Error("Invalid ETH value");
  }
};

const formatWeiToEth = (weiValue) => {
  try {
    return ethers.formatEther(weiValue);
  } catch (error) {
    throw new Error("Invalid Wei value");
  }
};

const validateAndFormatThreshold = (input) => {
  try {
    const cleanInput = input.toString().trim();

    const value = parseFloat(cleanInput);
    if (isNaN(value) || value <= 0) {
      throw new Error("Please enter a positive number");
    }

    const weiValue = parseEthToWei(cleanInput);

    return {
      weiValue,
      displayValue: Number(cleanInput),
    };
  } catch (error) {
    throw new Error(
      error.message === "Invalid ETH value"
        ? "Please enter a valid ETH amount (e.g., 0.1, 1, 10)"
        : error.message
    );
  }
};

const isTransactionExceedingThreshold = (transactionWei, thresholdWei) => {
  try {
    return ethers.BigNumber.from(transactionWei).gt(
      ethers.BigNumber.from(thresholdWei)
    );
  } catch (error) {
    throw new Error("Error comparing transaction values");
  }
};

module.exports = {
  parseEthToWei,
  formatWeiToEth,
  validateAndFormatThreshold,
  isTransactionExceedingThreshold,
};
