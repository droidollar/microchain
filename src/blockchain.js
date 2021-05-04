import Block from "./block.js";
import UTXOPool from "./utxopool.js";
import { EventEmitter } from "events";
import { unfold, reverse, values, forEach } from "ramda";
import Config from "./config.js";
import { Transaction } from "./index.js";

export default class Blockchain extends EventEmitter {
  static _instance;

  onBlockAdded = (callback) => {};

  onBlockchainLoaded = (callback) => {};

  static init(conf, blocks = null) {
    if (!Blockchain._instance) {
      Blockchain._instance = new Blockchain(conf);
      Blockchain.getInstance().chain = [];
      Blockchain._instance.ready = false;

      //Create geneis block
      if (!blocks) {
        const genesisBlock = new Block({
          ...conf.GENESIS_BLOCK,
          height: 0,
        });

        genesisBlock.mine();
        Blockchain.getInstance().addBlock(genesisBlock);
      } else {
        const blocksSorted = blocks.sort(Blockchain._sortBlocksByHeight);
        for (let block of blocksSorted) {
          const blockInstance = new Block(block);
          Blockchain.getInstance().addBlock(blockInstance);
        }
      }
      Blockchain.getInstance().ready = true;
    } else if (conf) {
      console.warn(
        "Config wont be use, you already have an instance of the chain running."
      );
    }
    return Blockchain._instance;
  }

  static getInstance() {
    if (!Blockchain._instance) {
      console.warn(
        "Hey! there is no Blockchain instance running... are you sure you have call init?"
      );
      return null;
    }
    return Blockchain._instance;
  }

  constructor(conf) {
    super();
    this.chain = [];
    this._conf = new Config(conf);
    this.utxoPool = new UTXOPool();
    return this;
  }

  get config() {
    if (!this._conf) {
      this._conf = new Config();
    }
    return this._conf;
  }

  get configHash() {
    if (!this._conf) {
      this._conf = new Config();
    }
    return this._conf.BLOCK_HASH_METHOD(JSON.stringify(this._conf)).toString();
  }

  get lastBlock() {
    //console.log(this);
    if (this.chain.length === 0) return null;
    return this.chain[this.chain.length - 1];
  }

  get longestBlockchain() {
    if (!this.chain || this.chain.length === 0) return [];
    const blocksDict = values(this.chain);
    this.chain.forEach((block) => (blocksDict[block.hash] = block));
    const getParent = (x) => {
      if (x === undefined) {
        return false;
      }
      return [x, blocksDict[x.prevHash]];
    };

    return reverse(unfold(getParent, this.lastBlock));
  }

  getBlockForHeight(height) {
    const longuestBlockchain = this.longestBlockchain;
    const blockOld = longuestBlockchain.find(
      (block) => block.height === height
    );

    return blockOld;
  }

  getDifficultyForBlock(blockNew) {
    const longuestBlockchain = this.longestBlockchain;

    // Add the block -1 to get the distance between 2 blocks because the distance
    // of time between this block and the block currently mined is not a constant
    // => It's mean than the difficulty can change during the block mining
    const blockBefore = longuestBlockchain.find(
      (block) => block.height === blockNew.height - 1
    );
    const blockOld = longuestBlockchain.find(
      (block) =>
        block.height ===
        blockNew.height - this.config.BLOCK_HASH_RATE_AVERAGE - 1
    );

    // When you cannot compare difficulty because not enought blocks
    if (!blockBefore || !blockOld) {
      return this.config.BLOCK_MIN_DIFFICULTY;
    }
    const delta =
      (blockBefore.ts - blockOld.ts) / this.config.BLOCK_HASH_RATE_AVERAGE;
    const expectedDelta =
      (24 * 60 * 60 * 1000) / this.config.BLOCK_HASH_RATE_BY_DAY;

    const rateDetla = delta / expectedDelta;
    // console.log(delta, expectedDelta, rateDetla);

    const previousBlock = this.getBlockForHeight(blockNew.height - 1);

    // Create a margin for difficulty increase or decrease
    const errorMargin = 0.25;
    let finalDiff = previousBlock.difficulty;
    if (rateDetla < 1 - errorMargin) {
      finalDiff++;
    } else if (rateDetla > 1 + errorMargin) {
      finalDiff--;
    }

    // console.log("Difficulty final", finalDiff);
    if (finalDiff < this.config.BLOCK_MIN_DIFFICULTY)
      finalDiff = this.config.BLOCK_MIN_DIFFICULTY;
    if (finalDiff > this.config.BLOCK_MAX_DIFFICULTY)
      finalDiff = this.config.BLOCK_MAX_DIFFICULTY;

    return finalDiff;
  }

  getParent(prevHash) {
    const parentBlock = this.chain.find((b) => b.hash === prevHash);
    return parentBlock;
  }

  addBlock(block) {
    /*console.log("--------------");
    console.log(
      `Block ${block.height} #${block.hash} need difficulty ${block.difficulty}`
    );
    console.log(block);*/

    if (!block.isValid()) {
      console.error(`Block ${block.height} is not valid`);
      return false;
    }

    // Test if the block is valid in reguard of the last block
    const parentBlock = this.getParent(block.prevHash);

    if (!parentBlock && block.height !== 0) {
      console.error(`Block ${block.height} has no parent!`);
      return false;
    }

    if (
      parentBlock &&
      (parentBlock.height - 1 == block.height || parentBlock.ts >= block.ts)
    ) {
      console.error(
        `addBlock(block) Block ${block.height} is not coherent with the chain`
      );
      return false;
    }

    const txs = block.getTransactions();
    for (let tx of txs) {
      if (!this.utxoPool.isTXValid(new Transaction(tx))) {
        console.error(`💳 Block ${block.height} has an invalid transaction`);
        return false;
      }
    }

    // The block is valid we add it to the chain!
    this.utxoPool.addBlock(block);
    this.chain.push(block);
    console.log(`🥞 Block ${block.height} has been added`);
    // We purge the block when and the chain
    this.purgeChain();
    if (Blockchain.getInstance().ready) this.emit("blockAdded", block);

    return true;
  }

  purgeChain() {
    this.chain.forEach((block) => {
      block.purgeTX();
    });
  }

  getDiagnostic() {
    for (const block of this.longestBlockchain) {
      if (!block.isValid()) {
        console.error(`💣 Block ${block.height} invalid`);
      }

      const txs = block.getTransactions();
      let allTxValid = true;
      for (let tx of txs) {
        if (!this.utxoPool.isTXValid(new Transaction(tx))) {
          console.error(
            `🧨 Block ${block.height} has an invalid transaction(s)`
          );
          allTxValid = false;
          return false;
        }
      }
      console.log(
        `🍭 Block ${block.height} valid on ${this.longestBlockchain.length} blocks`
      );
    }
  }

  getTransactionCost(tx) {
    if (tx.contentSizeKo) return this.config.MONEY_BY_KO * tx.contentSizeKo;
    return 0;
  }

  enoughtMoneyFrom(tx, publicKey) {
    const cost = this.getTransactionCost(tx);
    const money = this.utxoPool.getMoneyForSender(publicKey);
    console.log(`cost: ${cost} V. money you have: ${money}`);
    return cost <= money;
  }

  logBlockchain() {
    console.log(this.chain);
  }

  logBlockchainSize() {
    console.log(
      `Blockchain size is ${JSON.stringify(this.chain).length / 1000} Ko`
    );
  }

  logUTXO() {
    this.utxoPool.log();
  }

  static _sortBlocksByHeight(b1, b2) {
    if (b1.height < b2.height) {
      return -1;
    }
    if (b1.height < b2.height) {
      return 1;
    }
    return 0;
  }
}
