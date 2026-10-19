// Run in the API container: TOKEN=... node scripts/upload-video.mjs /path/video.mp4 title
import { open, stat } from 'node:fs/promises';
import { basename } from 'node:path';
const [file, title = 'Meu vídeo'] = process.argv.slice(2);
let token = process.env.TOKEN;
let refreshToken = process.env.REFRESH_TOKEN;
if (!file || !token)
  throw new Error('Usage: TOKEN=... node scripts/upload-video.mjs file title');
const api = process.env.API_URL ?? 'http://nestjs-api:3000';
const mime = process.env.CONTENT_TYPE ?? 'video/mp4';
async function json(path, method, body, allowRefresh = true) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 401 && refreshToken && allowRefresh) {
    const renewed = await fetch(`${api}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!renewed.ok)
      throw new Error(
        'Session expired; sign in again to renew the upload session',
      );
    const session = await renewed.json();
    token = session.access_token;
    refreshToken = session.refresh_token;
    return json(path, method, body, false);
  }
  if (!response.ok)
    throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
const size = (await stat(file)).size;
const upload = await json('/videos/uploads', 'POST', {
  title,
  filename: basename(file),
  contentType: mime,
  byteSize: size,
});
console.log('Draft:', upload.id);
const parts = [];
const handle = await open(file, 'r');
const signedParts = new Map();
let signedAt = 0;
try {
  for (let part = 1; part <= upload.partCount; part++) {
    const start = (part - 1) * upload.partSize;
    const bytes = Math.min(upload.partSize, size - start);
    const data = Buffer.allocUnsafe(bytes);
    let read = 0;
    while (read < bytes) {
      const result = await handle.read(data, read, bytes - read, start + read);
      if (result.bytesRead === 0) throw new Error('Unexpected EOF');
      read += result.bytesRead;
    }
    if (!signedParts.has(part) || Date.now() - signedAt > 600_000) {
      const count = Math.min(16, upload.partCount - part + 1);
      const signedBatch = await json(
        `/videos/${upload.id}/upload-parts`,
        'POST',
        { partNumbers: Array.from({ length: count }, (_, i) => part + i) },
      );
      signedParts.clear();
      for (const signed of signedBatch)
        signedParts.set(signed.partNumber, signed.url);
      signedAt = Date.now();
    }
    let response = await fetch(signedParts.get(part), {
      method: 'PUT',
      body: data,
      headers: { 'content-length': String(bytes) },
    });
    if (response.status === 403) {
      const [renewed] = await json(
        `/videos/${upload.id}/upload-parts`,
        'POST',
        { partNumbers: [part] },
      );
      response = await fetch(renewed.url, {
        method: 'PUT',
        body: data,
        headers: { 'content-length': String(bytes) },
      });
    }
    if (!response.ok)
      throw new Error(
        `Part ${part}: ${response.status} ${await response.text()}`,
      );
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Missing ETag');
    parts.push({ partNumber: part, etag });
    console.log(`Uploaded ${part}/${upload.partCount}`);
  }
} finally {
  await handle.close();
}
console.log(await json(`/videos/${upload.id}/complete`, 'POST', { parts }));
console.log(
  `Status: /videos/${upload.id}/status; public URL after ready: /videos/${upload.slug}`,
);
