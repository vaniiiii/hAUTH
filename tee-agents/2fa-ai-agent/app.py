import os
from dstack_sdk import AsyncTappdClient, DeriveKeyResponse, TdxQuoteResponse
from fastapi import FastAPI, Query
from cryptography.hazmat.primitives.asymmetric.ec import derive_private_key, SECP256K1
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from eth_hash.auto import keccak
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

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

import os
from typing import Dict, List, Optional, Union
from dotenv import load_dotenv
import json
from abc import ABC, abstractmethod
from datetime import datetime
import time
import requests
from openai import OpenAI
from web3 import Web3
from eth_account import Account
from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from jinja2 import Environment, FileSystemLoader

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

class BlockchainNetwork:
    def __init__(self, network_name: str, rpc_url: str, chain_id: int):
        self.network_name = network_name
        self.rpc_url = rpc_url
        self.chain_id = chain_id
        append_to_chat_history('system', f"Connecting to {network_name}...")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        if self.w3.is_connected():
            append_to_chat_history('system', f"✓ Connected to {network_name}")
        else:
            append_to_chat_history('system', f"✗ Failed to connect to {network_name}")

class Operation(ABC):
    def __init__(self, blockchain_network: BlockchainNetwork):
        self.w3 = blockchain_network.w3

    @abstractmethod
    def execute(self, *args, **kwargs):
        pass

    @abstractmethod
    def validate(self, *args, **kwargs) -> bool:
        pass

class TransferOperation(Operation):
    def validate(self, from_address: str, to_address: str, amount: float) -> bool:
        try:
            # Convert addresses to checksum format
            from_checksum = self.w3.to_checksum_address(from_address)
            to_checksum = self.w3.to_checksum_address(to_address)
            
            if not self.w3.is_address(from_checksum) or not self.w3.is_address(to_checksum):
                append_to_chat_history('system', "Invalid address format")
                return False
            
            balance = self.w3.eth.get_balance(from_checksum)
            wei_amount = self.w3.to_wei(amount, 'ether')
            
            return balance >= wei_amount
        except Exception as e:
            append_to_chat_history('system', f"Validation error: {str(e)}")
            return False

    def request_approval(self, from_address: str, to_address: str, value: int, gas_price: int) -> dict:
        try:
            append_to_chat_history('system', "Requesting transaction approval...")
            
            url = "http://10.10.8.131:3000/api/request-approval"
            payload = {
                "agentAddress": from_address,
                "transaction": {
                    "to": to_address,
                    "value": str(value),
                    "gasPrice": str(gas_price)
                }
            }

            response = requests.post(url, json=payload)
            result = response.json()
            
            # Enhanced response handling with 2FA status
            if result.get("approved"):
                if result.get("required2FA"):
                    if result.get("used2FA"):
                        append_to_chat_history('system', "Transaction approved with 2FA verification ✓")
                    else:
                        append_to_chat_history('system', "Transaction approved without 2FA (2FA is enabled but not used) ⚠️")
                else:
                    append_to_chat_history('system', "Transaction approved")
                return result
            else:
                if "reason" in result and result["reason"] == "Approval timeout":
                    append_to_chat_history('system', "Transaction timed out waiting for approval")
                else:
                    append_to_chat_history('system', "Transaction rejected")
                return result

        except Exception as e:
            append_to_chat_history('system', f"Approval request error: {str(e)}")
            raise

    def execute(self, from_address: str, to_address: str, amount: float, private_key: str):
        try:
            # Convert addresses to checksum format
            from_checksum = self.w3.to_checksum_address(from_address)
            to_checksum = self.w3.to_checksum_address(to_address)
            
            nonce = self.w3.eth.get_transaction_count(from_checksum)
            wei_amount = self.w3.to_wei(amount, 'ether')
            
            max_priority_fee = self.w3.eth.max_priority_fee
            max_fee = 2 * max_priority_fee
            
            transaction = {
                'from': from_checksum,
                'to': to_checksum,
                'value': wei_amount,
                'nonce': nonce,
                'gas': 21000,
                'maxFeePerGas': max_fee,
                'maxPriorityFeePerGas': max_priority_fee,
                'chainId': self.w3.eth.chain_id,
                'type': 2
            }
            
            append_to_chat_history('system', "Preparing transaction...")
            
            estimated_gas = self.w3.eth.estimate_gas({
                'from': from_checksum,
                'to': to_checksum,
                'value': wei_amount
            })
            transaction['gas'] = int(estimated_gas * 1.2)
            
            # Request approval before proceeding with transaction
            approval_result = self.request_approval(
                from_checksum, 
                to_checksum,
                wei_amount,
                max_fee
            )
            
            if not approval_result.get("approved"):
                if approval_result.get("reason") == "Approval timeout":
                    raise Exception("Transaction timed out waiting for approval")
                raise Exception("Transaction rejected by approval server")
            
            # Add security recommendation if 2FA is not being used
            if approval_result.get("required2FA") and not approval_result.get("used2FA"):
                append_to_chat_history('system', "\nSecurity Recommendation:", message_type='meta')
                append_to_chat_history('system', "• 2FA is enabled but was not used for this approval")
                append_to_chat_history('system', "• Consider using 2FA for enhanced security on high-value transactions")
                append_to_chat_history('system', "• You can configure 2FA settings in the Telegram bot")
            
            signed = self.w3.eth.account.sign_transaction(transaction, private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            
            return self.w3.eth.wait_for_transaction_receipt(tx_hash)
        except Exception as e:
            append_to_chat_history('system', f"Execution error: {str(e)}")
            raise

class BalanceOperation(Operation):
    def validate(self, address: str) -> bool:
        try:
            # Convert to checksum address before validation
            checksum_address = self.w3.to_checksum_address(address)
            return self.w3.is_address(checksum_address)
        except Exception as e:
            append_to_chat_history('system', f"Validation error: {str(e)}")
            return False

    def execute(self, address: str, **kwargs):
        try:
            # Convert to checksum address before getting balance
            checksum_address = self.w3.to_checksum_address(address)
            balance = self.w3.eth.get_balance(checksum_address)
            return {
                'balance': self.w3.from_wei(balance, 'ether'),
                'address': checksum_address
            }
        except Exception as e:
            append_to_chat_history('system', f"Execution error: {str(e)}")
            raise

class BlockchainAgent:
    def __init__(self, model: str = "gpt-4-1106-preview"):
        self._print_welcome_banner()
        append_to_chat_history('system', "Initializing blockchain connection...")
        
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.model = model
        self.networks = self._initialize_networks()
        self.current_network = None
        self.private_key = os.getenv('PRIVATE_KEY')
        self.account = Account.from_key(self.private_key)
        self.transaction_history = []
        
        append_to_chat_history('system', "✓ Successfully initialized with address:")
        append_to_chat_history('system', f"{self.account.address}\n")
        
        self.system_prompt = """
        You are a blockchain operations assistant that ALWAYS responds in JSON format.
        You help with cryptocurrency operations and MUST format all responses as JSON.

        Available operations:
        1. transfer - Send ETH to an address
        2. balance - Check account balance
        3. token - Handle token operations (not implemented yet)

        For ALL inputs, respond with a JSON object containing:
        {
            "operation_type": "transfer" or "balance",
            "parameters": {
                // For transfer:
                "to_address": "ethereum_address",
                "amount": number,
                
                // For balance:
                "address": "ethereum_address"
            }
        }
        """

    def _print_welcome_banner(self):
        banner = """Welcome to the blockchain AI"""
        append_to_chat_history('system', banner, message_type='meta')

    def _get_eth_price(self) -> Optional[float]:
        try:
            response = requests.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
            return response.json()['ethereum']['usd']
        except:
            return None

    def _print_transaction_summary(self, tx_hash: str, amount: float):
        eth_price = self._get_eth_price()
        append_to_chat_history('system', "\nTransaction Summary:", message_type='meta')
        append_to_chat_history('system', f"├─ Hash: {tx_hash}")
        append_to_chat_history('system', f"├─ Amount: {amount} ETH")
        if eth_price:
            usd_value = amount * eth_price
            append_to_chat_history('system', f"├─ USD Value: ${usd_value:.2f}")
        append_to_chat_history('system', f"└─ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    def _print_balance_summary(self, balance: float, address: str):
        eth_price = self._get_eth_price()
        append_to_chat_history('system', "\nBalance Summary:", message_type='meta')
        append_to_chat_history('system', f"├─ Address: {address}")
        append_to_chat_history('system', f"├─ Balance: {balance} ETH")
        if eth_price:
            usd_value = balance * eth_price
            append_to_chat_history('system', f"└─ USD Value: ${usd_value:.2f}")

    def _print_help(self):
        help_text = """
Available Commands:
├─ balance - Check your balance
├─ send X ETH to ADDRESS - Send ETH to an address
├─ help - Show this help message
├─ history - Show transaction history
└─ exit - Exit the program
"""
        append_to_chat_history('system', help_text, message_type='meta')

    def _show_transaction_history(self):
        if not self.transaction_history:
            append_to_chat_history('system', "No transactions in history.")
            return
        
        append_to_chat_history('system', "\nTransaction History:", message_type='meta')
        for i, tx in enumerate(self.transaction_history, 1):
            append_to_chat_history('system', f"Transaction {i}:")
            append_to_chat_history('system', f"├─ Hash: {tx['hash']}")
            append_to_chat_history('system', f"├─ Type: {tx['type']}")
            append_to_chat_history('system', f"├─ Amount: {tx['amount']} ETH")
            append_to_chat_history('system', f"└─ Time: {tx['time']}\n")

    def _execute_operation(self, operation_type: str, params: Dict):
        if operation_type == "transfer":
            append_to_chat_history('system', "\nExecuting transfer...", message_type='meta')
            op = TransferOperation(self.current_network)
            params['private_key'] = self.private_key
            params['from_address'] = self.account.address
            result = op.execute(**params)
            
            self.transaction_history.append({
                'hash': result.transactionHash.hex(),
                'type': 'Transfer',
                'amount': params['amount'],
                'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
            
            self._print_transaction_summary(result.transactionHash.hex(), params['amount'])
            return result
                
        elif operation_type == "balance":
            op = BalanceOperation(self.current_network)
            result = op.execute(params.get('address', self.account.address))
            self._print_balance_summary(float(result['balance']), result['address'])
            return result

    def _parse_intent(self, user_message: str) -> Dict:
        """Parse user message into structured operation using GPT."""
        modified_prompt = f"""
        You are a blockchain operations assistant that ALWAYS responds in JSON format.
        You help with cryptocurrency operations and MUST format all responses as JSON.
        The current user's address is: {self.account.address}

        Available operations:
        1. transfer - Send ETH to an address
        2. balance - Check account balance

        For ALL inputs, respond with a JSON object containing:
        {{
            "operation_type": "transfer" or "balance",
            "parameters": {{
                // For transfer:
                "to_address": "ethereum_address",
                "amount": number,
                
                // For balance:
                "address": "ethereum_address" or null  // null means check user's own balance
            }}
        }}

        Examples:
        1. "Check my balance" -> use null for address (will default to user's address)
        2. "Check balance of 0x123..." -> use the specified address
        3. "What's the balance for 0x456..." -> use the specified address
        """
        
        messages = [
            {"role": "system", "content": modified_prompt},
            {"role": "user", "content": f"Parse this request into JSON format: {user_message}"}
        ]
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # If it's a balance check without an address, use the user's address
            if result['operation_type'] == 'balance' and (
                result['parameters'].get('address') is None or 
                result['parameters'].get('address') == 'ethereum_address' or
                result['parameters'].get('address') == ''
            ):
                result['parameters']['address'] = self.account.address
            
            # Convert addresses to checksum format if present
            if result['operation_type'] == 'balance' and 'address' in result['parameters']:
                try:
                    result['parameters']['address'] = self.current_network.w3.to_checksum_address(
                        result['parameters']['address']
                    )
                except Exception:
                    pass  # Let validation handle invalid addresses
                    
            if result['operation_type'] == 'transfer' and 'to_address' in result['parameters']:
                try:
                    result['parameters']['to_address'] = self.current_network.w3.to_checksum_address(
                        result['parameters']['to_address']
                    )
                except Exception:
                    pass  # Let validation handle invalid addresses
                
            append_to_chat_history('system', f"Parsed intent: {result}")
            return result
            
        except Exception as e:
            append_to_chat_history('system', f"Error parsing intent: {str(e)}")
            raise

    def _validate_operation(self, operation_type: str, params: Dict) -> bool:
        try:
            if operation_type == "transfer":
                try:
                    to_checksum = self.current_network.w3.to_checksum_address(params['to_address'])
                    from_checksum = self.current_network.w3.to_checksum_address(self.account.address)
                except ValueError:
                    append_to_chat_history('system', "Invalid address format")
                    return False

                if not self.current_network.w3.is_address(to_checksum):
                    append_to_chat_history('system', "Invalid recipient address format")
                    return False
                        
                balance = self.current_network.w3.eth.get_balance(from_checksum)
                wei_amount = self.current_network.w3.to_wei(params['amount'], 'ether')
                
                append_to_chat_history('system', "Validation:", message_type='meta')
                append_to_chat_history('system', f"├─ Current Balance: {self.current_network.w3.from_wei(balance, 'ether')} ETH")
                append_to_chat_history('system', f"└─ Required Amount: {params['amount']} ETH")
                
                return balance >= wei_amount
                    
            elif operation_type == "balance":
                try:
                    address = params.get('address', self.account.address)
                    checksum_address = self.current_network.w3.to_checksum_address(address)
                    if not self.current_network.w3.is_address(checksum_address):
                        append_to_chat_history('system', "Invalid address format")
                        return False
                    return True
                except ValueError:
                    append_to_chat_history('system', "Invalid address format")
                    return False
                    
            return False
        except Exception as e:
            append_to_chat_history('system', f"Validation error: {str(e)}")
            return False

    def process_message(self, user_message: str) -> str:
        try:
            lower_message = user_message.lower()
            
            # Handle direct balance commands
            if lower_message in ['balance', 'check my balance', "what's my balance", 'whats my balance']:
                result = self._execute_operation('balance', {'address': self.account.address})
                return "Balance check completed."
            
            # Handle checking balance of a specific address directly
            if 'balance of ' in lower_message and '0x' in lower_message:
                address = lower_message.split('0x')[1][:40]
                address = f"0x{address}"
                try:
                    # Convert to checksum address before validation
                    checksum_address = self.current_network.w3.to_checksum_address(address)
                    result = self._execute_operation('balance', {'address': checksum_address})
                    return "Balance check completed."
                except ValueError:
                    return "Invalid Ethereum address format."
                
            # For other commands, use GPT to parse intent
            intent = self._parse_intent(user_message)
            
            if not self._validate_operation(intent['operation_type'], intent['parameters']):
                return "Operation validation failed. Please check parameters and try again."
            
            result = self._execute_operation(intent['operation_type'], intent['parameters'])
            
            if intent['operation_type'] == 'transfer':
                return "Transfer completed successfully."
            elif intent['operation_type'] == 'balance':
                return "Balance check completed."
            
        except Exception as e:
            return f"Error processing request: {str(e)}"

    def _initialize_networks(self) -> Dict[str, BlockchainNetwork]:
        return {
            'base-sepolia': BlockchainNetwork(
                'base-sepolia',
                os.getenv('BASE_SEPOLIA_URL', 'https://sepolia.base.org'),
                84532
            )
        }

    def set_network(self, network_name: str) -> None:
        if network_name not in self.networks:
            raise ValueError(f"Network {network_name} not found. Available networks: {list(self.networks.keys())}")
        self.current_network = self.networks[network_name]

agent = BlockchainAgent()
agent.set_network('base-sepolia')

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

        # Handle special commands
        if text.lower() == "exit":
            append_to_chat_history('system', "Goodbye!")
            return JSONResponse(content={"message": "Goodbye!"}, status_code=200)
        if text.lower() == "help":
            agent._print_help()
            return JSONResponse(content={"status": "ok"})
        if text.lower() == "history":
            agent._show_transaction_history()
            return JSONResponse(content={"status": "ok"})

        # Append user's message to chat history
        append_to_chat_history('user', text)

        # Process the user's message
        response = agent.process_message(text)

        # Append agent's response to chat history
        append_to_chat_history('agent', response)

        # Return success
        return JSONResponse(content={"status": "ok"})

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
