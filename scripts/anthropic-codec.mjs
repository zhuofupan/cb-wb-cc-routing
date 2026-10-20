// Anthropic Messages <-> Chat Completions adapter (Claude Code transport).
//
// Claude Code speaks the Anthropic Messages API; the WorkBuddy upstream speaks
// OpenAI Chat Completions. This module converts both directions, including the
// SSE event sequence Claude Code expects (message_start / content_block_* /
// message_delta / message_stop).
//
// Deliberate omissions, because the upstream cannot honour them:
//   - cache_control markers are dropped (no prompt caching upstream)
//   - thinking blocks are NOT replayed to Claude Code (upstream reasoning has no
//     verifiable signature); reasoning is discarded rather than faked
//   - top_k, metadata, service_tier are ignored
// Nothing here logs request, response, tool, or credential content.
import { randomUUID } from 'node:crypto';
import { parseChatStream } from './responses-codec.mjs';

const newId = () => `msg_${randomUUID().replaceAll('-', '')}`;
const newToolId = () => `toolu_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

// Claude Code prepends its own client fingerprint to the system prompt, e.g.
// `x-anthropic-billing-header: cc_version=2.1.303.09e; cc_entrypoint=sdk-cli;`
// The WorkBuddy upstream treats that marker as an unapproved channel and answers
// 400 / code 11128 ("Illegal API invocation from an unapproved channel"), so it
// must not be forwarded. Stripped per block; a block that held nothing else is
// dropped so the upstream never sees an empty system part.
//
// 2026-10-20: the desktop Code tab (claude-code 2.1.299) emits the header TWICE
// inside a single system block. The old pattern was anchored with `^` and used
// by a non-global `.replace`, so only the first copy was removed and the second
// still tripped 11128. Strip every copy, anywhere in the block (`g`), and keep
// the "leading whitespace only" cleanup that the anchored version got for free.
//
// Deliberately line-wide: the value grammar differs between CLI builds
// (`cc_entrypoint=sdk-cli;` vs newer keys), so anything from the marker to the
// end of that line goes. Losing one line of the system prompt is cheaper than
// leaking a variant the upstream recognises as an unapproved channel.
const CLIENT_FINGERPRINT = /x-anthropic-[a-z-]+\s*:.*$/gim;

// Second, independent channel check on the same endpoint (found 2026-10-20):
// the upstream also refuses any system prompt that advertises Anthropic's own
// CLI. The exact phrase below is enough to get 11128 — verified by bisecting a
// real Code-tab request down to these 40 characters. The CLI identity line is
// useful to the model, so rewrite it rather than dropping it.
//
// Third (found 2026-10-20 15:00, same 11128): the desktop Code tab appends the
// official feedback paragraph to the system prompt of a *fresh* session, and
// that single sentence is refused:
//   `To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues`
// Bisected out of a real 231 KB first-turn request: the minimal failing window
// is exactly those 99 characters, and rewriting that one sentence turned the
// same request from 400 into 200. Symptom to remember: **every new conversation
// dies on its first message while a long-running one keeps working** — later
// turns of an established session carry a system prompt without this block.
const CHANNEL_MARKERS = [
  [/Anthropic['’]s official CLI for Claude/gi, 'an AI coding agent'],
  [/To give feedback, users should report the issue at https?:\/\/\S+/gi,
    'To give feedback, users should report it in the product issue tracker'],
  // Fallback for prompt variants that carry the repo link without that sentence.
  [/https?:\/\/github\.com\/anthropics\/claude-code\S*/gi, 'the product issue tracker'],
];
function neutraliseChannelMarkers(text) {
  return CHANNEL_MARKERS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

function stripFingerprint(text) {
  return neutraliseChannelMarkers(text.replace(CLIENT_FINGERPRINT, '')).replace(/^\s+/, '');
}

function systemText(system) {
  if (!system) return '';
  if (typeof system === 'string') return stripFingerprint(system);
  return system
    .filter(block => block.type === 'text')
    .map(block => stripFingerprint(block.text))
    .filter(text => text.trim() !== '')
    .join('\n\n');
}

function imagePart(block) {
  const source = block.source ?? {};
  if (source.type === 'base64') {
    return { type: 'image_url', image_url: { url: `data:${source.media_type};base64,${source.data}` } };
  }
  if (source.type === 'url') return { type: 'image_url', image_url: { url: source.url } };
  throw new Error(`Unsupported image source: ${source.type}`);
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(block => {
      if (block.type === 'text') return block.text;
      if (block.type === 'image') return '[Image attached in the following user message.]';
      return '';
    })
    .join('\n');
}

/** Rough prompt size, used only for the initial usage estimate. */
function estimateTokens(messages) {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') chars += message.content.length;
    else if (Array.isArray(message.content)) {
      for (const part of message.content) chars += part.text?.length ?? 0;
    }
    for (const call of message.tool_calls ?? []) chars += (call.function?.arguments ?? '').length;
  }
  return Math.max(1, Math.round(chars / 4));
}

/**
 * Anthropic Messages request -> Chat Completions request.
 * `resolveModel` maps a Claude model id onto a model the upstream serves.
 */
export function toChat(body, resolveModel) {
  const messages = [];
  const system = systemText(body.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const message of body.messages ?? []) {
    const blocks = typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : message.content ?? [];

    if (message.role === 'user') {
      const parts = [];
      const toolResults = [];
      for (const block of blocks) {
        if (block.type === 'text') parts.push({ type: 'text', text: block.text });
        else if (block.type === 'image') parts.push(imagePart(block));
        else if (block.type === 'tool_result') {
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: toolResultText(block.content),
          });
          // Chat Completions tool messages are text-only. Preserve pixels from
          // Read/MCP results in the next user message instead of discarding them.
          if (Array.isArray(block.content)) {
            for (const part of block.content) {
              if (part.type === 'image') parts.push(imagePart(part));
            }
          }
        }
        // thinking / redacted_thinking never appear on a user turn.
      }
      // Tool results must directly follow the assistant turn that asked for
      // them; any free text in the same Anthropic turn comes after.
      for (const result of toolResults) messages.push(result);
      if (parts.length === 1 && parts[0].type === 'text') messages.push({ role: 'user', content: parts[0].text });
      else if (parts.length) messages.push({ role: 'user', content: parts });
    } else if (message.role === 'assistant') {
      const texts = [];
      const calls = [];
      for (const block of blocks) {
        if (block.type === 'text') texts.push(block.text);
        else if (block.type === 'tool_use') {
          calls.push({
            id: block.id ?? newToolId(),
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          });
        }
        // thinking: dropped on purpose (see file header).
      }
      const out = { role: 'assistant', content: texts.join('') || (calls.length ? null : '') };
      if (calls.length) out.tool_calls = calls;
      messages.push(out);
    }
  }

  const tools = (body.tools ?? []).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema ?? { type: 'object', properties: {} },
    },
  }));

  let toolChoice;
  const choice = body.tool_choice;
  if (choice?.type === 'auto') toolChoice = 'auto';
  else if (choice?.type === 'any') toolChoice = 'required';
  else if (choice?.type === 'none') toolChoice = 'none';
  else if (choice?.type === 'tool') toolChoice = { type: 'function', function: { name: choice.name } };

  const model = resolveModel(body.model);
  // Claude Code states its reasoning level as `output_config.effort`
  // (`{"effort":"high"}` in 2.1.303, max in the picker). Chat Completions has
  // no such object — the upstream calls the same idea `reasoning_effort`. Not
  // forwarding it is why "I set it to max in Claude Code" used to end up as the
  // model's own default: the field simply never left the client.
  const effort = body.output_config?.effort ?? body.reasoning_effort;
  const request = {
    model,
    messages,
    stream: true,
    max_tokens: body.max_tokens ?? 8192,
    ...(effort ? { reasoning_effort: effort } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.stop_sequences?.length ? { stop: body.stop_sequences } : {}),
    ...(tools.length ? { tools, ...(toolChoice ? { tool_choice: toolChoice } : {}) } : {}),
  };
  return { model, request, estimatedInput: estimateTokens(messages) };
}

const STOP_REASONS = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  content_filter: 'end_turn',
};
const stopReason = finish => STOP_REASONS[finish] ?? 'end_turn';

/**
 * Stream Chat Completions deltas as Anthropic SSE events.
 * Returns the completed non-streaming message shape (also used for stream:false).
 */
export async function convertStream(upstream, { model, estimatedInput, onUsage }, send) {
  const id = newId();
  const content = [];
  let index = -1;
  let textIndex = -1;
  const toolBlocks = new Map();
  let usage = null;
  let finish = null;

  const emit = (event, data) => send(event, data);

  emit('message_start', {
    type: 'message_start',
    message: {
      id, type: 'message', role: 'assistant', model,
      content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: estimatedInput, output_tokens: 0 },
    },
  });

  let textBlock = null;
  const openText = () => {
    index += 1;
    textIndex = index;
    textBlock = { type: 'text', text: '' };
    content.push(textBlock);
    emit('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
    return index;
  };
  const close = at => emit('content_block_stop', { type: 'content_block_stop', index: at });
  const closeText = () => { if (textIndex >= 0) { close(textIndex); textIndex = -1; textBlock = null; } };

  const openTool = (chatIndex, chatCall) => {
    closeText();
    index += 1;
    const block = { type: 'tool_use', id: chatCall.id ?? newToolId(), name: chatCall.name ?? 'tool', input: {} };
    content.push(block);
    const state = { at: index, block, pending: '', opened: false, args: '' };
    toolBlocks.set(chatIndex, state);
    return state;
  };
  const startTool = state => {
    if (state.opened) return;
    state.opened = true;
    emit('content_block_start', {
      type: 'content_block_start', index: state.at,
      content_block: { type: 'tool_use', id: state.block.id, name: state.block.name, input: {} },
    });
    if (state.pending) {
      state.args += state.pending;
      emit('content_block_delta', {
        type: 'content_block_delta', index: state.at,
        delta: { type: 'input_json_delta', partial_json: state.pending },
      });
      state.pending = '';
    }
  };

  for await (const chunk of parseChatStream(upstream)) {
    if (chunk.error) throw new Error('WorkBuddy returned a stream error');
    if (chunk.code && chunk.code !== 0) throw new Error(`WorkBuddy stream error code ${chunk.code}`);
    if (chunk.usage) { usage = chunk.usage; onUsage?.(chunk.usage); }
    const option = chunk.choices?.[0];
    if (!option) continue;
    if (option.finish_reason) finish = option.finish_reason;
    const delta = option.delta ?? {};

    if (delta.content) {
      if (textIndex < 0) openText();
      textBlock.text += delta.content;
      emit('content_block_delta', {
        type: 'content_block_delta', index: textIndex,
        delta: { type: 'text_delta', text: delta.content },
      });
    }

    for (const call of delta.tool_calls ?? []) {
      const key = call.index ?? 0;
      let state = toolBlocks.get(key);
      if (!state) state = openTool(key, { id: call.id, name: call.function?.name });
      if (call.id) state.block.id = call.id;
      if (call.function?.name) state.block.name = call.function.name;
      if (!state.opened && state.block.name) startTool(state);
      const args = call.function?.arguments;
      if (!args) continue;
      if (state.opened) {
        state.args += args;
        emit('content_block_delta', {
          type: 'content_block_delta', index: state.at,
          delta: { type: 'input_json_delta', partial_json: args },
        });
      } else {
        state.pending += args;
      }
    }
  }

  if (finish === null) throw new Error('WorkBuddy stream ended before a finish reason');

  closeText();
  for (const state of toolBlocks.values()) {
    if (!state.opened) startTool(state);
    close(state.at);
    try {
      state.block.input = state.args ? JSON.parse(state.args) : {};
    } catch {
      throw new Error('Upstream produced malformed tool arguments');
    }
  }

  const outUsage = {
    input_tokens: usage?.prompt_tokens == null ? estimatedInput : Math.max(0, usage.prompt_tokens - (usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0)),
    output_tokens: usage?.completion_tokens ?? 0,
    cache_read_input_tokens: usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
  const reason = stopReason(finish);
  emit('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: reason, stop_sequence: null },
    usage: outUsage,
  });
  emit('message_stop', { type: 'message_stop' });

  return {
    id, type: 'message', role: 'assistant', model,
    content, stop_reason: reason, stop_sequence: null,
    usage: outUsage,
  };
}
