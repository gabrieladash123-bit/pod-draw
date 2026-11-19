const fs=require('node:fs'),path=require('node:path');
const {assert,equal,sourceHash,receiptSummary}=require('./transport.cjs');
const {decodeReceipt}=require('./receipt-calldata.cjs');
const {chain,expectedDraw}=require('./reference.cjs');

async function main(){
  process.env.GENLAYER_CLI_PATH ||= path.resolve('node_modules/genlayer/dist/index.js');
  const folder=process.argv[2]||'proofs';
  const load=name=>JSON.parse(fs.readFileSync(path.join(folder,name+'.json')));
  const report=load('verified'),journal=load('transactions');
  assert(report.source_sha256===sourceHash && journal.source_sha256===sourceHash,'Wrong contract digest');
  assert(equal(report.chain,chain),'Wrong pinned beacon chain');
  const members=report.trace[0].state.members;
  const outsider=(load('blocked-outsider-receipt').from_address).toLowerCase();
  const wallets=[...members,outsider];
  assert(new Set(wallets).size===7,'Wrong proof wallet set');
  const domains=['a','a','b','b','c','c'];
  const calls=[
    ['deploy',0,null,[members,domains],null],
    ['blocked-outsider',6,'approve',[],'Only a registered member'],
    ...members.map((_,index)=>['approve-'+index,index,'approve',[],null]),
    ['seal-1',0,'seal',[],null],
    ['blocked-withdraw',0,'withdraw',[],'Roster is sealed'],
    ['draw-1',0,'draw',[],null],
    ['blocked-redraw',0,'draw',[],'No sealed round'],
    ['seal-2',0,'seal',[],null],
    ['draw-2',0,'draw',[],null],
    ['withdraw-open',0,'withdraw',[],null],
    ['blocked-seal',0,'seal',[],'Every member must approve'],
    ['reapprove',0,'approve',[],null],
    ['seal-3',0,'seal',[],null],
    ['draw-3',0,'draw',[],null]
  ];
  const labels=calls.map(call=>call[0]);
  assert(equal(report.trace.map(trace=>trace.label),labels),'Wrong trace order');
  assert(equal(Object.keys(journal.hashes).sort(),[...labels].sort()),'Wrong journal entries');
  let state={members,domains,approvals:[false,false,false,false,false,false],
    pairings:Object.fromEntries(members.flatMap((_,a)=>members.slice(a+1).map((__,offset)=>[a+'-'+(a+offset+1),0]))),
    rounds:0,phase:'OPEN',target:0,sealed_at:0,target_time:0};
  const results=[];
  for(const [index,[label,actor,method,args,error]] of calls.entries()){
    const raw=load(label+'-receipt'),trace=report.trace[index],summary=receiptSummary(raw);
    assert((raw.from_address||raw.sender).toLowerCase()===wallets[actor] && trace.signer===wallets[actor],'Wrong signer');
    assert((raw.to_address||raw.recipient).toLowerCase()===report.contract.toLowerCase(),'Wrong contract recipient');
    assert(summary.hash===journal.hashes[label] && summary.hash===trace.hash,'Wrong hash');
    assert(summary.status==='FINALIZED' && summary.result==='MAJORITY_AGREE'
      && summary.agree>(summary.agree+summary.disagree+summary.idle)/2,'Missing finalized strict majority');
    assert(equal(summary,Object.fromEntries(Object.keys(summary).map(key=>[key,trace[key]]))),'Wrong receipt summary');
    const calldata=method?{method,args}:{args};
    assert(equal(await decodeReceipt(raw),calldata) && equal(trace.calldata,calldata),'Wrong signed arguments');
    assert(trace.error===(error||null),'Wrong documented error');
    if(error){
      const payload=Buffer.from(raw.consensus_data.leader_receipt[0].result,'base64');
      assert(summary.execution==='ERROR' && payload[0]===1 && payload.subarray(1).toString()===error,'Wrong contract error');
    }else{
      assert(['SUCCESS','FINISHED_WITH_RETURN'].includes(summary.execution),'Unexpected execution failure');
      if(method===null){
        assert(report.deployment===summary.hash && fs.readFileSync('contracts/pod_draw.py')
          .equals(Buffer.from(raw.data.contract_code,'base64')),'Wrong deployment source');
      }else if(method==='approve' || method==='withdraw'){
        assert(state.phase==='OPEN','Approval changed a sealed roster');
        state={...state,approvals:state.approvals.map((value,member)=>member===actor?method==='approve':value)};
      }else if(method==='seal'){
        assert(state.phase==='OPEN' && state.approvals.every(Boolean),'Sealed without unanimous consent');
        const observed=trace.state;
        assert(observed.target===Math.ceil((observed.sealed_at+120-chain.genesis_time)/chain.period)+1
          && observed.target_time===chain.genesis_time+(observed.target-1)*chain.period
          && observed.target_time>=observed.sealed_at+120,'Wrong future beacon target');
        const observedFinal=Number(raw.current_timestamp);
        assert(Number(raw.created_timestamp)===observed.sealed_at && Number.isSafeInteger(observedFinal)
          && observedFinal<observed.target_time,'Seal was not observed finalized before the scheduled beacon');
        if(results.length)assert(observed.target>results.at(-1).target,'Reused old beacon round');
        state={...state,phase:'SEALED',target:observed.target,sealed_at:observed.sealed_at,target_time:observed.target_time};
      }else if(method==='draw'){
        assert(state.phase==='SEALED','Draw without a locked target');
        const actual=report.results[results.length];
        assert(actual.beacon.round===state.target,'Wrong beacon round');
        const wanted=expectedDraw(state,actual.beacon,report.contract);
        assert(equal(actual,wanted),'Wrong partition, repeat optimum, sampler or BLS signature');
        results.push(actual);
        const pairings={...state.pairings};
        for(let left=0;left<members.length;left++){
          for(let right=left+1;right<members.length;right++){
            if(actual.pods.some(group=>group.includes(left)&&group.includes(right)))pairings[left+'-'+right]++;
          }
        }
        state={...state,pairings,rounds:state.rounds+1,phase:'OPEN',target:0,sealed_at:0,target_time:0};
      }
    }
    assert(equal(trace.state,state) && equal(trace.results,results),'Observed state or historical result differs');
  }
  assert(equal(report.state,state) && equal(report.results,results) && results.length===3,'Incomplete final report');
  assert(results[0].minimum_repeat_cost===0 && results[1].minimum_repeat_cost===2,'Missing history-sensitive result');
  console.log(JSON.stringify({contract:report.contract,receipts:calls.length,draws:results.length,
    costs:results.map(result=>result.minimum_repeat_cost),sourceHash}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
