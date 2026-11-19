const fs = require('node:fs');
const crypto = require('node:crypto');
const {createRequire} = require('node:module');
const path = require('node:path');

const chain = JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/chain.json')));
const endpoints = ['https://api.drand.sh/','https://api2.drand.sh/'];
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))
  : value;
const encode = value => JSON.stringify(canonical(value));
const digest = value => crypto.createHash('sha256').update(value).digest();

function verifyBeacon(beacon) {
  if (!Number.isSafeInteger(beacon.round) || beacon.round<1
    || !/^[0-9a-f]{96}$/.test(beacon.signature)
    || digest(Buffer.from(beacon.signature,'hex')).toString('hex')!==beacon.randomness) throw Error('Invalid beacon');
  const sdkRequire=createRequire(process.env.GENLAYER_CLI_PATH || path.resolve('node_modules/genlayer/dist/index.js'));
  const bls=sdkRequire('@noble/curves/bls12-381').bls12_381;
  const round=Buffer.alloc(8);
  round.writeBigUInt64BE(BigInt(beacon.round));
  const point=bls.G1.hashToCurve(digest(round),{DST:'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_'});
  const signature=bls.G1.ProjectivePoint.fromHex(beacon.signature);
  const key=bls.G2.ProjectivePoint.fromHex(chain.public_key);
  signature.assertValidity();
  key.assertValidity();
  if(signature.equals(bls.G1.ProjectivePoint.ZERO) || key.equals(bls.G2.ProjectivePoint.ZERO)
    || !bls.fields.Fp12.eql(bls.pairing(signature,bls.G2.ProjectivePoint.BASE),bls.pairing(point,key))) {
    throw Error('drand BLS signature verification failed');
  }
}

function partitions(domains, history) {
  let best=Infinity;
  const masks=[];
  for(let mask=0;mask<(1<<domains.length);mask++){
    if(mask.toString(2).replaceAll('0','').length!==Math.ceil(domains.length/2))continue;
    let cost=0,valid=true;
    for(let left=0;left<domains.length;left++){
      for(let right=left+1;right<domains.length;right++){
        if(Boolean(mask&(1<<left))===Boolean(mask&(1<<right))){
          if(domains[left]===domains[right])valid=false;
          cost+=history[left+'-'+right]||0;
        }
      }
    }
    if(!valid || cost>best)continue;
    if(cost<best){best=cost;masks.length=0;}
    masks.push(mask);
  }
  return {cost:Number.isFinite(best)?best:null,masks};
}

function expectedDraw(state,beacon,contract) {
  verifyBeacon(beacon);
  const options=partitions(state.domains,state.pairings);
  const context=encode({contract:contract.toLowerCase(),round:state.rounds+1,
    roster:state.members.map((wallet,index)=>[wallet,state.domains[index]]),history:state.pairings});
  const seed=Buffer.concat([Buffer.from('PodDraw/v1\0'+context+'\0'),Buffer.from(beacon.randomness,'hex')]);
  const count=BigInt(options.masks.length);
  const cutoff=(1n<<256n)-((1n<<256n)%count);
  for(let counter=0;counter<64;counter++){
    const suffix=Buffer.alloc(4);suffix.writeUInt32BE(counter);
    const value=BigInt('0x'+digest(Buffer.concat([seed,suffix])).toString('hex'));
    if(value>=cutoff)continue;
    const index=Number(value%count),mask=options.masks[index];
    return {round:state.rounds+1,target:state.target,sealed_at:state.sealed_at,beacon,
      chain_hash:chain.hash,context,eligible_masks:options.masks,minimum_repeat_cost:options.cost,index,counter,
      pods:[true,false].map(side=>state.members.map((_,index)=>index).filter(index=>Boolean(mask&(1<<index))===side))};
  }
  throw Error('Rejection sampler exhausted');
}

module.exports={chain,endpoints,encode,verifyBeacon,partitions,expectedDraw};
