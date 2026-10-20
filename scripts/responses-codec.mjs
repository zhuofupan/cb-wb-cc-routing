// Minimal stateless Responses <-> Chat Completions adapter. No request logging.
import { randomUUID } from 'node:crypto';

const id = prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const toolHistory = new Map();
const names = name => name.replace(/[^a-zA-Z0-9_-]/g, '_');

function customInput(args) {
  let parsed;
  try { parsed = JSON.parse(args); }
  // Some upstreams emit the original freeform tool input directly, despite
  // receiving the Chat Completions JSON wrapper schema.
  catch { return args; }
  if (typeof parsed?.input !== 'string') throw new Error('Custom tool arguments must contain a string input');
  return parsed.input;
}

function content(parts) {
  if (typeof parts === 'string') return parts;
  return (parts ?? []).map(p => {
    if (['input_text', 'output_text', 'text'].includes(p.type)) return { type: 'text', text: p.text };
    if (p.type === 'input_image') return { type: 'image_url', image_url: { url: p.image_url, detail: p.detail ?? 'auto' } };
    throw new Error(`Unsupported input content: ${p.type}`);
  });
}

export function toChat(body) {
  if (body.previous_response_id) throw new Error('Send complete input history; previous_response_id is unsupported');
  const registry = new Map();
  const tools = [];
  function addTools(items, namespace) {
    for (const t of items ?? []) {
      if (t.type === 'namespace') { addTools(t.tools, t.name); continue; }
      // Chat Completions has no deferred-tool discovery. All supplied schemas
      // are exposed eagerly below, so its native tool_search is unnecessary.
      if (t.type === 'tool_search') continue;
      if (!['function', 'custom'].includes(t.type)) throw new Error(`Unsupported tool type: ${t.type}`);
      const name = names(namespace ? `${namespace}__${t.name}` : t.name);
      registry.set(name, { ...t, namespace });
      tools.push({ type: 'function', function: {
        name, description: t.description ?? '',
        parameters: t.type === 'custom'
          ? { type: 'object', properties: { input: { type: 'string', description: 'The complete raw tool input, following the original tool format.' } }, required: ['input'], additionalProperties: false }
          : t.parameters ?? { type: 'object', properties: {} },
      } });
    }
  }
  addTools(body.tools);
  const messages = [];
  const pendingImages = [];
  const flushImages = () => { if (pendingImages.length) messages.push({ role: 'user', content: pendingImages.splice(0) }); };
  if (body.instructions) messages.push({ role: 'system', content: body.instructions });
  for (const item of typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input ?? []) {
    if (item.type === 'reasoning') continue;
    if (!['function_call_output', 'custom_tool_call_output'].includes(item.type)) flushImages();
    if (item.type === 'function_call' || item.type === 'custom_tool_call') {
      const custom = item.type === 'custom_tool_call';
      const originalName = item.namespace ? `${item.namespace}__${item.name}` : item.name;
      const call = { id: item.call_id, type: 'function', function: {
        name: names(originalName), arguments: custom ? JSON.stringify({ input: item.input }) : item.arguments,
      } };
      let last = messages.at(-1);
      if (last?.role !== 'assistant' || !last.tool_calls) {
        last = { role: 'assistant', content: null, tool_calls: [] };
        messages.push(last);
      }
      last.tool_calls.push(call);
      last.reasoning_content = toolHistory.get(item.call_id) ?? '';
    } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      const parts = content(item.output);
      const images = Array.isArray(parts) ? parts.filter(p => p.type === 'image_url') : [];
      const text = Array.isArray(parts) ? parts.filter(p => p.type === 'text').map(p => p.text).join('\n') : parts;
      messages.push({ role: 'tool', tool_call_id: item.call_id, content: text || (images.length ? 'Tool image attached in the following user message.' : '') });
      // Tencent accepts image pixels in user messages, not tool messages.
      pendingImages.push(...images);
    } else if (item.type === 'message' || item.role) {
      messages.push({ role: item.role === 'developer' ? 'system' : item.role, content: content(item.content) });
    } else {
      throw new Error(`Unsupported input item: ${item.type}`);
    }
  }
  flushImages();
  let toolChoice = body.tool_choice ?? 'auto';
  if (toolChoice && typeof toolChoice === 'object') {
    const chosen = names(toolChoice.namespace ? `${toolChoice.namespace}__${toolChoice.name}` : toolChoice.name ?? '');
    if (!registry.has(chosen)) throw new Error('Requested tool_choice is not declared');
    tools.splice(0, tools.length, ...tools.filter(t => t.function.name === chosen));
    toolChoice = 'required';
  }
  return { registry, request: {
    model: body.model, messages, stream: true,
    max_tokens: body.max_output_tokens ?? 16384,
    ...(body.reasoning?.effort ? { reasoning_effort: body.reasoning.effort } : {}),
    ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
  } };
}

export async function* parseSSE(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const bytes of stream) {
    buffer += decoder.decode(bytes, { stream: true });
    let split;
    while ((split = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, split).trimEnd();
      buffer = buffer.slice(split + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      if (data) yield JSON.parse(data);
    }
  }
}

// Some upstream models duplicate actual tool calls as XML in visible text.
// Never execute that text. Only the structured tool_calls channel is trusted.
export async function* parseChatStream(upstream) {
  const start = '<tool_call><function=', end = '</tool_call>';
  let pending = '', inside = false, leaked = false, structured = false;
  for await (const chunk of parseSSE(upstream)) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.tool_calls?.length) structured = true;
    if (delta?.content) {
      pending += delta.content;
      let visible = '';
      while (pending) {
        const marker = inside ? end : start;
        const at = pending.indexOf(marker);
        if (at >= 0) {
          if (!inside) visible += pending.slice(0, at);
          pending = pending.slice(at + marker.length);
          inside = !inside;
          leaked = true;
        } else {
          let keep = Math.min(pending.length, marker.length - 1);
          while (keep && !marker.startsWith(pending.slice(-keep))) keep--;
          if (!inside) visible += pending.slice(0, pending.length - keep);
          pending = keep ? pending.slice(-keep) : '';
          break;
        }
      }
      delta.content = visible;
    }
    yield chunk;
  }
  if (leaked && !structured) throw new Error('Upstream emitted tool markup without a structured tool call');
  if (!inside && pending) yield { choices: [{ delta: { content: pending } }] };
}

export async function convertStream(upstream, model, registry, send, onUsage) {
  let seq = 0;
  const emit = (type, data = {}) => send(type, { type, sequence_number: seq++, ...data });
  const response = { id: id('resp'), object: 'response', created_at: Math.floor(Date.now() / 1000),
    model, status: 'in_progress', output: [], error: null, incomplete_details: null,
    parallel_tool_calls: true, store: false };
  emit('response.created', { response: { ...response } });
  emit('response.in_progress', { response: { ...response } });
  const calls = new Map();
  let message, messageIndex, reasoning = '', usage, finished = false, finishReason;
  for await (const chunk of parseChatStream(upstream)) {
    if (chunk.error) throw new Error('WorkBuddy returned a stream error');
    if (chunk.code && chunk.code !== 0) throw new Error(`WorkBuddy stream error code ${chunk.code}`);
    if (chunk.usage) { usage = chunk.usage; onUsage?.(chunk.usage); }
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) { finished = true; finishReason = choice.finish_reason; }
    const delta = choice.delta ?? {};
    reasoning += delta.reasoning_content ?? '';
    if (delta.content) {
      if (!message) {
        messageIndex = response.output.length;
        message = { id: id('msg'), type: 'message', role: 'assistant', status: 'in_progress',
          content: [{ type: 'output_text', text: '', annotations: [], logprobs: [] }] };
        response.output.push(message);
        emit('response.output_item.added', { output_index: messageIndex, item: structuredClone(message) });
        emit('response.content_part.added', { output_index: messageIndex, item_id: message.id, content_index: 0, part: structuredClone(message.content[0]) });
      }
      message.content[0].text += delta.content;
      emit('response.output_text.delta', { output_index: messageIndex, item_id: message.id, content_index: 0, delta: delta.content });
    }
    for (const tc of delta.tool_calls ?? []) {
      const key = tc.index ?? 0;
      let call = calls.get(key);
      if (!call) { call = { call_id: tc.id ?? id('call'), name: '', args: '' }; calls.set(key, call); }
      if (tc.id) call.call_id = tc.id;
      if (tc.function?.name) call.name += tc.function.name;
      call.args += tc.function?.arguments ?? '';
    }
  }
  if (!finished) throw new Error('WorkBuddy stream ended before a finish reason');
  if (message) {
    message.status = 'completed';
    emit('response.output_text.done', { output_index: messageIndex, item_id: message.id, content_index: 0, text: message.content[0].text });
    emit('response.content_part.done', { output_index: messageIndex, item_id: message.id, content_index: 0, part: message.content[0] });
    emit('response.output_item.done', { output_index: messageIndex, item: message });
  }
  for (const call of calls.values()) {
    const spec = registry.get(call.name);
    if (!spec) throw new Error('Upstream requested an undeclared tool');
    const index = response.output.length;
    const custom = spec.type === 'custom';
    const item = { id: id(custom ? 'ctc' : 'fc'), type: custom ? 'custom_tool_call' : 'function_call',
      status: 'completed', call_id: call.call_id, name: spec.name,
      ...(spec.namespace ? { namespace: spec.namespace } : {}),
      ...(custom ? { input: customInput(call.args) } : { arguments: call.args }) };
    const field = custom ? 'input' : 'arguments';
    emit('response.output_item.added', { output_index: index, item: { ...item, status: 'in_progress', [field]: '' } });
    emit(custom ? 'response.custom_tool_call_input.delta' : 'response.function_call_arguments.delta',
      { output_index: index, item_id: item.id, delta: item[field] });
    emit(custom ? 'response.custom_tool_call_input.done' : 'response.function_call_arguments.done',
      { output_index: index, item_id: item.id, [field]: item[field] });
    response.output.push(item);
    emit('response.output_item.done', { output_index: index, item });
    toolHistory.set(call.call_id, reasoning);
    if (toolHistory.size > 4096) toolHistory.delete(toolHistory.keys().next().value);
  }
  response.usage = { input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0,
    total_tokens: usage?.total_tokens ?? 0,
    input_tokens_details: { cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0 },
    output_tokens_details: { reasoning_tokens: usage?.completion_tokens_details?.reasoning_tokens ?? 0 } };
  response.status = finishReason === 'length' ? 'incomplete' : 'completed';
  if (response.status === 'incomplete') response.incomplete_details = { reason: 'max_output_tokens' };
  emit(`response.${response.status}`, { response });
  return response;
}
