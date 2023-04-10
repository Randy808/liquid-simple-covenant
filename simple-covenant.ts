"use strict";

import ElementsClient from "./elements-client";
import { IssueAssetResponse } from "./elements-client/module";

let ecpair = require("ecpair");
let { ECPairFactory } = ecpair;
let ecc = require("tiny-secp256k1");
let liquidjs = require("liquidjs-lib");
let bip341 = liquidjs.bip341;
let { amountWithPrecisionToSatoshis } = liquidjs.issuance;
let ECPair = ECPairFactory(ecc);
let regtest = liquidjs.networks.regtest;
const LBTC_ASSET_ID = regtest.assetHash;

// Unspendable pubkey described in https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
// Using this exact value reduces privacy
const unspendablePubkey =
  "0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

let privateKeyBuffer = Buffer.from(
  "968f91395a8d682e5e3dd4a4f19465f1d9122cbbe82a5a624d863c39513a4eed",
  "hex"
);
let keypair = ECPair.fromPrivateKey(privateKeyBuffer);

const { address } = liquidjs.payments.p2wpkh({
  network: regtest,
  pubkey: keypair.publicKey,
});

async function spendToCovenant(
  assetId,
  testAddress,
  lbtcTxIdSource,
  lbtcIndex,
  assetTxId,
  assetIndex,
  lbtcAmount,
  assetAmount,
  rpcClient
) {
  let enforceCovenant =
    "OP_0 OP_INSPECTINPUTSCRIPTPUBKEY OP_DROP OP_0 OP_INSPECTOUTPUTSCRIPTPUBKEY OP_DROP OP_EQUAL";
  const script = `${enforceCovenant}`.trim();

  const leaves = [
    {
      scriptHex: liquidjs.script.fromASM(script).toString("hex"),
    },
  ];

  let treeRoot = bip341.toHashTree(leaves);

  const bip341Factory = bip341.BIP341Factory(ecc);
  const output = bip341Factory.taprootOutputScript(
    Buffer.from(unspendablePubkey, "hex"),
    treeRoot
  );

  const p2trAddress = liquidjs.address.fromOutputScript(output, regtest);

  let assetUtxo0 = liquidjs.address.toOutputScript(testAddress);

  const nonce = Buffer.from("00", "hex");

  const assetBuffer = Buffer.concat([
    Buffer.from("01", "hex"),
    Buffer.from(assetId, "hex").reverse(),
  ]);

  const lbtcBuffer = Buffer.concat([
    Buffer.from("01", "hex"),
    Buffer.from(LBTC_ASSET_ID, "hex").reverse(),
  ]);

  let lbtcScript = liquidjs.address.toOutputScript(testAddress);

  let pset = new liquidjs.Psbt({ network: regtest });
  pset
    .addInput({
      hash: assetTxId,
      index: assetIndex,
      witnessUtxo: {
        asset: assetBuffer,
        script: assetUtxo0,
        value: liquidjs.confidential.satoshiToConfidentialValue(
          amountWithPrecisionToSatoshis(assetAmount)
        ),
        nonce,
      },
    })
    .addInput({
      hash: lbtcTxIdSource,
      index: lbtcIndex,
      witnessUtxo: {
        asset: lbtcBuffer,
        script: lbtcScript,
        value: liquidjs.confidential.satoshiToConfidentialValue(
          amountWithPrecisionToSatoshis(lbtcAmount)
        ),
        nonce,
      },
    })
    //output
    .addOutput({
      asset: assetBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(
        amountWithPrecisionToSatoshis(assetAmount)
      ),
      address: p2trAddress,
      nonce,
    })
    //change
    .addOutput({
      asset: lbtcBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(
        amountWithPrecisionToSatoshis(lbtcAmount) - 500
      ),
      address: address,
      nonce,
    })
    //fee
    .addOutput({
      nonce,
      asset: lbtcBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(500),
      script: Buffer.alloc(0),
    });

  pset.signInput(0, keypair);
  pset.signInput(1, keypair);
  pset.finalizeAllInputs();
  let tx = pset.extractTransaction().toHex();
  console.log("\n\nTransaction Hex:\n");
  console.log(tx);
  console.log("\n\n");
  return rpcClient.request(`sendrawtransaction`, [tx]);
}

async function spendFromCovenant(
  assetId,
  testAddress,
  assetScriptPubKey,
  lbtcTxIdSource,
  lbtcIndex,
  assetTxId,
  assetIndex,
  lbtcAmount,
  assetAmount,
  rpcClient
) {
  let enforceCovenant =
    "OP_0 OP_INSPECTINPUTSCRIPTPUBKEY OP_DROP OP_0 OP_INSPECTOUTPUTSCRIPTPUBKEY OP_DROP OP_EQUAL";
  const script = `${enforceCovenant}`.trim();

  const leaves = [
    {
      scriptHex: liquidjs.script.fromASM(script).toString("hex"),
    },
  ];

  const leaf = leaves[0];

  const leafHash = bip341.tapLeafHash(leaf);

  const hashTree = bip341.toHashTree(leaves);
  const pathToLeaf = bip341.findScriptPath(hashTree, leafHash);
  const bip341Factory = bip341.BIP341Factory(ecc);
  const taprootStack = bip341Factory.taprootSignScriptStack(
    Buffer.from(unspendablePubkey, "hex"),
    leaf,
    hashTree.hash,
    pathToLeaf
  );

  let treeRoot = bip341.toHashTree(leaves);

  const output = bip341Factory.taprootOutputScript(
    Buffer.from(unspendablePubkey, "hex"),
    treeRoot
  );

  const p2trAddress = liquidjs.address.fromOutputScript(output, regtest);

  let assetUtxo0 = Buffer.from(assetScriptPubKey, "hex");

  const nonce = Buffer.from("00", "hex");

  const assetBuffer = Buffer.concat([
    Buffer.from("01", "hex"),
    Buffer.from(assetId, "hex").reverse(),
  ]);

  const lbtcBuffer = Buffer.concat([
    Buffer.from("01", "hex"),
    Buffer.from(LBTC_ASSET_ID, "hex").reverse(),
  ]);

  let lbtcScript = liquidjs.address.toOutputScript(testAddress);
  let pset = new liquidjs.Psbt({ network: regtest });
  pset
    .addInput({
      hash: assetTxId,
      index: assetIndex,
      witnessScript: liquidjs.script.fromASM(script),
      witnessUtxo: {
        asset: assetBuffer,
        script: assetUtxo0,
        value: liquidjs.confidential.satoshiToConfidentialValue(
          amountWithPrecisionToSatoshis(assetAmount)
        ),
        nonce,
      },
    })
    .addInput({
      hash: lbtcTxIdSource,
      index: lbtcIndex,
      witnessUtxo: {
        asset: lbtcBuffer,
        script: lbtcScript,
        value: liquidjs.confidential.satoshiToConfidentialValue(lbtcAmount),
        nonce,
      },
    })
    .addOutput({
      asset: assetBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(
        amountWithPrecisionToSatoshis(assetAmount)
      ),
      address: p2trAddress,
      nonce,
    })
    .addOutput({
      asset: lbtcBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(lbtcAmount - 500),
      address: address,
      nonce,
    })
    .addOutput({
      nonce,
      asset: lbtcBuffer,
      value: liquidjs.confidential.satoshiToConfidentialValue(500),
      script: Buffer.alloc(0),
    });

  pset.signInput(1, keypair);
  pset.finalizeInput(1);

  pset.updateInput(0, {
    finalScriptWitness: liquidjs.witnessStackToScriptWitness([...taprootStack]),
  });

  let tx = pset.extractTransaction().toHex();
  console.log("\n\nTransaction Hex:\n\n");
  console.log(tx);
  console.log("\n\n");
  console.log("Try broadcast final tx:\n\n");
  return rpcClient.request(`sendrawtransaction`, [tx]);
}

let getOutputForAssetId = (tx, assetId) => {
  let { vout } = tx;
  for (let i = 0; i < vout.length; i++) {
    if (vout[i].asset == assetId && vout[i].scriptPubKey.asm) {
      return i;
    }
  }

  return -1;
};

async function run() {
  let elementsClient = new ElementsClient();

  let balance = await elementsClient.getBalance();
  console.log(`LBTC Balance: ${balance.bitcoin}\n\n`);

  /************************/

  console.log("Issuing new asset...");
  const amount = 10;
  const reissuanceTokenAmount = 1;
  let issueAssetResponse: IssueAssetResponse = await elementsClient.issueAsset(
    amount,
    reissuanceTokenAmount
  );
  console.log(`issueasset result: ${JSON.stringify(issueAssetResponse)}\n\n`);

  /************************/

  console.log("Sending new asset to test address...");
  const lbtcAmount = 10;
  const testAddress = "ert1qrpxstycc2desapdg3xzcd6vmgmzym749s577v7";

  let sendAssetTxId = await elementsClient.sendToAddress(
    testAddress,
    amount,
    issueAssetResponse.asset
  );
  await elementsClient.sendToAddress(
    testAddress,
    reissuanceTokenAmount,
    issueAssetResponse.token
  );
  console.log(
    `sendtoaddress (${issueAssetResponse.asset}) result: ${sendAssetTxId}\n\n`
  );

  /************************/

  console.log("Sending LBTC to test address...");
  let testAddressLbtcFundingTxId = await elementsClient.sendToAddress(
    testAddress,
    lbtcAmount
  );
  console.log(`sendToAddress (BTC) result: ${testAddressLbtcFundingTxId}\n\n`);

  /************************/

  console.log("Determining which output index holds LBTC...");
  let testAddressLbtcFundingTransaction =
    await elementsClient.getRawTransaction(testAddressLbtcFundingTxId, true);

  let lbtcFaucetVout = getOutputForAssetId(
    testAddressLbtcFundingTransaction,
    LBTC_ASSET_ID
  );

  /************************/

  console.log(
    `Determining which output index holds ${issueAssetResponse.asset}...`
  );
  let testAddressAssetFundingTransaction =
    await elementsClient.getRawTransaction(sendAssetTxId, true);

  let assetFaucetVout = getOutputForAssetId(
    testAddressAssetFundingTransaction,
    issueAssetResponse.asset
  );

  /************************/

  console.log(`Spending to covenant...`);

  let resp = await spendToCovenant(
    issueAssetResponse.asset,
    testAddress,
    testAddressLbtcFundingTxId,
    lbtcFaucetVout,
    sendAssetTxId,
    assetFaucetVout,
    lbtcAmount,
    amount,
    elementsClient.getRawClient()
  );

  console.log("TXID:", resp);
  console.log("FINISHED\n");

  /************************/

  console.log(
    `Determining which output index from the covenant spend transaction holds LBTC...`
  );
  let spendToCovenantTx = await elementsClient.getRawTransaction(resp, true);
  let lbtcVout = getOutputForAssetId(spendToCovenantTx, LBTC_ASSET_ID);
  let assetVout = getOutputForAssetId(
    spendToCovenantTx,
    issueAssetResponse.asset
  );

  /************************/

  console.log(`Spending from covenant...`);

  let spendFromCovenantTx = await spendFromCovenant(
    issueAssetResponse.asset,
    testAddress,
    spendToCovenantTx.vout[assetVout].scriptPubKey.hex,
    resp,
    lbtcVout,
    resp,
    assetVout,
    999999500,
    10,
    elementsClient.getRawClient()
  );

  console.log("Final transaction id:", spendFromCovenantTx);
}

run();
