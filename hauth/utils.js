const ethers = require("ethers");

const parseWeiValue = (value, unit = "ether") => {
  try {
    if (value === "") return "0";
    const cleanValue = value.toString().trim();
    return ethers.parseUnits(cleanValue, unit).toString();
  } catch (error) {
    throw new Error(`Invalid ${unit} value`);
  }
};

const formatWeiValue = (weiValue, unit = "ether") => {
  try {
    return ethers.formatUnits(weiValue, unit);
  } catch (error) {
    throw new Error(`Invalid Wei value for ${unit} conversion`);
  }
};

const validateAndFormatThreshold = (input, unit = "ether") => {
  try {
    const cleanInput = input.toString().trim();
    const value = parseFloat(cleanInput);

    if (isNaN(value) || value <= 0) {
      throw new Error("Please enter a positive number");
    }

    const weiValue = parseWeiValue(cleanInput, unit);

    return {
      weiValue,
      displayValue: Number(cleanInput),
    };
  } catch (error) {
    const unitDisplay = unit === "ether" ? "ETH" : "Gwei";
    throw new Error(
      error.message.includes("Invalid")
        ? `Please enter a valid ${unitDisplay} amount (e.g., 0.1, 1, 10)`
        : error.message
    );
  }
};

const isExceedingThreshold = (value, threshold) => {
  try {
    return BigInt(value) > BigInt(threshold);
  } catch (error) {
    throw new Error("Error comparing values");
  }
};

module.exports = {
  parseWeiValue,
  formatWeiValue,
  validateAndFormatThreshold,
  isExceedingThreshold,
};
