const assert = require('chai').assert;
const Web3 = require('web3');
const getBridgeContracts = require('./bridgeContracts');
const { waitForBlocksElapsed } = require('./utils');

describe('Bridged chains', () => {
  let address
  let mainBridge, mainWeb3, rawMainWeb3, mainChainConnection, mainOwner;
  let sideBridge, sideWeb3, rawSideWeb3, sideChainConnection;

  const web3 = new Web3();
  const TEST_TOKEN_ALLOCATION = web3.utils.toWei('10', 'ether');
  const TEST_ACCOUNT_ETH_FOR_FEES = web3.utils.toWei('0.01', 'ether');

  async function getMainAccount() {
    const mainAccounts = await rawMainWeb3.eth.getAccounts();
    for (let account of mainAccounts) {
      if ((await mainBridge.balanceOf(account)).gt(web3.utils.toBN(0))) {
        return account;
      }
    }
    return null;
  }

  before(async function() {
    this.timeout(25 * 1000);

    ({ mainBridge, sideBridge, address, mainChainConnection, sideChainConnection } = await getBridgeContracts());

    mainWeb3 = mainBridge.constructor.web3;
    sideWeb3 = sideBridge.constructor.web3;

    rawMainWeb3 = new Web3(mainChainConnection);
    rawSideWeb3 = new Web3(sideChainConnection);

    const mainOwner = await getMainAccount();
    if (!mainOwner) {
      throw new Error('Couldn\'t find main account');
    }

    const hdwalletProvider = mainBridge.constructor.currentProvider;
    mainBridge.constructor.setProvider(mainChainConnection);

    console.log(`Transfering ${web3.utils.fromWei(TEST_ACCOUNT_ETH_FOR_FEES, 'ether')} ETH and `
      + `${web3.utils.fromWei(TEST_TOKEN_ALLOCATION, 'ether')} URP from ${mainOwner} to test `
      + `account ${address}...`);
    await Promise.all([
      await mainBridge.transfer(address, TEST_TOKEN_ALLOCATION, { from: mainOwner }),
      await rawMainWeb3.eth.sendTransaction({
        to: address,
        from: mainOwner,
        value: TEST_ACCOUNT_ETH_FOR_FEES,
      }),
    ]);

    mainBridge.constructor.setProvider(hdwalletProvider);
  });

  after(async () => {
    const tokensToReturn = await mainBridge.balanceOf(address);
    console.log(`Returning ${web3.utils.fromWei(tokensToReturn, 'ether')} URP from test account `
      + `${address} to ${mainOwner}...`);
    if (!tokensToReturn.eq(0)) {
      await mainBridge.transfer(mainOwner, tokensToReturn, { from: address });
    }

    const ethBalance = await mainWeb3.eth.getBalance(address);
    console.log(`Returning ${web3.utils.fromWei(ethBalance, 'ether')} ETH from test account `
      + `${address} to ${mainOwner}...`);
    await mainWeb3.eth.sendTransaction({
      to: mainOwner,
      from: address,
      value: ethBalance,
    });
  });

/*  it('should work on the side chain', async() => {
    const web3 = new Web3(sideChainConnection);
    const sideAcct = (await web3.eth.getAccounts())[0];
    const receipt1 = await web3.eth.sendTransaction({
      from: sideAcct,
      to: address,
      value: 1000,
    });
    console.log('moded', receipt1);

    const receipt2 = await sideWeb3.eth.sendTransaction({
      from: address,
      to: sideAcct,
      value: 500,
    });
    console.log('done', receipt2);
    
  })*/

  it('should have a balance of ETH in the SideBridge contract', async () => {
    const sideBridgeBalance = await sideWeb3.eth.getBalance(sideBridge.address);
    assert.isAbove(parseInt(sideBridgeBalance), 10000000000000000, 'SideBridge has insufficent ETH');
  });

  it('should have a balance of URP in the test account, but 0 ETH on the side chain', async () => {
    const urpBalance = await mainBridge.balanceOf(address);

    assert.equal(urpBalance.div(web3.utils.toBN(10 ** 18)).toNumber(), 10,
      `The test account ${address} should have a balance of 10 URP on the main chain`);

    const sideBalance = await sideWeb3.eth.getBalance(address);
    assert.equal(sideBalance, '0',
      'The test account should start with a balance of 0 on the side chain');
  });

  it('should transfer URP from the main chain to the side chain', async () => {
    const receipt = await mainBridge.deposit(TEST_TOKEN_ALLOCATION, { from: address });

    console.log('waiting for main blocks');
    await waitForBlocksElapsed(new Web3(mainChainConnection), 10);
    console.log('waiting for side blocks');
    await waitForBlocksElapsed(new Web3(sideChainConnection), 2);

    const sideBalance = await sideWeb3.eth.getBalance(address);
    assert.equal(sideBalance, TEST_TOKEN_ALLOCATION.toString(),
      'The test account should receive ETH on the sidechain');
  }).timeout(300 * 1000);

  it('should transfer side chain ETH to the main chain', async () => {

    const withdrawlGas = await sideBridge.transferMainViaRelay.estimateGas(address, 0, {
      value: TEST_TOKEN_ALLOCATION,
      from: address,
    });
    console.log('gas', withdrawlGas);
    const receipt = await sideBridge.transferMainViaRelay(address, 0, {
      value: TEST_TOKEN_ALLOCATION - 31248000,
      from: address,
      gasPrice: 2
    });
    console.log(receipt);

    const numSideBlocks = 1 + (await sideBridge.numAuthorities());
    console.log(`waiting for ${numSideBlocks} side blocks`);
    await waitForBlocksElapsed(new Web3(sideChainConnection), numSideBlocks);

    console.log('waiting for 2 main blocks');
    await waitForBlocksElapsed(new Web3(mainChainConnection), 2);

    const sideBalance = await sideWeb3.eth.getBalance(address);
    assert.equal(sideBalance, '0',
      'The test account should receive ETH on the sidechain');

    const mainBalance = await mainBridge.balanceOf(address);
    assert.equal(mainBalance.toNumber(), TEST_TOKEN_ALLOCATION);
  }).timeout(300 * 1000);
});
