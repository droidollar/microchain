# Microchain 💴

_Microchain_ is a Javascript lib for creating small blockchain on Node JS & Web client.

:warning: **This lib is not secure**: it is a project in progress! See contact for more informations.

## Installation

```bash
npm i @asalvatore/microchain
```

## Usage

Create and add a block to the chain instance

```javascript
const walletSato = new Wallet();

// Get the instance of the chain. Also pass the config of it, with fees and if TX content are fungible or not.
const chain = Chain.getInstance({ CONTENT_FUNGIBLE: false });

// Create and sign a transaction
const transaction1 = walletSato.createTransaction({
  sender: walletSato.publicKey,
  content: "https://pbs.twimg.com/media/EwxqyQdXMAAlqIb?format=jpg&name=medium",
});
const block1 = new Block({
  height: chain.lastBlock.height + 1,
  publisher: walletSato.publicKey,
  prevHash: chain.lastBlock.hash,
  transactions: JSON.stringify([transaction1]),
});

//Sign the block with the miner wallet
block1.sign(walletSato);

// Launch the mining process
block1.mine();

// After mining we add the block to the chain
chain.addBlock(block1);

// We log to see if all was added to the chain
chain.logChain();
chain.logUTXO();
```

## To Do

- create an hash list for transactions to avoid re-spending.
- re-initiate the UTXOPool with the longuest chain after each block add.
- think about the logic of content spending. I am thinking about about a config object to pass to the chain with blocks and trasnactions being _fungible_ or not
- manage block and transaction announce with webRTC?

## Author

You can contact me on Twitter:
[@salvator_io](https://twitter.com/salvator_io)
