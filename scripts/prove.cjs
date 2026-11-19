const fs = require('node:fs');
const path = require('node:path');
const {assert,equal,sourceHash,invoke,read,rpc,receipt,receiptSummary,save,delay} = require('./transport.cjs');
const {decodeReceipt} = require('./receipt-calldata.cjs');
const {chain,endpoints,verifyBeacon,expectedDraw} = require('./reference.cjs');

async function get(url) {
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
      assert(response.ok,'Beacon HTTP '+response.status);
      return await response.json();
    }catch(error){if(attempt===3)throw error;await delay(4000);}
  }
}

async function main() {
  const stage=process.argv[2];
  const wallets=JSON.parse(process.env.POD_ACCOUNTS||'[]');
  assert(wallets.length===7 && new Set(wallets.map(wallet=>wallet.address)).size===7,'Seven signing wallets required');
  assert(await rpc('eth_chainId',[])==='0xf22f','StudioNet only');
  const code=fs.readFileSync('contracts/pod_draw.py');
  let report;
  const progress=path.join('proofs','progress.json');
  if(fs.existsSync(progress)){
    report=JSON.parse(fs.readFileSync(progress));
    assert(report.source_sha256===sourceHash,'Progress source differs');
  }
  const domains=['a','a','b','b','c','c'];
  const members=wallets.slice(0,6).map(wallet=>wallet.address);
  let expected=report?.state || {members,domains,approvals:[false,false,false,false,false,false],
    pairings:Object.fromEntries(members.flatMap((_,a)=>members.slice(a+1).map((__,offset)=>[a+'-'+(a+1+offset),0]))),
    rounds:0,phase:'OPEN',target:0,sealed_at:0,target_time:0};

  async function verify(label,raw,actor,calldata,error){
    const from=(raw.from_address||raw.sender).toLowerCase();
    assert(from===wallets[actor].address && (raw.to_address||raw.recipient).toLowerCase()===report.contract.toLowerCase(),
      'Wrong signer or contract');
    assert(equal(await decodeReceipt(raw),calldata),'Wrong actual signed calldata');
    if(error){
      const payload=Buffer.from(raw.consensus_data.leader_receipt[0].result,'base64');
      assert(payload[0]===1 && payload.subarray(1).toString()===error,'Wrong failure reason');
    }
    const state=await read(label+'-state',['call',report.contract,'state']);
    assert(equal(state,expected),'Observed state differs from independent transition');
    if(error)assert(equal(state,report.state),'Rejected call mutated state');
    const results=[];
    for(let index=1;index<=state.rounds;index++){
      const result=await read(label+'-result-'+index,['call',report.contract,'result','--args',String(index)]);
      assert(equal(result,report.results[index-1]),'Earlier result changed');
      results.push(result);
    }
    report.trace.push({label,...receiptSummary(raw),signer:from,calldata,error:error||null,state,results});
    report.state=state;
    save('progress',report);
    console.log('VERIFIED',label,'rounds',state.rounds,'phase',state.phase);
  }

  async function call(label,actor,method,args=[],error){
    process.env.POD_ACCOUNT=wallets[actor].name;
    const hash=await invoke(label,['write',report.contract,method,...(args.length?['--args',...args.map(String)]:[])]);
    const raw=await receipt(label,hash,!error);
    if(!error){
      if(method==='approve')expected={...expected,approvals:expected.approvals.map((value,index)=>index===actor?true:value)};
      if(method==='withdraw')expected={...expected,approvals:expected.approvals.map((value,index)=>index===actor?false:value)};
      if(method==='seal'){
        const actual=await read(label+'-locked',['call',report.contract,'state']);
        assert(actual.target===Math.ceil((actual.sealed_at+120-chain.genesis_time)/chain.period)+1
          && actual.target_time===chain.genesis_time+(actual.target-1)*chain.period
          && actual.target_time>=actual.sealed_at+120,'Wrong future round selection');
        expected={...expected,phase:'SEALED',target:actual.target,sealed_at:actual.sealed_at,target_time:actual.target_time};
      }
      if(method==='draw'){
        const observed=await Promise.all(endpoints.map(endpoint=>get(endpoint+chain.hash+'/public/'+expected.target)));
        observed.forEach(verifyBeacon);
        assert(equal(observed[0],observed[1]),'Public relays differ');
        const result=expectedDraw(expected,observed[0],report.contract);
        report.results.push(result);
        const pairings={...expected.pairings};
        for(const group of result.pods)for(let a=0;a<group.length;a++)for(let b=a+1;b<group.length;b++){
          pairings[group[a]+'-'+group[b]]++;
        }
        expected={...expected,pairings,rounds:expected.rounds+1,phase:'OPEN',target:0,sealed_at:0,target_time:0};
      }
    }
    await verify(label,raw,actor,{method,...(args.length?{args}: {args:[]})},error);
  }

  async function drawRound(number){
    await call('seal-'+number,0,'seal');
    if(number===1)await call('blocked-withdraw',0,'withdraw',[],'Roster is sealed');
    for(let attempt=0;attempt<60;attempt++){
      const latest=await get(endpoints[0]+chain.hash+'/public/latest');
      if(latest.round>=expected.target)break;
      console.log('Waiting for fixed beacon round',expected.target,'current',latest.round);
      await delay(5000);
      if(attempt===59)throw Error('Future beacon did not arrive');
    }
    await call('draw-'+number,0,'draw');
    if(number===1)await call('blocked-redraw',0,'draw',[],'No sealed round');
  }

  if(stage==='setup'){
    assert(!report,'Setup already recorded');
    process.env.POD_ACCOUNT=wallets[0].name;
    const deployment=await invoke('deploy',['deploy','--contract','contracts/pod_draw.py',
      '--args',JSON.stringify(members),JSON.stringify(domains)]);
    const raw=await receipt('deploy',deployment,true);
    assert(code.equals(Buffer.from(raw.data.contract_code,'base64')),'Deployed source differs');
    report={contract:raw.to_address||raw.recipient,deployment,source_sha256:sourceHash,
      revision:process.env.GITHUB_SHA,chain,trace:[],results:[],state:expected};
    await verify('deploy',raw,0,{args:[members,domains]});
    await call('blocked-outsider',6,'approve',[],'Only a registered member');
    for(let actor=0;actor<6;actor++)await call('approve-'+actor,actor,'approve');
  }else if(stage==='first'){
    assert(report && report.state.rounds===0,'Unexpected first-round progress');
    await drawRound(1);
  }else if(stage==='second'){
    assert(report && report.state.rounds===1,'Unexpected second-round progress');
    await drawRound(2);
  }else if(stage==='third'){
    assert(report && report.state.rounds===2,'Unexpected third-round progress');
    await call('withdraw-open',0,'withdraw');
    await call('blocked-seal',0,'seal',[],'Every member must approve');
    await call('reapprove',0,'approve');
    await drawRound(3);
    assert(code.equals(Buffer.from(await rpc('gen_getContractCode',[report.contract]),'base64')),'Fresh source differs');
    save('verified',report);
    console.log(JSON.stringify({contract:report.contract,deployment:report.deployment,receipts:report.trace.length,
      costs:report.results.map(result=>result.minimum_repeat_cost)}));
  }else throw Error('Unknown proof stage');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
