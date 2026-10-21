import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
test('CodeBuddy gateway works without WorkBuddy/DSH and preserves protocol semantics',async t=>{
  const received=[];
  const upstream=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    received.push(JSON.parse(raw));
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    for(const value of [{id:'offline-test',choices:[{delta:{role:'assistant',content:'OK'},finish_reason:null}]},{choices:[{delta:{},finish_reason:'stop'}],usage:{credit:0.125,prompt_tokens:5,completion_tokens:1,prompt_cache_hit_tokens:3}}])res.write(`data: ${JSON.stringify(value)}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  const upstreamPort=await listen(upstream);
  const reservation=createServer();const port=await listen(reservation);await new Promise(r=>reservation.close(r));
  const scratch=await mkdtemp(join(tmpdir(),'routing-regression-'));
  const config=join(scratch,'profile.json');
  await writeFile(config,JSON.stringify({usageLedger:join(scratch,'usage.jsonl'),mode:'codebuddy',port,upstream:`http://127.0.0.1:${upstreamPort}`,followClients:false,effortDefault:'max',effortPolicy:'client',effortMaxByModel:{'hy4-preview':'high'},exactRoutes:{'claude-opus-5':'hy4-preview','claude-opus-4-8':'minimax-m3.1-flash','claude-sonnet-5':'deepseek-v4.1-flash'},models:[{id:'minimax-m3.1-flash',name:'cb·MiniMax-M3.1-Flash (0.08x) · 1M',context:1000000,maxOutput:128000},{id:'deepseek-v4.1-flash',name:'cb/ Deepseek-V4.1-Flash (0.11x) · 1M',context:1000000,maxOutput:128000}]}));
  const entry=fileURLToPath(new URL('../scripts/gateway-server.mjs',import.meta.url));
  const start=()=>spawn(process.execPath,[entry,'--settings',config],{stdio:['ignore','pipe','pipe'],env:{...process.env,IDLE_EXIT_MINUTES:'0'}});
  let child=start();
  let log='';child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});
  t.after(async()=>{
    child.kill();await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r)});
    upstream.closeAllConnections();await new Promise(r=>upstream.close(r));
    assert.equal(dirname(resolve(scratch)),resolve(tmpdir()));assert.ok(basename(scratch).startsWith('routing-regression-'));
    await rm(scratch,{recursive:true,force:true});
  });
  const root=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<60;i++){
    try{const r=await fetch(root+'/health');if(r.ok){ready=true;break}}catch{}
    if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,log);
  const call=body=>fetch(root+'/v1/messages',{method:'POST',headers:{Authorization:'Bearer ck_offline_test','Content-Type':'application/json'},body:JSON.stringify({max_tokens:100,stream:false,...body})});
  await t.test('Codex Responses route emits a completed SSE response',async()=>{
    const r=await fetch(root+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer ck_offline_test','Content-Type':'application/json'},body:JSON.stringify({model:'minimax-m3.1-flash',stream:true,input:'offline Codex probe',reasoning:{effort:'xhigh'}})});
    assert.equal(r.status,200);const sse=await r.text();assert.match(sse,/event: response.completed/);assert.match(sse,/response.output_text.delta/);assert.equal(received.at(-1).reasoning_effort,'xhigh');
    assert.equal(received.at(-1).max_tokens,128000);
  });
  await t.test('explicit Anthropic max_tokens wins over the model ceiling',async()=>{
    const claude=await call({model:'claude-opus-4-8',max_tokens:64,messages:[{role:'user',content:'write a long file'}]});
    assert.equal(claude.status,200);await claude.json();assert.equal(received.at(-1).max_tokens,64);
  });
  await t.test('Claude without max_tokens uses the routed model ceiling, not 8192',async()=>{
    const claude=await call({model:'claude-opus-4-8',max_tokens:undefined,messages:[{role:'user',content:'write a long file'}]});
    assert.equal(claude.status,200);await claude.json();assert.equal(received.at(-1).max_tokens,128000);
  });
  await t.test('auth is required and catalog exposes prefixed 1M model',async()=>{
    const denied=await fetch(root+'/v1/models');assert.equal(denied.status,401);
    const r=await fetch(root+'/v1/models',{headers:{Authorization:'Bearer ck_offline_test'}});assert.equal(r.status,200);
    const {data}=await r.json();assert.equal(data[0].display_name,'cb/ MiniMax-M3.1-Flash (0.08x) · 1M');assert.equal(data[0].context_window,1000000);
  });
  await t.test('named choice selects only that function and keeps the explicit level',async()=>{
    const tools=['other','chosen'].map(name=>({name,input_schema:{type:'object',properties:{}}}));
    const r=await call({model:'claude-opus-5',messages:[{role:'user',content:'offline probe'}],output_config:{effort:'low'},tools,tool_choice:{type:'tool',name:'chosen'}});
    assert.equal(r.status,200);const message=await r.json();assert.equal(message.content[0].text,'OK');assert.equal(message.usage.input_tokens,2);assert.equal(message.usage.cache_read_input_tokens,3);
    // A per-model ceiling caps high picks; it must not raise a deliberate low.
    const body=received.at(-1);assert.equal(body.model,'hy4-preview');assert.equal(body.reasoning_effort,'low');assert.equal(body.tool_choice,'required');assert.deepEqual(body.tools.map(t=>t.function.name),['chosen']);
  });
  await t.test('an explicit lower pick survives the per-model ceiling',async()=>{
    const r=await call({model:'claude-opus-5',output_config:{effort:'low'},messages:[{role:'user',content:'offline probe'}]});
    assert.equal(r.status,200);await r.json();assert.equal(received.at(-1).reasoning_effort,'low');
  });
  await t.test('Desktop context suffix preserves the exact MiniMax model route',async()=>{
    const r=await call({model:'claude-opus-4-8[1m]',output_config:{effort:'low'},messages:[{role:'user',content:'context suffix probe'}]});
    assert.equal(r.status,200);await r.json();assert.equal(received.at(-1).model,'minimax-m3.1-flash');
    assert.equal(received.at(-1).reasoning_effort,'low');
  });
  await t.test('DeepSeek medium maps to low and xhigh to high; MiniMax keeps all five',async()=>{
    for(const [effort,expected] of [['medium','low'],['xhigh','high'],['max','max']]){
      const r=await call({model:'claude-sonnet-5',output_config:{effort},messages:[{role:'user',content:'offline probe'}]});
      assert.equal(r.status,200);await r.json();assert.equal(received.at(-1).reasoning_effort,expected);
    }
    const mini=await call({model:'claude-opus-4-8',output_config:{effort:'medium'},messages:[{role:'user',content:'offline probe'}]});
    assert.equal(mini.status,200);await mini.json();assert.equal(received.at(-1).reasoning_effort,'medium');
  });
  await t.test('an omitted effort reuses the same client last pick per model',async()=>{
    // Pick high for DeepSeek, then omit the field: the remembered high wins.
    await call({model:'claude-sonnet-5',output_config:{effort:'high'},messages:[{role:'user',content:'offline probe'}]});
    await call({model:'claude-sonnet-5',messages:[{role:'user',content:'offline probe'}]});
    assert.equal(received.at(-1).reasoning_effort,'high');
    // Another model keeps its own memory; Codex and Claude are separate keys.
    const codex=await fetch(root+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer ck_offline_test','Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-v4.1-flash',stream:true,input:'offline Codex probe'})});
    assert.equal(codex.status,200);await codex.text();
    assert.equal(received.at(-1).reasoning_effort,'high');
    const picked=await call({model:'claude-sonnet-5',output_config:{effort:'low'},messages:[{role:'user',content:'offline probe'}]});
    assert.equal(picked.status,200);await picked.json();
    const again=await call({model:'claude-sonnet-5',messages:[{role:'user',content:'offline probe'}]});
    assert.equal(again.status,200);await again.json();assert.equal(received.at(-1).reasoning_effort,'low');
  });
  await t.test('Read/MCP result image survives conversion and max is sent for new MiniMax',async()=>{
    const pixels='iVBORw0KGgo=';
    const r=await call({model:'claude-opus-4-8',output_config:{effort:'xhigh'},messages:[{role:'user',content:'read image'},{role:'assistant',content:[{type:'tool_use',id:'read1',name:'Read',input:{file_path:'fixture.png'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'read1',content:[{type:'text',text:'image result'},{type:'image',source:{type:'base64',media_type:'image/png',data:pixels}}]}]}]});
    assert.equal(r.status,200);assert.equal((await r.json()).model,'minimax-m3.1-flash');
    const body=received.at(-1);assert.equal(body.reasoning_effort,'xhigh');
    const images=body.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(c=>c.type==='image_url');
    assert.equal(images.length,1);assert.equal(images[0].image_url.url,`data:image/png;base64,${pixels}`);
    assert.ok(body.messages.some(m=>m.role==='tool'&&String(m.content).includes('image result')));
  });
  await t.test('statistics require auth and report effective effort and cached usage without request content', async()=>{
    assert.equal((await fetch(root+'/v1/stats')).status,401);
    const r=await fetch(root+'/v1/stats',{headers:{Authorization:'Bearer ck_offline_test'}});
    const data=await r.json(); const model=data.models['minimax-m3.1-flash'];
    assert.ok(model.requests>=4);assert.equal(model.errors,0);assert.ok(['low','medium','high','xhigh','max'].includes(model.last_effort));
    // Five successful calls in this run: each upstream reports prompt 5, cache 3.
    assert.equal(model.input_tokens,model.requests*5);assert.equal(model.cached_input_tokens,model.requests*3);
    assert.ok(!JSON.stringify(data).includes('offline Codex probe'));
  });
  await t.test('both protocols persist actual upstream credit without request content',async()=>{
    let lines=[];
    for(let i=0;i<80;i++) {
      try { lines=(await readFile(join(scratch,'usage.jsonl'),'utf8')).trim().split('\n').map(JSON.parse); } catch {}
      if(lines.length===received.length) break;
      await new Promise(r=>setTimeout(r,50));
    }
    // One ledger line per successful upstream request, and no duplicates.
    assert.equal(lines.length,received.length);
    assert.ok(lines.every(r=>r.account==='codebuddy'&&r.usage.credit===0.125&&r.usage.input===5&&r.usage.cached===3));
    assert.ok(lines.some(r=>r.protocol==='responses'));
    assert.ok(lines.some(r=>r.protocol==='anthropic'));
    assert.equal(new Set(lines.map(r=>r.id)).size,received.length);
    assert.ok(!JSON.stringify(lines).includes('ck_offline_test'));
    assert.ok(!JSON.stringify(lines).includes('offline Codex probe'));
  });

  await t.test('last picks survive a gateway restart and stay isolated by client',async()=>{
    const saved=JSON.parse(await readFile(`${config}.effort.json`,'utf8'));
    assert.equal(saved['claude:deepseek-v4.1-flash'],'low');
    assert.ok(!JSON.stringify(saved).includes('ck_offline_test'));
    child.kill();await new Promise(r=>{if(child.exitCode!==null)r();else child.once('exit',r)});
    child=start();child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});
    let restarted=false;
    for(let i=0;i<60;i++){
      try{if((await fetch(root+'/health')).ok){restarted=true;break}}catch{}
      if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(restarted,log);
    const response=await call({model:'claude-sonnet-5',messages:[{role:'user',content:'after restart'}]});
    assert.equal(response.status,200);await response.json();assert.equal(received.at(-1).reasoning_effort,'low');
    const codex=await fetch(root+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer ck_offline_test','Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-v4.1-flash',stream:true,input:'after restart'})});
    assert.equal(codex.status,200);await codex.text();assert.equal(received.at(-1).reasoning_effort,'high');
  });
});
