"use strict";

const co = require('co');
const util     = require('util');
const stream   = require('stream');
const Peer     = require('../entity/peer');
const constants = require('../constants');

module.exports = function (PeeringService, dal) {
  return new Router(PeeringService, dal);
};

function Router (PeeringService, dal) {
  
  this.setConfDAL = (theDAL) => {
    dal = theDAL;
  };

  const logger   = require('../logger')('router');

  stream.Transform.call(this, { objectMode: true });

  let active = true;

  this.setActive = (shouldBeActive) => active = shouldBeActive;

  const that = this;

  this._write = function (obj, enc, done) {
    return co(function*() {
      try {
        if (obj.joiners) {
          yield route('block', obj, getRandomInUPPeers(obj.issuer === PeeringService.pubkey));
        }
        else if (obj.revocation) {
          yield route('revocation', obj, getRandomInUPPeers(obj.pubkey === PeeringService.pubkey));
        }
        else if (obj.pubkey && obj.uid) {
          yield route('identity', obj, getRandomInUPPeers(obj.pubkey === PeeringService.pubkey));
        }
        else if (obj.idty_uid) {
          yield route('cert', obj, getRandomInUPPeers(obj.pubkey === PeeringService.pubkey));
        }
        else if (obj.userid) {
          yield route('membership', obj, getRandomInUPPeers(obj.issuer === PeeringService.pubkey));
        }
        else if (obj.inputs) {
          yield route('transaction', obj, getRandomInUPPeers(obj.issuers.indexOf(PeeringService.pubkey) !== -1));
        }
        else if (obj.endpoints) {
          yield route('peer', obj, getRandomInUPPeers(obj.pubkey === PeeringService.pubkey));
        }
        else if (obj.from && obj.from == PeeringService.pubkey) {
          // Route ONLY status emitted by this node
          yield route('status', obj, getTargeted(obj.to || obj.idty_issuer));
        }
        else if (obj.unreachable) {
          yield dal.setPeerDown(obj.peer.pubkey);
          logger.info("Peer %s unreachable: now considered as DOWN.", obj.peer.pubkey);
        }
        else if (obj.outdated) {
          yield PeeringService.handleNewerPeer(obj.peer);
        }
      } catch (e) {
        if (e && e.uerr && e.uerr.ucode == constants.ERRORS.NEWER_PEER_DOCUMENT_AVAILABLE.uerr.ucode) {
          logger.info('Newer peer document available on the network for local node');
        } else {
          logger.error("Routing error: %s", e && (e.stack || e.message || (e.uerr && e.uerr.message) || e));
        }
      }
      done && done();
    });
  };

  function route (type, obj, getPeersFunc) {
    return co(function*() {
      if (!active) return;
      const peers = yield getPeersFunc();
      that.push({
        'type': type,
        'obj': obj,
        'peers': (peers || []).map(Peer.statics.peerize)
      });
    });
  }

  function getRandomInUPPeers (isSelfDocument) {
    return getValidUpPeers([PeeringService.pubkey], isSelfDocument);
  }

  function getValidUpPeers (without, isSelfDocument) {
    return function () {
      return co(function *() {
        let members = [];
        let nonmembers = [];
        let peers = yield dal.getRandomlyUPsWithout(without); // Peers with status UP
        for (const p of peers) {
          let isMember = yield dal.isMember(p.pubkey);
          isMember ? members.push(p) : nonmembers.push(p);
        }
        members = chooseXin(members, isSelfDocument ? constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_MEMBERS_TO_FORWARD_TO);
        nonmembers = chooseXin(nonmembers,  isSelfDocument ? constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO_FOR_SELF_DOCUMENTS : constants.NETWORK.MAX_NON_MEMBERS_TO_FORWARD_TO);
        let mainRoutes = members.map((p) => (p.member = true) && p).concat(nonmembers);
        let mirrors = yield PeeringService.mirrorEndpoints();
        return mainRoutes.concat(mirrors.map((mep, index) => { return {
          pubkey: 'M' + index + '_' + PeeringService.pubkey,
          endpoints: [mep]
        }}));
      });
    };
  }

  /**
  * Get the peer targeted by `to` argument, this node excluded (for not to loop on self).
  */
  function getTargeted (to) {
    return function () {
      return co(function*() {
        if (to == PeeringService.pubkey) {
          return [];
        }
        const peer = yield dal.getPeer(to);
        return [peer];
      });
    };
  }

  function chooseXin (peers, max) {
    const chosen = [];
    const nbPeers = peers.length;
    for (let i = 0; i < Math.min(nbPeers, max); i++) {
      const randIndex = Math.max(Math.floor(Math.random() * 10) - (10 - nbPeers) - i, 0);
      chosen.push(peers[randIndex]);
      peers.splice(randIndex, 1);
    }
    return chosen;
  }
}

util.inherits(Router, stream.Transform);
