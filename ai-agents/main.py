import os
from typing import Dict, List, Optional, Union
from dotenv import load_dotenv
from openai import OpenAI
from web3 import Web3
from eth_account import Account
import json
from abc import ABC, abstractmethod
from datetime import datetime
import time
from colorama import init, Fore, Back, Style
import requests
from tqdm import tqdm

# Initialize colorama for cross-platform colored output
init()

load_dotenv()

class BlockchainNetwork:
    def __init__(self, network_name: str, rpc_url: str, chain_id: int):
        self.network_name = network_name
        self.rpc_url = rpc_url
        self.chain_id = chain_id
        print(f"{Fore.CYAN}Connecting to {network_name}...{Style.RESET_ALL}")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        
        if self.w3.is_connected():
            print(f"{Fore.GREEN}✓ Connected to {network_name}{Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}✗ Failed to connect to {network_name}{Style.RESET_ALL}")

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
                print(f"{Fore.YELLOW}Invalid address format{Style.RESET_ALL}")
                return False
            
            balance = self.w3.eth.get_balance(from_checksum)
            wei_amount = self.w3.to_wei(amount, 'ether')
            
            return balance >= wei_amount
        except Exception as e:
            print(f"{Fore.RED}Validation error: {str(e)}{Style.RESET_ALL}")
            return False

    def request_approval(self, from_address: str, to_address: str, value: int, gas_price: int) -> dict:
        try:
            print(f"{Fore.CYAN}Requesting transaction approval...{Style.RESET_ALL}")
            
            url = "http://localhost:3000/api/request-approval"
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
                        print(f"{Fore.GREEN}Transaction approved with 2FA verification ✓{Style.RESET_ALL}")
                    else:
                        print(f"{Fore.YELLOW}Transaction approved without 2FA (2FA is enabled but not used) ⚠️{Style.RESET_ALL}")
                else:
                    print(f"{Fore.GREEN}Transaction approved{Style.RESET_ALL}")
                return result
            else:
                if "reason" in result and result["reason"] == "Approval timeout":
                    print(f"{Fore.YELLOW}Transaction timed out waiting for approval{Style.RESET_ALL}")
                else:
                    print(f"{Fore.YELLOW}Transaction rejected{Style.RESET_ALL}")
                return result

        except Exception as e:
            print(f"{Fore.RED}Approval request error: {str(e)}{Style.RESET_ALL}")
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
            
            print(f"{Fore.CYAN}Preparing transaction...{Style.RESET_ALL}")
            
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
                print(f"\n{Fore.YELLOW}Security Recommendation:{Style.RESET_ALL}")
                print("• 2FA is enabled but was not used for this approval")
                print("• Consider using 2FA for enhanced security on high-value transactions")
                print("• You can configure 2FA settings in the Telegram bot")
            
            signed = self.w3.eth.account.sign_transaction(transaction, private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            
            return self.w3.eth.wait_for_transaction_receipt(tx_hash)
        except Exception as e:
            print(f"{Fore.RED}Execution error: {str(e)}{Style.RESET_ALL}")
            raise
class BalanceOperation(Operation):
    def validate(self, address: str) -> bool:
        try:
            # Convert to checksum address before validation
            checksum_address = self.w3.to_checksum_address(address)
            return self.w3.is_address(checksum_address)
        except Exception as e:
            print(f"{Fore.RED}Validation error: {str(e)}{Style.RESET_ALL}")
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
            print(f"{Fore.RED}Execution error: {str(e)}{Style.RESET_ALL}")
            raise

class BlockchainAgent:
    def __init__(self, model: str = "gpt-4-1106-preview"):
        self._print_welcome_banner()
        print(f"{Fore.CYAN}Initializing blockchain connection...{Style.RESET_ALL}")
        
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.model = model
        self.networks = self._initialize_networks()
        self.current_network = None
        self.private_key = os.getenv('PRIVATE_KEY')
        self.account = Account.from_key(self.private_key)
        self.transaction_history = []
        
        print(f"{Fore.GREEN}✓ Successfully initialized with address:{Style.RESET_ALL}")
        print(f"{Fore.YELLOW}{self.account.address}{Style.RESET_ALL}\n")
        
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
        banner = f"""
{Fore.CYAN}╔══════════════════════════════════════════════════════════════╗
║                  {Fore.WHITE}Blockchain AI Assistant{Fore.CYAN}                     ║
╚══════════════════════════════════════════════════════════════╝{Style.RESET_ALL}
"""
        print(banner)

    def _get_eth_price(self) -> Optional[float]:
        try:
            response = requests.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
            return response.json()['ethereum']['usd']
        except:
            return None

    def _print_transaction_summary(self, tx_hash: str, amount: float):
        eth_price = self._get_eth_price()
        print(f"\n{Fore.CYAN}Transaction Summary:{Style.RESET_ALL}")
        print(f"├─ Hash: {Fore.YELLOW}{tx_hash}{Style.RESET_ALL}")
        print(f"├─ Amount: {Fore.GREEN}{amount} ETH{Style.RESET_ALL}")
        if eth_price:
            usd_value = amount * eth_price
            print(f"├─ USD Value: ${usd_value:.2f}")
        print(f"└─ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    def _print_balance_summary(self, balance: float, address: str):
        eth_price = self._get_eth_price()
        print(f"\n{Fore.CYAN}Balance Summary:{Style.RESET_ALL}")
        print(f"├─ Address: {Fore.YELLOW}{address}{Style.RESET_ALL}")
        print(f"├─ Balance: {Fore.GREEN}{balance} ETH{Style.RESET_ALL}")
        if eth_price:
            usd_value = balance * eth_price
            print(f"└─ USD Value: ${usd_value:.2f}")

    def _print_help(self):
        help_text = f"""
{Fore.CYAN}Available Commands:{Style.RESET_ALL}
├─ {Fore.GREEN}balance{Style.RESET_ALL} - Check your balance
├─ {Fore.GREEN}send X ETH to ADDRESS{Style.RESET_ALL} - Send ETH to an address
├─ {Fore.GREEN}help{Style.RESET_ALL} - Show this help message
├─ {Fore.GREEN}history{Style.RESET_ALL} - Show transaction history
└─ {Fore.GREEN}exit{Style.RESET_ALL} - Exit the program
"""
        print(help_text)

    def _show_transaction_history(self):
        if not self.transaction_history:
            print(f"{Fore.YELLOW}No transactions in history.{Style.RESET_ALL}")
            return
        
        print(f"\n{Fore.CYAN}Transaction History:{Style.RESET_ALL}")
        for i, tx in enumerate(self.transaction_history, 1):
            print(f"Transaction {i}:")
            print(f"├─ Hash: {Fore.YELLOW}{tx['hash']}{Style.RESET_ALL}")
            print(f"├─ Type: {tx['type']}")
            print(f"├─ Amount: {Fore.GREEN}{tx['amount']} ETH{Style.RESET_ALL}")
            print(f"└─ Time: {tx['time']}\n")

    def _execute_operation(self, operation_type: str, params: Dict):
        if operation_type == "transfer":
            print(f"\n{Fore.CYAN}Executing transfer...{Style.RESET_ALL}")
            with tqdm(total=100, desc="Processing", bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt}') as pbar:
                op = TransferOperation(self.current_network)
                params['private_key'] = self.private_key
                params['from_address'] = self.account.address
                
                pbar.update(30)
                time.sleep(0.5)
                result = op.execute(**params)
                pbar.update(70)
                
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
                
            print(f"{Fore.CYAN}Parsed intent: {result}{Style.RESET_ALL}")
            return result
            
        except Exception as e:
            print(f"{Fore.RED}Error parsing intent: {str(e)}{Style.RESET_ALL}")
            raise

    def _validate_operation(self, operation_type: str, params: Dict) -> bool:
        try:
            if operation_type == "transfer":
                try:
                    to_checksum = self.current_network.w3.to_checksum_address(params['to_address'])
                    from_checksum = self.current_network.w3.to_checksum_address(self.account.address)
                except ValueError:
                    print(f"{Fore.YELLOW}Invalid address format{Style.RESET_ALL}")
                    return False

                if not self.current_network.w3.is_address(to_checksum):
                    print(f"{Fore.YELLOW}Invalid recipient address format{Style.RESET_ALL}")
                    return False
                    
                balance = self.current_network.w3.eth.get_balance(from_checksum)
                wei_amount = self.current_network.w3.to_wei(params['amount'], 'ether')
                
                print(f"{Fore.CYAN}Validation:{Style.RESET_ALL}")
                print(f"├─ Current Balance: {self.current_network.w3.from_wei(balance, 'ether')} ETH")
                print(f"└─ Required Amount: {params['amount']} ETH")
                
                return balance >= wei_amount
                
            elif operation_type == "balance":
                try:
                    address = params.get('address', self.account.address)
                    checksum_address = self.current_network.w3.to_checksum_address(address)
                    if not self.current_network.w3.is_address(checksum_address):
                        print(f"{Fore.YELLOW}Invalid address format{Style.RESET_ALL}")
                        return False
                    return True
                except ValueError:
                    print(f"{Fore.YELLOW}Invalid address format{Style.RESET_ALL}")
                    return False
                
            return False
        except Exception as e:
            print(f"{Fore.RED}Validation error: {str(e)}{Style.RESET_ALL}")
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
                    return f"{Fore.RED}Invalid Ethereum address format.{Style.RESET_ALL}"
                
            # For other commands, use GPT to parse intent
            intent = self._parse_intent(user_message)
            
            if not self._validate_operation(intent['operation_type'], intent['parameters']):
                return f"{Fore.RED}Operation validation failed. Please check parameters and try again.{Style.RESET_ALL}"
            
            result = self._execute_operation(intent['operation_type'], intent['parameters'])
            
            if intent['operation_type'] == 'transfer':
                return f"{Fore.GREEN}Transfer completed successfully.{Style.RESET_ALL}"
            elif intent['operation_type'] == 'balance':
                return "Balance check completed."
            
        except Exception as e:
            return f"{Fore.RED}Error processing request: {str(e)}{Style.RESET_ALL}"

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

    def chat(self):
        print(f"{Fore.GREEN}Blockchain AI Agent initialized. Type 'help' for commands.{Style.RESET_ALL}")
        self.set_network('base-sepolia')
        print(f"{Fore.CYAN}Network: Base Sepolia{Style.RESET_ALL}\n")
        
        while True:
            try:
                user_input = input(f"{Fore.GREEN}You:{Style.RESET_ALL} ").strip()
                if not user_input:
                    continue
                    
                if user_input.lower() == 'exit':
                    print(f"\n{Fore.YELLOW}Goodbye!{Style.RESET_ALL}")
                    break
                    
                if user_input.lower() == 'help':
                    self._print_help()
                    continue
                    
                if user_input.lower() == 'history':
                    self._show_transaction_history()
                    continue
                
                response = self.process_message(user_input)
                print(f"{Fore.BLUE}Agent:{Style.RESET_ALL} {response}")
                
            except KeyboardInterrupt:
                print(f"\n{Fore.YELLOW}Exiting...{Style.RESET_ALL}")
                break
            except Exception as e:
                print(f"{Fore.RED}Error:{Style.RESET_ALL} {str(e)}")

if __name__ == "__main__":
    agent = BlockchainAgent()
    agent.chat()