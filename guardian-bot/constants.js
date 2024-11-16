const REGISTRY_ADDRESS = "0x0577d33218e33728D6728E8347498ef120Dc7F12";
const REGISTRY_ABI = [
  "function acceptOwnership() external",
  "function agentConfigs(address) external view returns (uint96 valueThreshold, uint96 gasThreshold, bool isSetup2FA, bool isActive, string memory metadata, address owner)",
  "function checkTransactionApproval(address agentAddress, uint256 value, uint256 gasPrice) external view returns (bool needsApproval, bool needs2FA)",
  "function deactivateAgent(address agentAddress) external",
  "function getUserAgents(address userAddress) external view returns (address[] memory)",
  "function owner() external view returns (address)",
  "function pendingOwner() external view returns (address)",
  "function registerAgent(address agentAddress, address ownerAddress, uint256 valueThreshold, uint256 gasThreshold, string memory metadata) external",
  "function renounceOwnership() external",
  "function toggle2FA(address agentAddress, bool enabled) external",
  "function transferOwnership(address newOwner) external",
  "function updateMetadata(address agentAddress, string memory metadata) external",
  "function updateThresholds(address agentAddress, uint256 newValueThreshold, uint256 newGasThreshold) external",
  "function userAgents(address, uint256) external view returns (address)",
];
const BASE_SEPOLIA_URL = "https://base-sepolia-rpc.publicnode.com";
module.exports = { REGISTRY_ADDRESS, REGISTRY_ABI, BASE_SEPOLIA_URL };
