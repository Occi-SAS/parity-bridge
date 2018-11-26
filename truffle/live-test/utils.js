const DEV_NET_ID = 17;
const DEV_NET_ACCOUNT = '0x00a329c0648769A73afAc7F9381E08FB43dBEA72';

function waitForBlocksElapsed(web3, numBlocks) {
  return new Promise(async (resolve, reject) => {
    const startingBlock = await web3.eth.getBlockNumber();

    const subscription = web3.eth.subscribe('newBlockHeaders', (err, blockHeader) => {
      if (err) { return reject(err) }
      if ((blockHeader.number - startingBlock) >= numBlocks) {
        subscription.unsubscribe();
        resolve(blockHeader);
      }
    });

    // If we're on a dev chain, blocks are only generated upon new transactions.
    // We'll generate a bunch of throwaway transactions to create new blocks
    if (await web3.eth.net.getId() == DEV_NET_ID
        && (await web3.eth.getAccounts()).indexOf(DEV_NET_ACCOUNT) !== -1) {
      console.log(`Detected dev chain, generating ${numBlocks} transactions`);
      for (let i = 0; i < numBlocks; i++) {
        await web3.eth.personal.sendTransaction({
          to: '0x0000000000000000000000000000000000000000',
          from: DEV_NET_ACCOUNT,
          value: 1
        }, '');
      }
    }
  });
}
module.exports.waitForBlocksElapsed = waitForBlocksElapsed;
