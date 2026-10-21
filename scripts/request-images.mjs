import sharp from 'sharp';

// These are gateway safety budgets, not documented Tencent service limits.
export async function prepareImages(request, policy = {}) {
  const maxImages = policy.maxImages ?? 16;
  const recentImages = policy.recentImages ?? 2;
  for (const value of [maxImages, recentImages, policy.recentMaxEdge ?? 2048, policy.historyMaxEdge ?? 1280]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Image policy counts and dimensions must be positive integers');
  }
  const images = request.messages.flatMap(message =>
    Array.isArray(message.content) ? message.content.filter(part => part.type === 'image_url') : []);
  let compressed = 0, omitted = 0, before = 0, after = 0;
  for (const [index, part] of images.entries()) {
    if (index < images.length - maxImages) {
      delete part.image_url;
      part.type = 'text';
      part.text = '[Older image omitted from this request to fit the image budget. Its original remains in the chat; reopen the source image if needed.]';
      omitted++;
      continue;
    }
    const url = part.image_url?.url;
    if (typeof url !== 'string' || !url.startsWith('data:image/')) continue;
    const match = /^data:image\/(?:png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(url);
    if (!match) throw Object.assign(new Error('Unsupported inline image encoding'), { status: 400 });
    const input = Buffer.from(match[1], 'base64');
    before += input.length;
    // Small images remain byte-identical (including tiny protocol fixtures).
    if (input.length <= (policy.compressAboveBytes ?? 256 * 1024)) { after += input.length; continue; }
    const recent = index >= images.length - recentImages;
    const edge = recent ? (policy.recentMaxEdge ?? 2048) : (policy.historyMaxEdge ?? 1280);
    let output;
    try {
      output = await sharp(input, { limitInputPixels: 64 * 1024 * 1024 })
        .rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: recent ? 88 : 75 }).toBuffer();
    } catch {
      throw Object.assign(new Error('Could not decode inline image for request compression'), { status: 400 });
    }
    if (output.length < input.length) {
      part.image_url.url = `data:image/jpeg;base64,${output.toString('base64')}`;
      compressed++;
      after += output.length;
    } else after += input.length;
  }
  return { images: images.length, compressed, omitted, before_bytes: before, after_bytes: after };
}

export function checkPayload(payload, limitBytes) {
  const bytes = Buffer.byteLength(payload);
  if (bytes > limitBytes) throw Object.assign(new Error(
    `Prepared request is ${bytes} bytes; gateway upstream budget is ${limitBytes} bytes. Compact the chat or increase upstreamRequestLimitMiB after confirming the upstream limit.`), { status: 413 });
  return payload;
}
