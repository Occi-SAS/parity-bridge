const bip39 = require('bip39');
const fs = require('fs');
const net = require('net');
const toml = require('toml');
const contract = require('truffle-contract');
const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const ForeignBridge = contract(require('../build/contracts/ForeignBridge'));
const HomeBridge = contract(require('../build/contracts/HomeBridge'));

const IPC_DIR = '/opt/ipc';

Web3.providers.IpcProvider.prototype.sendAsync = Web3.providers.IpcProvider.prototype.send;
HDWalletProvider.prototype.send = HDWalletProvider.prototype.sendAsync;

function getBridgeData() {
  const path = '/opt/bridge/deployment/db.toml';
  if (!fs.existsSync(path)) {
    throw new Error('Can not find bridge configuration file. Ensure that volumes are set correctly');
  }

  const config = toml.parse(fs.readFileSync(path, 'utf8'));
  return config;
}

async function getBridgeContracts() {
  const homeChainConnection = new Web3.providers.IpcProvider(`${IPC_DIR}/home-node/jsonrpc.ipc`, net);
  const foreignChainConnection = new Web3.providers.IpcProvider(`${IPC_DIR}/node1/jsonrpc.ipc`, net);

  const mnemonic = bip39.generateMnemonic();
  console.log(`Generating test accounts from mnemonic:\n${mnemonic}`);

  const homeChainProvider = new HDWalletProvider(mnemonic, homeChainConnection);
  const foreignChainProvider = new HDWalletProvider(mnemonic, foreignChainConnection);

  HomeBridge.setProvider(homeChainProvider);
  ForeignBridge.setProvider(foreignChainProvider);

  const { home_contract_address, foreign_contract_address } = getBridgeData();

  const homeBridge = await HomeBridge.at(home_contract_address);
  const foreignBridge = await ForeignBridge.at(foreign_contract_address);

  const homeAuthorityCount = await homeBridge.numAuthorities();
  console.log(`Found home bridge at ${home_contract_address} with ${homeAuthorityCount} authorities`);
  const foreignAuthorityCount = await foreignBridge.numAuthorities();
  console.log(`Found foreign bridge at ${foreign_contract_address} with ${foreignAuthorityCount} authorities`);

  const address = homeChainProvider.getAddress();

  return { homeBridge, foreignBridge, address, homeChainConnection, foreignChainConnection };
}

module.exports = getBridgeContracts;
