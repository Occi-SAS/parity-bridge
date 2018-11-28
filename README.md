# bridge

## Changes from parity-bridge

This repo has been forked from the [`parity-bridge`](https://github.com/paritytech/parity-bridge)
project. It maintains much of the same codebase, but has some changes to functionality:

* While the original MainBridge uses Ether, this MainBridge attaches to a special ERC20 token
* The original SideBridge acts as an ERC20 token, however this SideBridge uses Ether
* Mechanisms for the withdrawer to pay the main chain gas costs are removed, since the `MainBridge`
  does not handle Ether anymore. This means authorities are responsible for the gas fees for
  relaying withdraws.

These changes imposes 2 new requirements on the implementation of the bridge:

* An ERC20 token must be deployed before the bridge contracts are deployed
  * The token address must be added to the `config.toml` file
  * When a token is transfered to the MainBridge contract, the token contract must call
    `deposit(address owner, uint256 tokens)` on the MainBridge contract. This requires the
    token contract to store the address of the MainBridge as well.
* The SideBridge contract must hold Ether that it can dispense to other addresses during a deposit


### current functionality

the bridge connects two chains `main` and `side`.

When users deposit tokens into the `MainBridge` contract on `main`
they get the same amount of Ether tokens on `side`.

To convert their `side` Ether into tokens on `main`
users can always send their Ether to the SideBridge, or specify an output address by calling
`SideBridge.transferMainViaRelay(mainRecipientAddress)`.

`side` is assumed to use PoA (proof of authority) consensus.
relays between the chains happen in a byzantine fault tolerant way using the authorities of `side`.

### high level explanation of main ERC20 -> side Ether relay

`sender` calls `transfer(<main bridge address>, <value>)` on the ERC20 token. This token must call
`deposit(address owner, uint256 tokens)` on the `MainBridge` contract, which will emit a
`Deposit(sender, value)` event.

For each `Deposit` event on `MainBridge` every authority executes
`SideBridge.deposit(sender, value, transactionHash)`.

once there are `SideBridge.requiredSignatures` such transactions
with identical arguments and from distinct authorities then
`value` Ether is sent from the SideBridge contract's balance to the `sender` address.

### high level explanation of side Ether -> main ERC20 relay

`sender` sends Ether to the `SideBridge` contract, either through the fallback function or by
calling `SideBridge.transferMainViaRelay(recipient)` with an Ether value. This emits a
`SideBridge.Withdraw(recipient, value)` event.

for every `SideBridge.Withdraw`, every bridge authority creates a message containing
`value`, `recipient` and the `transactionHash` of the transaction referenced by the `SideBridge.Withdraw` event;
signs that message and executes `SideBridge.submitSignature(signature, message)`.
this collection of signatures is on `side` because transactions are free for the authorities on `side`,
but not free on `main`.

once `SideBridge.requiredSignatures` signatures by distinct authorities are collected
a `SideBridge.CollectedSignatures(authorityThatSubmittedLastSignature, messageHash)` event is emitted.

everyone (usually `authorityThatSubmittedLastSignature`) can then call `SideBridge.message(messageHash)` and
`SideBridge.signature(messageHash, 0..requiredSignatures)`
to look up the message and signatures and execute `MainBridge.withdraw(vs, rs, ss, message)`
and complete the withdraw.

`MainBridge.withdraw(vs, rs, ss, message)` recovers the addresses from the signatures,
checks that enough authorities in its authority list have signed and
finally calls `transfer()` on the ERC20 contract, transfering `value` tokens from the balance of the
`MainBridge` contract to the `receiver` address.

### run truffle smart contract tests

requires `yarn` to be `$PATH`. [installation instructions](https://yarnpkg.com/lang/en/docs/install/)

```
cd truffle
yarn test
```

### build

requires `rust` and `cargo`: [installation instructions.](https://www.rust-lang.org/en-US/install.html)

requires `solc`: [installation instructions.](https://solidity.readthedocs.io/en/develop/installing-solidity.html)

assuming you've cloned the bridge (`git clone git@github.com:paritytech/parity-bridge.git`)
and are in the project directory (`cd parity-bridge`) run:

```
cargo build -p parity-bridge -p parity-bridge-deploy --release
```

to install, copy `target/release/parity-bridge` and `target/release/parity-bridge-deploy` into a folder that's in your `$PATH`.

### configuration

the bridge is configured through a configuration file.

here's an example configuration file: [integration-tests/bridge_config.toml](integration-tests/bridge_config.toml)

following is a detailed explanation of all config options.
all fields are required unless marked with *optional*.

#### options

- `address` - address of this bridge authority on `main` and `side` chain
- `estimated_gas_cost_of_withdraw` - an upper bound on the gas a transaction to `MainBridge.withdraw` consumes
  - currently recommended value: `"200000"`
  - must be a string because the `toml` crate can't parse numbers greater max i64
  - run [tools/estimate_gas_costs.sh](tools/estimate_gas_costs.sh) to compute an estimate
  - see [recipient pays relay cost to relaying authority](#recipient-pays-relay-cost-to-relaying-authority) for why this config option is needed
- `token` - address of an ERC20 token to connect to the bridge

#### main options

- `main.http` - path to the http socket of a parity node that has `main.account` unlocked
- `main.contract.bin` - path to the compiled `MainBridge` contract
    - required for initial deployment
    - run [tools/compile_contracts.sh](tools/compile_contracts.sh) to compile contracts into dir `compiled_contracts`
    - then set this to `compiled_contracts/MainBridge.bin`
- `main.required_confirmations` - number of confirmations required to consider transaction final on `main.http`
  - *optional,* default: **12**
- `main.poll_interval` - specify how frequently (seconds) `main.http` should be polled for changes
  - *optional,* default: **1**
- `main.request_timeout` - how many seconds to wait for responses from `main.http` before timing out
  - *optional,* default: **5**

#### side options

- `side.http` - path to the http socket of a parity node that has `side.account` unlocked
- `side.contract.bin` - path to the compiled `SideBridge` contract
    - required for initial deployment
    - run [tools/compile_contracts.sh](tools/compile_contracts.sh) to compile contracts into dir `compiled_contracts`
    - then set this to `compiled_contracts/SideBridge.bin`
- `side.required_confirmations` - number of confirmations required to consider transaction final on `side.http`
  - *optional,* default: **12**
- `side.poll_interval` - specify how frequently (seconds) `side.http` should be polled for changes
  - *optional,* default: **1**
- `side.request_timeout` - how many seconds to wait for responses from `side.http` before timing out
  - *optional,* default: **5**

#### authorities options

- `authorities.account` - array of addresses of authorities
- `authorities.required_signatures` - number of authorities signatures required to consider action final

#### transaction options

`gas` and `gas_price` to use for the specific transactions.
these are all **optional** and default to `0`.

look into the `[transactions]` section in [integration-tests/bridge_config.toml](integration-tests/bridge_config.toml)
for recommendations on provided `gas`.

##### these happen on `main`:

- `transaction.main_deploy.gas`
- `transaction.main_deploy.gas_price`
- `transaction.withdraw_relay.gas`
- `transaction.withdraw_relay.gas_price`

##### these happen on `side`:

- `transaction.side_deploy.gas`
- `transaction.side_deploy.gas_price`
- `transaction.side_deploy.value` - Amount of Wei to be sent to the `SideBridge` contract when deployed
- `transaction.deposit_relay.gas`
- `transaction.deposit_relay.gas_price`
- `transaction.withdraw_confirm.gas`
- `transaction.withdraw_confirm.gas_price`

### database file format

```toml
main_contract_address = "0x49edf201c1e139282643d5e7c6fb0c7219ad1db7"
side_contract_address = "0x49edf201c1e139282643d5e7c6fb0c7219ad1db8"
main_deploy = 100
side_deploy = 101
checked_deposit_relay = 120
checked_withdraw_relay = 121
checked_withdraw_confirm = 121
```

**all fields are required**

- `main_contract_address` - address of the bridge contract on main chain
- `side_contract_address` - address of the bridge contract on side chain
- `main_deploy` - block number at which main contract has been deployed
- `side_deploy` - block number at which side contract has been deployed
- `checked_deposit_relay` - number of the last block for which an authority has relayed deposits to the side
- `checked_withdraw_relay` - number of the last block for which an authority has relayed withdraws to the main
- `checked_withdraw_confirm` - number of the last block for which an authority has confirmed withdraw

### deployment and run

[read our deployment guide](deployment_guide.md)

### deposit

![deposit](./res/deposit.png)

### withdraw

![withdraw](./res/withdraw.png)
