const assert = require('chai').assert;
const Web3 = require('web3');
const getBridgeContracts = require('./bridgeContracts');
const { waitForBlocksElapsed } = require('./utils');

describe('Bridged chains', () => {
  let address
  let homeBridge,    homeWeb3,    rawHomeWeb3,    homeChainConnection,    homeOwner;
  let foreignBridge, foreignWeb3, rawForeignWeb3, foreignChainConnection;

  const web3 = new Web3();
  const TEST_TOKEN_ALLOCATION = web3.utils.toWei('10', 'ether');
  const TEST_ACCOUNT_ETH_FOR_FEES = web3.utils.toWei('0.01', 'ether');

  async function getHomeAccount() {
    const homeAccounts = await rawHomeWeb3.eth.getAccounts();
    for (let account of homeAccounts) {
      if ((await homeBridge.balanceOf(account)).gt(web3.utils.toBN(0))) {
        return account;
      }
    }
    return null;
  }

  before(async function() {
    this.timeout(25 * 1000);

    ({ homeBridge, foreignBridge, address, homeChainConnection, foreignChainConnection } = await getBridgeContracts());

    homeWeb3 = homeBridge.constructor.web3;
    foreignWeb3 = foreignBridge.constructor.web3;

    rawHomeWeb3 = new Web3(homeChainConnection);
    rawForeignWeb3 = new Web3(foreignChainConnection);

    const homeOwner = await getHomeAccount();
    if (!homeOwner) {
      throw new Error('Couldn\'t find home account');
    }

    const hdwalletProvider = homeBridge.constructor.currentProvider;
    homeBridge.constructor.setProvider(homeChainConnection);

    console.log(`Transfering ${web3.utils.fromWei(TEST_ACCOUNT_ETH_FOR_FEES, 'ether')} ETH and `
      + `${web3.utils.fromWei(TEST_TOKEN_ALLOCATION, 'ether')} URP from ${homeOwner} to test `
      + `account ${address}...`);
    await Promise.all([
      await homeBridge.transfer(address, TEST_TOKEN_ALLOCATION, { from: homeOwner }),
      await rawHomeWeb3.eth.sendTransaction({
        to: address,
        from: homeOwner,
        value: TEST_ACCOUNT_ETH_FOR_FEES,
      }),
    ]);

    homeBridge.constructor.setProvider(hdwalletProvider);
  });

  after(async () => {
    const tokensToReturn = await homeBridge.balanceOf(address);
    console.log(`Returning ${web3.utils.fromWei(tokensToReturn, 'ether')} URP from test account `
      + `${address} to ${homeOwner}...`);
    if (!tokensToReturn.eq(0)) {
      await homeBridge.transfer(homeOwner, tokensToReturn, { from: address });
    }

    const ethBalance = await homeWeb3.eth.getBalance(address);
    console.log(`Returning ${web3.utils.fromWei(ethBalance, 'ether')} ETH from test account `
      + `${address} to ${homeOwner}...`);
    await homeWeb3.eth.sendTransaction({
      to: homeOwner,
      from: address,
      value: ethBalance,
    });
  });

/*  it('should work on the foreign chain', async() => {
    const web3 = new Web3(foreignChainConnection);
    const foreignAcct = (await web3.eth.getAccounts())[0];
    const receipt1 = await web3.eth.sendTransaction({
      from: foreignAcct,
      to: address,
      value: 1000,
    });
    console.log('moded', receipt1);

    const receipt2 = await foreignWeb3.eth.sendTransaction({
      from: address,
      to: foreignAcct,
      value: 500,
    });
    console.log('done', receipt2);
    
  })*/

  it('should have a balance of ETH in the ForeignBridge contract', async () => {
    const foreignBridgeBalance = await foreignWeb3.eth.getBalance(foreignBridge.address);
    assert.isAbove(parseInt(foreignBridgeBalance), 10000000000000000, 'ForeignBridge has insufficent ETH');
  });

  it('should have a balance of URP in the test account, but 0 ETH on the foreign chain', async () => {
    const urpBalance = await homeBridge.balanceOf(address);

    assert.equal(urpBalance.div(web3.utils.toBN(10 ** 18)).toNumber(), 10,
      `The test account ${address} should have a balance of 10 URP on the home chain`);

    const foreignBalance = await foreignWeb3.eth.getBalance(address);
    assert.equal(foreignBalance, '0',
      'The test account should start with a balance of 0 on the foreign chain');
  });

  it('should transfer URP from the home chain to the foreign chain', async () => {
    const receipt = await homeBridge.deposit(TEST_TOKEN_ALLOCATION, { from: address });

    console.log('waiting for home blocks');
    await waitForBlocksElapsed(new Web3(homeChainConnection), 10);
    console.log('waiting for foreign blocks');
    await waitForBlocksElapsed(new Web3(foreignChainConnection), 2);

    const foreignBalance = await foreignWeb3.eth.getBalance(address);
    assert.equal(foreignBalance, TEST_TOKEN_ALLOCATION.toString(),
      'The test account should receive ETH on the sidechain');
  }).timeout(300 * 1000);

  it('should transfer foreign chain ETH to the home chain', async () => {

    const withdrawlGas = await foreignBridge.transferHomeViaRelay.estimateGas(address, 0, {
      value: TEST_TOKEN_ALLOCATION,
      from: address,
    });
    console.log('gas', withdrawlGas);
    const receipt = await foreignBridge.transferHomeViaRelay(address, 0, {
      value: TEST_TOKEN_ALLOCATION - 31248000,
      from: address,
      gasPrice: 2
    });
    console.log(receipt);

    const numForeignBlocks = 1 + (await foreignBridge.numAuthorities());
    console.log(`waiting for ${numForeignBlocks} foreign blocks`);
    await waitForBlocksElapsed(new Web3(foreignChainConnection), numForeignBlocks);

    console.log('waiting for 2 home blocks');
    await waitForBlocksElapsed(new Web3(homeChainConnection), 2);

    const foreignBalance = await foreignWeb3.eth.getBalance(address);
    assert.equal(foreignBalance, '0',
      'The test account should receive ETH on the sidechain');

    const homeBalance = await homeBridge.balanceOf(address);
    assert.equal(homeBalance.toNumber(), TEST_TOKEN_ALLOCATION);
  }).timeout(300 * 1000);
});
