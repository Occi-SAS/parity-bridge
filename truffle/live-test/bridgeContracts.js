const bip39 = require('bip39');
const fs = require('fs');
const net = require('net');
const toml = require('toml');
const contract = require('truffle-contract');
const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');

const MainBridge = contract(require('../build/contracts/MainBridge'));
const SideBridge = contract(require('../build/contracts/SideBridge'));

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

  MainBridge.setProvider(homeChainProvider);
  SideBridge.setProvider(foreignChainProvider);

  const { home_contract_address, foreign_contract_address } = getBridgeData();

  const mainBridge = await MainBridge.at(home_contract_address);
  const sideBridge = await SideBridge.at(foreign_contract_address);

  const homeAuthorityCount = await mainBridge.numAuthorities();
  console.log(`Found home bridge at ${home_contract_address} with ${homeAuthorityCount} authorities`);
  const foreignAuthorityCount = await sideBridge.numAuthorities();
  console.log(`Found foreign bridge at ${foreign_contract_address} with ${foreignAuthorityCount} authorities`);

  const address = homeChainProvider.getAddress();

  return { mainBridge, sideBridge, address, homeChainConnection, foreignChainConnection };
}

module.exports = getBridgeContracts;
