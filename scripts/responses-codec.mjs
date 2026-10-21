// Minimal stateless Responses <-> Chat Completions adapter. No request logging.
import { randomUUID } from 'node:crypto';

const id = prefix => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const toolHistory = new Map();
const names = name => name.replace(/[^a-zA-Z0-9_-]/g, '_');
const SEARCH_NAME = 'codex_tool_search';

// Last-resort output budget when the caller passes no model metadata at all.
// The gateway always supplies the catalog's per-model ceiling, so this value is
// only reached by standalone codec use. Never treat it as the real limit.
const FALLBACK_OUTPUT = 16384;
const MIN_OUTPUT = 16;

export function estimateTokens(messages, tools = []) {
  let chars = tools.length ? Buffer.byteLength(JSON.stringify(tools), 'utf8') : 0;
  for (const message of messages) {
    if (typeof message.content === 'string') chars += Buffer.byteLength(message.content, 'utf8');
    else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.text) chars += Buffer.byteLength(part.text, 'utf8');
        // Images are billed as pixels, not characters. Reserve a fixed slice.
        else if (part.image_url) chars += 12000;
      }
    }
    for (const call of message.tool_calls ?? []) chars += Buffer.byteLength((call.function?.name ?? '') + (call.function?.arguments ?? ''), 'utf8');
  }
  // UTF-8 bytes account for Chinese text and tool schemas. This remains an
  // estimate, not the upstream tokenizer or a compaction trigger.
  return Math.max(1, Math.ceil(chars / 3));
}

/**
 * Pick an output ceiling that the upstream can actually honour.
 *
 * `requested` is the client's value and wins when present, but it is still
 * clamped to the model ceiling and to the room left after input. Without this,
 * a client that omits max_output_tokens inherits an arbitrary small default
 * and large writes end as `incomplete: max_output_tokens`.
 */
export function resolveMaxOutput({ requested, modelMax, contextWindow, estimatedInput, reserve = 2048 } = {}) {
  const positives = [modelMax, contextWindow].filter(value => Number.isSafeInteger(value) && value > 0);
  let ceiling = positives.length ? Math.min(...positives) : Number.MAX_SAFE_INTEGER;
  if (Number.isSafeInteger(contextWindow) && contextWindow > 0) {
    ceiling = Math.min(ceiling, Math.max(MIN_OUTPUT, contextWindow - (estimatedInput ?? 0) - reserve));
  }
  const baseline = Number.isSafeInteger(requested) && requested > 0
    ? requested
    : (Number.isSafeInteger(modelMax) && modelMax > 0 ? modelMax : FALLBACK_OUTPUT);
  return Math.max(MIN_OUTPUT, Math.min(baseline, ceiling));
}

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

export function toChat(body, limits = {}) {
  if (body.previous_response_id) throw new Error('Send complete input history; previous_response_id is unsupported');
  const registry = new Map();
  const tools = [];
  const input = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input ?? [];
  const clientSearch = body.tools?.find(t => t.type === 'tool_search' && t.execution === 'client');
  function addTools(items, namespace, loaded = false, deferred = false) {
    for (const t of items ?? []) {
      if (t.type === 'namespace') { addTools(t.tools, t.name, loaded, deferred || t.defer_loading === true); continue; }
      if (t.type === 'tool_search') {
        // Codex executes client discovery with its normal permission checks.
        // Hosted search falls back to eagerly supplied schemas.
        if (t.execution !== 'client') continue;
        if (!t.parameters) throw new Error('Client tool_search requires parameters');
        registry.set(SEARCH_NAME, t);
        tools.push({ type: 'function', function: { name: SEARCH_NAME,
          description: t.description ?? 'Search for tools needed to continue the task.', parameters: t.parameters } });
        continue;
      }
      if (clientSearch && !loaded && (deferred || t.defer_loading === true)) continue;
      if (!['function', 'custom'].includes(t.type)) throw new Error(`Unsupported tool type: ${t.type}`);
      const name = names(namespace ? `${namespace}__${t.name}` : t.name);
      if (name === SEARCH_NAME && clientSearch) throw new Error('Tool name collides with client tool search');
      if (registry.has(name)) {
        const previous = registry.get(name);
        if (previous.name !== t.name || previous.namespace !== namespace) throw new Error('Tool names collide after namespace conversion');
        tools.splice(tools.findIndex(tool => tool.function.name === name), 1);
      }
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
  for (const item of input) if (item.type === 'tool_search_output') addTools(item.tools, undefined, true);
  const messages = [];
  const pendingImages = [];
  const flushImages = () => { if (pendingImages.length) messages.push({ role: 'user', content: pendingImages.splice(0) }); };
  if (body.instructions) messages.push({ role: 'system', content: body.instructions });
  for (const item of input) {
    if (item.type === 'reasoning') continue;
    if (item.type === 'compaction_trigger') continue;
    if (item.type === 'compaction') {
      if (!limits.decodeCompaction) throw new Error('This compaction token requires its original gateway');
      flushImages();
      messages.push({ role: 'user', content: '[Summary of earlier conversation]\n' + limits.decodeCompaction(item.encrypted_content) });
      continue;
    }
    if (['tool_search_call', 'tool_search_output'].includes(item.type) && item.execution === 'server') continue;
    if (!['function_call_output', 'custom_tool_call_output'].includes(item.type)) flushImages();
    if (item.type === 'tool_search_call') {
      messages.push({ role: 'assistant', content: null, reasoning_content: toolHistory.get(item.call_id) ?? '',
        tool_calls: [{ id: item.call_id, type: 'function', function: { name: SEARCH_NAME, arguments: JSON.stringify(item.arguments) } }] });
    } else if (item.type === 'tool_search_output') {
      messages.push({ role: 'tool', tool_call_id: item.call_id,
        content: item.status === 'failed' ? 'Tool search failed. Try another query.' : 'Tool search completed. Loaded tool definitions are available in the tool list.' });
    } else if (item.type === 'function_call' || item.type === 'custom_tool_call') {
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
    const chosen = toolChoice.type === 'tool_search' ? SEARCH_NAME : names(toolChoice.namespace ? `${toolChoice.namespace}__${toolChoice.name}` : toolChoice.name ?? '');
    if (!registry.has(chosen)) throw new Error('Requested tool_choice is not declared');
    tools.splice(0, tools.length, ...tools.filter(t => t.function.name === chosen));
    toolChoice = 'required';
  }
  const estimatedInput = estimateTokens(messages, tools);
  return { registry, estimatedInput, request: {
    model: body.model, messages, stream: true,
    max_tokens: resolveMaxOutput({
      requested: body.max_output_tokens,
      modelMax: limits.maxOutput,
      contextWindow: limits.context,
      estimatedInput,
    }),
    ...(body.reasoning?.effort ? { reasoning_effort: body.reasoning.effort } : {}),
    ...(body.parallel_tool_calls !== undefined ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
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

export async function convertStream(upstream, model, registry, send, onUsage, parallelToolCalls = true) {
  let seq = 0;
  const emit = (type, data = {}) => send(type, { type, sequence_number: seq++, ...data });
  const response = { id: id('resp'), object: 'response', created_at: Math.floor(Date.now() / 1000),
    model, status: 'in_progress', output: [], error: null, incomplete_details: null,
    parallel_tool_calls: parallelToolCalls, store: false };
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
    if (spec.type === 'tool_search') {
      const item = { id: id('ts'), type: 'tool_search_call', execution: 'client',
        status: 'completed', call_id: call.call_id, arguments: JSON.parse(call.args) };
      response.output.push(item);
      emit('response.output_item.added', { output_index: index, item: { ...item, status: 'in_progress' } });
      emit('response.output_item.done', { output_index: index, item });
      toolHistory.set(call.call_id, reasoning);
      if (toolHistory.size > 4096) toolHistory.delete(toolHistory.keys().next().value);
      continue;
    }
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
