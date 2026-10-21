import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toChat } from '../scripts/anthropic-codec.mjs';

const tools=[
  { name:'ToolSearch',description:'Find tools',input_schema:{type:'object',properties:{query:{type:'string'}}} },
  { name:'ReadFixture',description:'Read fixture',defer_loading:true,input_schema:{type:'object',properties:{path:{type:'string'}}} },
  { name:'WriteFixture',defer_loading:true,input_schema:{type:'object',properties:{text:{type:'string'}}} },
];
const resolve=()=> 'deepseek-v4.1-flash';
test('Claude deferred tools load from tool_reference results, isolated by request history',()=>{
  const first=toChat({tools,messages:[{role:'user',content:'Find a file reader'}]},resolve);
  assert.deepEqual(first.request.tools.map(t=>t.function.name),['ToolSearch']);
  const second=toChat({tools,messages:[
    {role:'assistant',content:[{type:'tool_use',id:'search1',name:'ToolSearch',input:{query:'file reader'}}]},
    {role:'user',content:[{type:'tool_result',tool_use_id:'search1',content:[{type:'tool_reference',tool_name:'ReadFixture'}]}]},
  ]},resolve);
  assert.deepEqual(second.request.tools.map(t=>t.function.name),['ToolSearch','ReadFixture']);
  assert.match(second.request.messages[1].content,/Loaded tool: ReadFixture/);
  assert.equal(second.toolStats.deferred,2);assert.equal(second.toolStats.exposed,2);
  assert.deepEqual(toChat({tools,messages:[]},resolve).request.tools.map(t=>t.function.name),['ToolSearch']);
  assert.throws(()=>toChat({tools,messages:[{role:'user',content:[{type:'tool_result',tool_use_id:'x',content:[{type:'tool_reference',tool_name:'not_declared'}]}]}]},resolve),/undeclared tool/);
});

test('a previously called deferred tool remains loaded after client history compaction',()=>{
  const converted=toChat({tools,messages:[
    {role:'assistant',content:[{type:'tool_use',id:'read1',name:'ReadFixture',input:{path:'fixture'}}]},
    {role:'user',content:[{type:'tool_result',tool_use_id:'read1',is_error:true,content:'file missing'}]},
  ]},resolve);
  assert.deepEqual(converted.request.tools.map(t=>t.function.name),['ToolSearch','ReadFixture']);
  assert.match(converted.request.messages[1].content,/Tool error: file missing/);
});

test('explicit tool choice loads the requested tool and preserves parallel-call control',()=>{
  const converted=toChat({tools,tool_choice:{type:'tool',name:'WriteFixture',disable_parallel_tool_use:true},messages:[]},resolve);
  assert.deepEqual(converted.request.tools.map(t=>t.function.name),['WriteFixture']);
  assert.equal(converted.request.parallel_tool_calls,false);
  const none=toChat({tools,tool_choice:{type:'none'},messages:[]},resolve);
  assert.equal(none.request.tools,undefined);assert.equal(none.toolStats.exposed,0);
  assert.throws(()=>toChat({tools,tool_choice:{type:'tool',name:'not_declared'}},resolve),/not declared/);
});

test('unsupported hosted search fails rather than advertising a fake callable function',()=>{
  assert.throws(()=>toChat({tools:[{type:'tool_search_tool_regex_20251119',name:'search'}]},resolve),/Unsupported hosted tool/);
});
