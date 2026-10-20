import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toChat,convertStream} from '../scripts/responses-codec.mjs';

test('Codex namespaced MCP tools and tool-result images preserve payload',()=>{
  const {request,registry}=toChat({model:'minimax-m3.1-flash',reasoning:{effort:'max'},tools:[{type:'namespace',name:'mcp',tools:[{type:'function',name:'read_image',parameters:{type:'object',properties:{}}}]}],input:[
    {type:'function_call',namespace:'mcp',name:'read_image',call_id:'c1',arguments:'{}'},
    {type:'function_call_output',call_id:'c1',output:[{type:'input_text',text:'image result'},{type:'input_image',image_url:'data:image/png;base64,cGl4ZWxz'}]},
  ]});
  assert.equal(request.tools[0].function.name,'mcp__read_image');assert.equal(registry.get('mcp__read_image').namespace,'mcp');
  assert.equal(request.reasoning_effort,'max');assert.equal(request.messages[1].content,'image result');
  assert.equal(request.messages[2].role,'user');assert.equal(request.messages[2].content[0].image_url.url,'data:image/png;base64,cGl4ZWxz');
});

test('Codex apply_patch custom input round trip survives streamed tool output',async()=>{
  const patch='*** Begin Patch\n*** Add File: test.txt\n+ok\n*** End Patch';
  const tools=[{type:'custom',name:'apply_patch',description:'Apply a patch'}];
  const converted=toChat({model:'test',tools,tool_choice:{type:'custom',name:'apply_patch'},input:'make file'});
  assert.equal(converted.request.tool_choice,'required');
  async function* upstream(){
    for(const chunk of [
      {choices:[{delta:{tool_calls:[{index:0,id:'patch1',function:{name:'apply_patch',arguments:JSON.stringify({input:patch})}}]},finish_reason:null}]},
      {choices:[{delta:{},finish_reason:'tool_calls'}]},
    ]) yield new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  const events=[];const response=await convertStream(upstream(),'test',converted.registry,(event,data)=>events.push({event,data}));
  assert.equal(response.status,'completed');assert.equal(response.output[0].input,patch);
  assert.ok(events.some(e=>e.event==='response.custom_tool_call_input.done'));
  const next=toChat({model:'test',tools,input:[response.output[0],{type:'custom_tool_call_output',call_id:'patch1',output:'Success'}]});
  assert.equal(JSON.parse(next.request.messages[0].tool_calls[0].function.arguments).input,patch);assert.equal(next.request.messages[1].content,'Success');
});

test('unsupported hosted tools and server-held history fail explicitly',()=>{
  assert.throws(()=>toChat({tools:[{type:'web_search'}]}),/Unsupported tool type/);
  assert.throws(()=>toChat({previous_response_id:'r1'}),/complete input history/);
});
