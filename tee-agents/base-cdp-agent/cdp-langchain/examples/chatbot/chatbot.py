import os
import sys
import time
import threading

from ecdsa import SigningKey, SECP256k1
from eth_utils import keccak, to_checksum_address
from flask import Flask, request, jsonify
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

# Import CDP Agentkit Langchain Extension.
from mnemonic import Mnemonic

from cdp_langchain.agent_toolkits import CdpToolkit
from cdp_langchain.utils.cdp_agentkit_wrapper import CdpAgentkitWrapper,deferred_functions

# Configure a file to persist the agent's CDP MPC Wallet Data.
wallet_data_file = "wallet_data.txt"

# Flask application setup
app = Flask(__name__)


def seed_phrase_to_hex(seed_phrase):
    """
    Convert a seed phrase to a 128-character hexadecimal string.

    Args:
        seed_phrase (str): The seed phrase (BIP-39 mnemonic).

    Returns:
        str: A 128-character hexadecimal string representing the seed.
    """
    mnemo = Mnemonic("english")
    # Generate seed bytes (512 bits)
    seed_bytes = mnemo.to_seed(seed_phrase)
    # Convert seed bytes to hexadecimal string
    hex_seed = seed_bytes.hex()
    return hex_seed


def generate_ethereum_key_pair(seed_hex):
    """
    Generate an Ethereum private/public key pair and address from a hexadecimal seed.

    Args:
        seed_hex (str): A 128-character hexadecimal string (512-bit seed).

    Returns:
        tuple: Private key (hex), public key (uncompressed, hex), and Ethereum address.
    """
    # Convert hex seed to bytes
    seed_bytes = bytes.fromhex(seed_hex)
    # Generate private key using the first 32 bytes of the seed
    private_key = SigningKey.from_string(seed_bytes[:32], curve=SECP256k1)
    # Derive public key from the private key
    public_key = private_key.get_verifying_key()

    # Convert to uncompressed public key (130 chars / 65 bytes)
    public_key_uncompressed = b"\x04" + public_key.to_string()

    # Calculate Ethereum address: keccak256(public_key)[-20:]
    keccak_hash = keccak(public_key_uncompressed)
    eth_address = to_checksum_address("0x" + keccak_hash.hex()[-40:])

    return private_key.to_string().hex(), public_key_uncompressed.hex(), eth_address


def initialize_agent():
    """Initialize the agent with CDP Agentkit."""
    llm = ChatOpenAI(model="gpt-4o-mini")

    wallet_data = None
    if os.path.exists(wallet_data_file):
        with open(wallet_data_file) as f:
            wallet_data = f.read()

    values = {"cdp_wallet_data": wallet_data} if wallet_data else {}
    agentkit = CdpAgentkitWrapper(**values)

    wallet_data = agentkit.export_wallet()
    with open(wallet_data_file, "w") as f:
        f.write(wallet_data)

    cdp_toolkit = CdpToolkit.from_cdp_agentkit_wrapper(agentkit)
    tools = cdp_toolkit.get_tools()

    memory = MemorySaver()
    config = {"configurable": {"thread_id": "CDP Agentkit Chatbot Example!"}}

    return create_react_agent(
        llm,
        tools=tools,
        checkpointer=memory,
        state_modifier=(
            "You are a helpful agent that can interact onchain using the Coinbase Developer Platform Agentkit. "
            "You are empowered to interact onchain using your tools. If you ever need funds, you can request them from "
            "the faucet if you are on network ID `base-sepolia`. If not, you can provide your wallet details and request "
            "funds from the user. Be concise and helpful with your responses."
        ),
    ), config


# Autonomous Mode
def run_autonomous_mode(agent_executor, config, interval=10):
    """Run the agent autonomously with specified intervals."""
    print("Starting autonomous mode...")
    while True:
        try:
            thought = (
                "Be creative and do something interesting on the blockchain. "
                "Choose an action or set of actions and execute it that highlights your abilities."
            )

            for chunk in agent_executor.stream(
                {"messages": [HumanMessage(content=thought)]}, config
            ):
                if "agent" in chunk:
                    print(chunk["agent"]["messages"][0].content)
                elif "tools" in chunk:
                    print(chunk["tools"]["messages"][0].content)
                print("-------------------")
            time.sleep(interval)
        except KeyboardInterrupt:
            print("Goodbye Agent!")
            sys.exit(0)


# Chat Mode
def run_chat_mode(agent_executor, config):
    """Run the agent interactively based on user input."""
    print("Starting chat mode... Type 'exit' to end.")
    while True:
        try:
            user_input = input("\nUser: ")
            if user_input.lower() == "exit":
                break
            print("jebe me")
            for chunk in agent_executor.stream(
                {"messages": [HumanMessage(content=user_input)]}, config
            ):
                if "agent" in chunk:
                    print(chunk["agent"]["messages"][0].content)
                elif "tools" in chunk:
                    print(chunk["tools"]["messages"][0].content)
                print("-------------------")
        except KeyboardInterrupt:
            print("Goodbye Agent!")
            sys.exit(0)

@app.route("/webhook", methods=["POST"])
def webhook():
    """
    Webhook endpoint to trigger specific actions in the chatbot.
    """
    print("Deferred Functions:")
    print(deferred_functions)
    try:
        # Check if the Content-Type is application/json
        if request.content_type != "application/json":
            return jsonify({
                "success": False,
                "error": "Unsupported Media Type. Content-Type must be 'application/json'."
            }), 415

        # Parse JSON payload
        data = request.json
        if not data:
            return jsonify({
                "success": False,
                "error": "Invalid JSON payload"
            }), 400

        print("Webhook triggered with data:", data)

        # Attempt to execute deferred function with key 1
        key = data["senderSecretKey"]  # Key for the deferred function
        if key in deferred_functions:
            print(f"Executing deferred function with key {key}...")
            result = deferred_functions[key]()  # Execute the function
            del deferred_functions[key]  # Clean up after execution
            print(f"Deferred function result: {result}")
        else:
            print(f"No deferred function found for key {key}.")

        # Process the webhook data (additional logic if required)
        message = data.get("message", "No message provided.")
        print(f"Processing webhook message: {message}")

        return jsonify({"success": True, "message": "Webhook received and processed"}), 200

    except Exception as e:
        print("Error processing webhook:", e)
        return jsonify({"success": False, "error": str(e)}), 500




# Mode Selection
def choose_mode():
    """Choose whether to run in autonomous or chat mode based on user input."""
    while True:
        print("\nAvailable modes:")
        print("1. chat    - Interactive chat mode")
        print("2. auto    - Autonomous action mode")

        choice = input("\nChoose a mode (enter number or name): ").lower().strip()
        if choice in ["1", "chat"]:
            return "chat"
        elif choice in ["2", "auto"]:
            return "auto"
        print("Invalid choice. Please try again.")


def main():
    """Start the chatbot agent and Flask server."""
    agent_executor, config = initialize_agent()

    # Start Flask server in a separate thread
    def start_flask():
        app.run(host="0.0.0.0", port=5000)

    flask_thread = threading.Thread(target=start_flask)
    flask_thread.daemon = True
    flask_thread.start()

    # Select and run mode
    mode = choose_mode()
    if mode == "chat":
        run_chat_mode(agent_executor=agent_executor, config=config)
    elif mode == "auto":
        run_autonomous_mode(agent_executor=agent_executor, config=config)


if __name__ == "__main__":
    print("Starting Agent and Flask server...")
    seed_phrase = "fancy version hedgehog wheat alarm infant suggest where pool quiz treat future"
    hex_seed = seed_phrase_to_hex(seed_phrase)
    private_key, public_key, eth_address = generate_ethereum_key_pair(hex_seed)

    print(f"Seed Phrase: {seed_phrase}")
    print(f"Hexadecimal Seed (128 chars): {hex_seed}")
    print(f"Private Key (64 chars): {private_key}")
    print(f"Public Key (Uncompressed, 130 chars): {public_key}")
    print(f"Ethereum Address: {eth_address}")
    main()
