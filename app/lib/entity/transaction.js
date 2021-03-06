"use strict";
let _ = require('underscore');
let rawer = require('duniter-common').rawer;
let hashf = require('duniter-common').hashf;

let Transaction = function(obj, currency) {

  let json = obj || {};

  this.locktime = 0;
  this.inputs = [];
  this.unlocks = [];
  this.outputs = [];
  this.issuers = [];

  _(json).keys().forEach((key) => {
    this[key] = json[key];
  });

  // Store the maximum output base
  this.output_amount = this.outputs.reduce((sum, output) => sum + parseInt((output.raw || output).split(':')[0]), 0);
  this.output_base = this.outputs.reduce((maxBase, output) => Math.max(maxBase, parseInt((output.raw || output).split(':')[1])), 0);

  this.currency = currency || this.currency;

  this.json = () => {
    return {
      'version': parseInt(this.version, 10),
      'currency': this.currency,
      'issuers': this.issuers,
      'inputs': this.inputs,
      'unlocks': this.unlocks,
      'outputs': this.outputs,
      'comment': this.comment,
      'locktime': this.locktime,
      'blockstamp': this.blockstamp,
      'blockstampTime': this.blockstampTime,
      'signatures': this.signatures,
      'raw': this.getRaw(),
      'hash': this.hash
    };
  };

  this.getTransaction = () => {
    const tx = {};
    tx.hash = this.hash;
    tx.version = this.version;
    tx.currency = this.currency;
    tx.issuers = this.issuers;
    tx.signatures = this.signatures;
    // Inputs
    tx.inputs = [];
    this.inputs.forEach((input) => {
      const sp = input.split(':');
      tx.inputs.push({
        amount:     sp[0],
        base:       sp[1],
        type:       sp[2],
        identifier: sp[3],
        pos:        parseInt(sp[4]),
        raw: input
      });
    });
    // Unlocks
    tx.unlocks = this.unlocks;
    // Outputs
    tx.outputs = [];
    this.outputs.forEach(function (output) {
      tx.outputs.push(Transaction.statics.outputStr2Obj(output));
    });
    tx.comment = this.comment;
    tx.blockstamp = this.blockstamp;
    tx.blockstampTime = this.blockstampTime;
    tx.locktime = this.locktime;
    return tx;
  };

  this.getRaw = () => rawer.getTransaction(this);

  this.getHash = (recompute) => {
    if (recompute || !this.hash) {
      this.hash = hashf(rawer.getTransaction(this)).toUpperCase();
    }
    return this.hash;
  };

  this.computeAllHashes = () => {
    this.hash = hashf(rawer.getTransaction(this)).toUpperCase();
  };

  this.compact = () => rawer.getCompactTransaction(this);

  this.hash = this.hash || hashf(this.getRaw()).toUpperCase();
};

Transaction.statics = {};

Transaction.statics.fromJSON = (json) => new Transaction(json);

Transaction.statics.outputs2recipients = (tx) => tx.outputs.map(function(out) {
  const recipent = (out.raw || out).match('SIG\\((.*)\\)');
  return (recipent && recipent[1]) || 'UNKNOWN';
});

Transaction.statics.outputStr2Obj = (outputStr) => {
  const sp = outputStr.split(':');
  return {
    amount: parseInt(sp[0]),
    base: parseInt(sp[1]),
    conditions: sp[2],
    raw: outputStr
  };
};

Transaction.statics.outputObj2Str = (o) => [o.amount, o.base, o.conditions].join(':')

Transaction.statics.setRecipients = (txs) => {
  // Each transaction must have a good "recipients" field for future searchs
  txs.forEach((tx) => tx.recipients = Transaction.statics.outputs2recipients(tx));
};

Transaction.statics.cleanSignatories = (txs) => {
  // Remove unused signatories - see https://github.com/duniter/duniter/issues/494
  txs.forEach((tx) => {
    if (tx.signatories) {
      delete tx.signatories;
    }
    return tx;
  });
};

Transaction.statics.getLen = (tx) => 2 // header + blockstamp
  + tx.issuers.length * 2 // issuers + signatures
  + tx.inputs.length * 2 // inputs + unlocks
  + (tx.comment ? 1 : 0)
  + tx.outputs.length;

module.exports = Transaction;
