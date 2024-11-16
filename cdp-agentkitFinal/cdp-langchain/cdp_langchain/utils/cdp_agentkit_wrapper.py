"""Util that calls CDP."""

import inspect
import json
import secrets
from collections.abc import Callable
from typing import Any
from collections import defaultdict

import requests
from langchain_core.utils import get_from_dict_or_env
from pydantic import BaseModel, model_validator

from cdp import Wallet
from cdp_langchain import __version__
from cdp_langchain.constants import CDP_LANGCHAIN_DEFAULT_SOURCE

# Global map to store deferred functions
deferred_functions = {}


class CdpAgentkitWrapper(BaseModel):
    """Wrapper for CDP Agentkit Core."""

    wallet: Any = None  #: :meta private:
    cdp_api_key_name: str | None = None
    cdp_api_key_private_key: str | None = None
    network_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def validate_environment(cls, values: dict) -> Any:
        """Validate that CDP API Key and python package exists in the environment and configure the CDP SDK."""
        cdp_api_key_name = get_from_dict_or_env(values, "cdp_api_key_name", "CDP_API_KEY_NAME")
        cdp_api_key_private_key = get_from_dict_or_env(
            values, "cdp_api_key_private_key", "CDP_API_KEY_PRIVATE_KEY"
        ).replace("\\n", "\n")
        network_id = get_from_dict_or_env(values, "network_id", "NETWORK_ID", "base-sepolia")
        wallet_data_json = values.get("cdp_wallet_data")

        try:
            from cdp import Cdp, Wallet, WalletData
        except Exception:
            raise ImportError(
                "CDP SDK is not installed. " "Please install it with `pip install cdp-sdk`"
            ) from None

        Cdp.configure(
            api_key_name=cdp_api_key_name,
            private_key=cdp_api_key_private_key,
            source=CDP_LANGCHAIN_DEFAULT_SOURCE,
            source_version=__version__,
        )

        if wallet_data_json:
            wallet_data = WalletData.from_dict(json.loads(wallet_data_json))
            wallet = Wallet.import_data(wallet_data)
        else:
            wallet = Wallet.create(network_id=network_id)

        values["wallet"] = wallet
        values["cdp_api_key_name"] = cdp_api_key_name
        values["cdp_api_key_private_key"] = cdp_api_key_private_key
        values["network_id"] = network_id

        return values

    def export_wallet(self) -> dict[str, str]:
        """Export wallet data required to re-instantiate the wallet.

        Returns:
            str: The json string of wallet data including the wallet_id and seed.

        """
        wallet_data_dict = self.wallet.export_data().to_dict()

        wallet_data_dict["default_address_id"] = self.wallet.default_address.address_id

        return json.dumps(wallet_data_dict)

    def run_action(self, func: Callable[..., str], **kwargs) -> str:
        """Run a CDP Action, defer execution, and send the transaction for approval if required."""
        func_signature = inspect.signature(func)
        print("Running Action...")
        print("Function Signature:", func_signature)
        print("Function Name:", func.__name__)

        # Log all provided arguments
        print("Arguments Passed (kwargs):", kwargs)

        first_kwarg = next(iter(func_signature.parameters.values()), None)

        # Create a deferred function
        def deferred():
            if first_kwarg and first_kwarg.annotation is Wallet:
                print("Using Wallet:", self.wallet)
                return func(self.wallet, **kwargs)
            else:
                return func(**kwargs)

        # Generate a random 64-character key
        key = secrets.token_hex(32)  # Generates a secure random 64-character hexadecimal string

        # Check condition (always true for now)
        condition = True  # Replace with actual condition logic
        if condition:
            # Store the deferred function in the global map
            deferred_functions[key] = deferred
            print(f"Deferred function stored with key: {key}")

            # Prepare the request payload
            payload = {
                "agentAddress": "0x283d2a1992a7d3D9Ec33125CAa40e6daF4d4e804",  # Replace with a valid agent address
                "transaction": {
                    "value": "1000000000000000000",  # Example value (1 ETH in Wei)
                    "to": "0x5E55E489f5646a0CC47eB2DBb02b8B9B3311dC79",  # Replace with recipient address
                    "gasPrice": "20000000000",  # Example gas price (20 Gwei in Wei)
                    "returnDataEndpoint": "http://localhost:5000/webhook",
                    "senderSecretKey": key,  # Use the generated key here
                },
            }

            try:
                # Send POST request to the API
                response = requests.post("http://localhost:3000/api/request-approval", json=payload)
                response_data = response.json()

                if response.status_code == 200:
                    print("Approval Response:", response_data)
                    print("Executing deferred function...")
                    result = deferred()  # Execute the function immediately
                    print(f"Deferred function result: {result}")
                    return result
                else:
                    print(
                        f"Error: {response.status_code} - {response_data.get('error', 'Unknown error')}"
                    )

            except requests.exceptions.RequestException as e:
                print("Error while sending approval request:", str(e))

            return f"Function deferred with key {key}"
        else:
            # Execute the deferred function immediately
            result = deferred()
            print("Immediate execution result:", result)
            return result

'''"""Util that calls CDP."""

import inspect
import json
from collections.abc import Callable
from typing import Any

from langchain_core.utils import get_from_dict_or_env
from pydantic import BaseModel, model_validator

from cdp import Wallet
from cdp_langchain import __version__
from cdp_langchain.constants import CDP_LANGCHAIN_DEFAULT_SOURCE


class CdpAgentkitWrapper(BaseModel):
    """Wrapper for CDP Agentkit Core."""

    wallet: Any = None  #: :meta private:
    cdp_api_key_name: str | None = None
    cdp_api_key_private_key: str | None = None
    network_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def validate_environment(cls, values: dict) -> Any:
        """Validate that CDP API Key and python package exists in the environment and configure the CDP SDK."""
        cdp_api_key_name = get_from_dict_or_env(values, "cdp_api_key_name", "CDP_API_KEY_NAME")
        cdp_api_key_private_key = get_from_dict_or_env(
            values, "cdp_api_key_private_key", "CDP_API_KEY_PRIVATE_KEY"
        ).replace("\\n", "\n")
        network_id = get_from_dict_or_env(values, "network_id", "NETWORK_ID", "base-sepolia")
        wallet_data_json = values.get("cdp_wallet_data")

        try:
            from cdp import Cdp, Wallet, WalletData
        except Exception:
            raise ImportError(
                "CDP SDK is not installed. " "Please install it with `pip install cdp-sdk`"
            ) from None

        Cdp.configure(
            api_key_name=cdp_api_key_name,
            private_key=cdp_api_key_private_key,
            source=CDP_LANGCHAIN_DEFAULT_SOURCE,
            source_version=__version__,
        )

        if wallet_data_json:
            wallet_data = WalletData.from_dict(json.loads(wallet_data_json))
            wallet = Wallet.import_data(wallet_data)
        else:
            wallet = Wallet.create(network_id=network_id)

        values["wallet"] = wallet
        values["cdp_api_key_name"] = cdp_api_key_name
        values["cdp_api_key_private_key"] = cdp_api_key_private_key
        values["network_id"] = network_id

        return values

    def export_wallet(self) -> dict[str, str]:
        """Export wallet data required to re-instantiate the wallet.

        Returns:
            str: The json string of wallet data including the wallet_id and seed.

        """
        wallet_data_dict = self.wallet.export_data().to_dict()

        wallet_data_dict["default_address_id"] = self.wallet.default_address.address_id

        return json.dumps(wallet_data_dict)

    def run_action(self, func: Callable[..., str], **kwargs) -> str:
        """Run a CDP Action."""
        func_signature = inspect.signature(func)
        print("Running Action...")
        print("Function Signature:", func_signature)
        print("Function with name", func.__name__)
        # Log all provided arguments
        print("Arguments Passed (kwargs):", kwargs)

        first_kwarg = next(iter(func_signature.parameters.values()), None)

        if first_kwarg and first_kwarg.annotation is Wallet:
            # Log the wallet being used
            print("Using Wallet:", self.wallet)

            # Call the function with the wallet and kwargs
            result = func(self.wallet, **kwargs)

        else:
            # Call the function with just kwargs
            result = func(**kwargs)

        # Log the result, assuming it contains transaction data
        print("Transaction Data (Result):", result)
        return result

'''