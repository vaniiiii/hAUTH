const {
  SDK,
  HashLock,
  PrivateKeyProviderConnector,
  NetworkEnum,
} = require("@1inch/cross-chain-sdk");
const express = require("express");
const { Web3 } = require("web3");
const { Contract, JsonRpcProvider, ethers } = require("ethers");
const env = require("dotenv");
env.config();

const app = express();
app.use(express.json());

// Store active orders and their intervals
const activeOrders = new Map();

const ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

function getRandomBytes32() {
  return "0x" + Buffer.from(ethers.randomBytes(32)).toString("hex");
}

async function executeFusionSwap(amount) {
  const web3Instance = new Web3(process.env.BASE_URL);
  const provider = new JsonRpcProvider(process.env.BASE_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const walletAddress = wallet.address;

  const blockchainProvider = new PrivateKeyProviderConnector(
    process.env.PRIVATE_KEY,
    web3Instance
  );

  const sdk = new SDK({
    url: "https://api.1inch.dev/fusion-plus",
    authKey: process.env.INCH_API_KEY,
    blockchainProvider,
  });

  // BASE USDC on mainnet
  const srcTokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  // ARBITRUM USDC
  const dstTokenAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  let token = new Contract(srcTokenAddress, ABI, wallet);

  try {
    let tx = await token.approve(
      "0x111111125421ca6dc452d289314280a0f8842a65",
      ethers.parseUnits(amount.toString(), 6)
    );
    await tx.wait();
    console.log("Approval transaction completed");
  } catch (error) {
    throw new Error(`Approval failed: ${error.message}`);
  }

  const params = {
    srcChainId: NetworkEnum.COINBASE,
    dstChainId: NetworkEnum.ARBITRUM,
    srcTokenAddress,
    dstTokenAddress,
    amount: ethers.parseUnits(amount.toString(), 6).toString(),
    enableEstimate: true,
    walletAddress,
  };

  try {
    const quote = await sdk.getQuote(params);
    const secretsCount = quote.getPreset().secretsCount;
    const secrets = Array.from({ length: secretsCount }).map(() =>
      getRandomBytes32()
    );
    const secretHashes = secrets.map((x) => HashLock.hashSecret(x));

    const hashLock =
      secretsCount === 1
        ? HashLock.forSingleFill(secrets[0])
        : HashLock.forMultipleFills(
            secretHashes.map((secretHash, i) =>
              ethers.solidityPackedKeccak256(
                ["uint64", "bytes32"],
                [i, secretHash.toString()]
              )
            )
          );

    console.log("Received Fusion+ quote from 1inch API");

    const quoteResponse = await sdk.placeOrder(quote, {
      walletAddress,
      hashLock,
      secretHashes,
    });

    const orderHash = quoteResponse.orderHash;
    console.log(`Order successfully placed: ${orderHash}`);

    // Store order monitoring info
    const orderInfo = {
      sdk,
      orderHash,
      secrets,
      secretHashes,
      status: "pending",
    };

    // Set up monitoring
    const intervalId = setInterval(async () => {
      try {
        const order = await sdk.getOrderStatus(orderHash);
        console.log(`Checking status for order ${orderHash}: ${order.status}`);

        if (order.status === "executed") {
          console.log(`Order complete: ${orderHash}`);
          clearInterval(intervalId);
          activeOrders.get(orderHash).status = "completed";
          return;
        }

        const fillsObject = await sdk.getReadyToAcceptSecretFills(orderHash);
        if (fillsObject.fills.length > 0) {
          for (const fill of fillsObject.fills) {
            try {
              await sdk.submitSecret(orderHash, secrets[fill.idx]);
              console.log(`Secret submitted for fill ${fill.idx}`);
            } catch (error) {
              console.error(`Secret submission error: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.error(`Monitoring error: ${error.message}`);
      }
    }, 5000);

    // Store the order info and interval
    orderInfo.intervalId = intervalId;
    activeOrders.set(orderHash, orderInfo);

    return {
      success: true,
      orderHash: orderHash,
      details: {
        srcChain: "Base",
        dstChain: "Arbitrum",
        amount: amount.toString(),
      },
    };
  } catch (error) {
    throw new Error(`Swap failed: ${error.message}`);
  }
}

app.post("/fusion-swap", async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    const result = await executeFusionSwap(amount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to check order status
app.get("/order-status/:orderHash", (req, res) => {
  const orderHash = req.params.orderHash;
  const order = activeOrders.get(orderHash);

  if (!order) {
    res.json({ status: "not_found" });
  } else {
    res.json({ status: order.status });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`1inch Fusion+ service running on port ${PORT}`);
});
