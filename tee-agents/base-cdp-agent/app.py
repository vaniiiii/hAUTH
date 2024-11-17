import os
import sys
import time
import threading
from typing import Dict, List, Optional, Union
from dotenv import load_dotenv
import json
from datetime import datetime
import requests
from web3 import Web3
from eth_account import Account
from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from jinja2 import Environment, FileSystemLoader
import os
from dstack_sdk import AsyncTappdClient, DeriveKeyResponse, TdxQuoteResponse
from fastapi import FastAPI, Query
from cryptography.hazmat.primitives.asymmetric.ec import derive_private_key, SECP256K1
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from eth_utils import keccak, to_checksum_address
from ecdsa import SigningKey, SECP256k1
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent


from cdp_langchain.agent_toolkits import CdpToolkit
from cdp_langchain.utils.cdp_agentkit_wrapper import CdpAgentkitWrapper, deferred_functions

# FastAPI application setup
app = FastAPI()

# Set up Jinja2 environment for templates
templates = Environment(loader=FileSystemLoader("templates"))

# Initialize chat_history as a list of message objects
chat_history = []

load_dotenv()

def append_to_chat_history(sender, message, message_type='message'):
    global chat_history
    chat_history.append({
        'sender': sender,
        'message': message,
        'type': message_type
    })

# Configure a file to persist the agent's CDP MPC Wallet Data.
wallet_data_file = "wallet_data.txt"

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

    agent_executor = create_react_agent(
        llm,
        tools=tools,
        checkpointer=memory,
        state_modifier=(
            "You are a helpful agent that can interact onchain using the Coinbase Developer Platform Agentkit. "
            "You are empowered to interact onchain using your tools. If you ever need funds, you can request them from "
            "the faucet if you are on network ID `base-sepolia`. If not, you can provide your wallet details and request "
            "funds from the user. Be concise and helpful with your responses."
        ),
    )

    return agent_executor, config

# Initialize the agent when the app starts
agent_executor, config = initialize_agent()

def process_message(text):
    response_text = ''
    try:
        for chunk in agent_executor.stream({"messages": [HumanMessage(content=text)]}, config):
            if "agent" in chunk:
                content = chunk["agent"]["messages"][0].content
                response_text += content + '\n'
            elif "tools" in chunk:
                content = chunk["tools"]["messages"][0].content
                response_text += content + '\n'
    except Exception as e:
        response_text = f"Error processing message: {str(e)}"
    return response_text.strip()

# Serve static files (if any)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve the HTML page
@app.get("/", response_class=HTMLResponse)
async def get_chat_page():
    return FileResponse('templates/chat.html')

# Endpoint to get chat history (used by the frontend)
@app.get("/chat-history")
async def get_chat_history():
    global chat_history
    return {"chatHistory": chat_history}

@app.get("/chat")
async def chat(text: str = Query(..., description="User input text")):
    global chat_history
    try:
        if not text.strip():
            return JSONResponse(content={"error": "Text cannot be empty"}, status_code=400)

        # Append user's message to chat history
        append_to_chat_history('user', text)

        # Process the user's message
        response = process_message(text)

        # Append agent's response to chat history
        append_to_chat_history('agent', response)

        # Return success
        return JSONResponse(content={"status": "ok", "response": response})

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.get("/derivekey")
async def derivekey():
    # Initialize client
    client = AsyncTappdClient()
    
    # Derive the key using the client's method
    deriveKey = await client.derive_key('/test', 'test')
    assert isinstance(deriveKey, DeriveKeyResponse)
    
    # Convert to bytes
    asBytes = deriveKey.toBytes()
    assert isinstance(asBytes, bytes)
    
    # Limit to 32 bytes for private key
    limitedSize = deriveKey.toBytes(32)
    
    # Convert the private key bytes to an integer
    private_key_int = int.from_bytes(limitedSize, byteorder="big")
    
    # Generate the private key object
    private_key = ec.derive_private_key(private_key_int, SECP256K1())
    
    # Derive the public key from the private key
    public_key = private_key.public_key()
    public_key_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    
    # Compute Ethereum address (Keccak-256 hash of public key, last 20 bytes)
    eth_address = keccak(public_key_bytes[1:])[-20:]
    
    return {
        "private": limitedSize.hex(),
        "address": eth_address.hex()
    }

    
@app.get("/tdxquote")
async def tdxquote():
    client = AsyncTappdClient()
    tdxQuote = await client.tdx_quote('test')
    assert isinstance(tdxQuote, TdxQuoteResponse)
    return {"tdxQuote": tdxQuote}

# If you need to initialize any seed phrases or keys, you can include them her