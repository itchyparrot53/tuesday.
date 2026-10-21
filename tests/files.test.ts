import { afterAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-files-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function multipart(
  fields: Record<string, string>,
  file: { name: string; mime: string; data: Buffer },
) {
  const boundary = '----tuesdaytest';
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function fixture(maxUploadMb = 25) {
  const app = await createTestApp({ config: { uploadsDir: dir, maxUploadMb } });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const groupId = board.groups[0].id as number;
  const item = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/items`,
    headers: { ...H, cookie },
    payload: { groupId, name: 'File item' },
  });
  return {
    app,
    cookie,
    user,
    board,
    itemId: item.json().item.id as number,
    async upload(extra: Record<string, string> = {}, bytes = Buffer.from('hello world')) {
      const { body, contentType } = multipart(extra, {
        name: 'hello.txt',
        mime: 'text/plain',
        data: bytes,
      });
      return app.inject({
        method: 'POST',
        url: `/api/items/${item.json().item.id}/files`,
        headers: { ...H, cookie, 'content-type': contentType },
        payload: body,
      });
    },
  };
}

describe('files', () => {
  test('uploads, lists, downloads and stores in a file column', async () => {
    const f = await fixture();
    const column = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/columns`,
      headers: { ...H, cookie: f.cookie },
      payload: { title: 'Attachments', type: 'file' },
    });
    const columnId = column.json().column.id as number;
    const upload = await f.upload({ columnId: String(columnId) });
    expect(upload.statusCode).toBe(201);
    const file = upload.json().file;
    const list = await f.app.inject({
      method: 'GET',
      url: `/api/items/${f.itemId}/files`,
      headers: { cookie: f.cookie },
    });
    expect(list.json().files).toHaveLength(1);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.board.board.id}/items`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().items[0].values[String(columnId)]).toEqual({ fileIds: [file.id] });
    const download = await f.app.inject({
      method: 'GET',
      url: `/api/files/${file.id}`,
      headers: { cookie: f.cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/octet-stream');
    expect(String(download.headers['content-disposition'])).toMatch(/^attachment/);
    await f.app.close();
  });

  test('viewers can download but cannot delete files', async () => {
    const f = await fixture();
    const upload = await f.upload();
    const fileId = upload.json().file.id;
    const viewer = await inviteAndJoin(f.app, f.cookie, 'viewer', 'files-viewer@acme.test');
    const download = await f.app.inject({
      method: 'GET',
      url: `/api/files/${fileId}`,
      headers: { cookie: viewer.cookie },
    });
    expect(download.statusCode).toBe(200);
    const del = await f.app.inject({
      method: 'DELETE',
      url: `/api/files/${fileId}`,
      headers: { ...H, cookie: viewer.cookie },
    });
    expect(del.statusCode).toBe(403);
    await f.app.close();
  });

  test('rejects oversized uploads with 413', async () => {
    const f = await fixture(0.001);
    const upload = await f.upload({}, Buffer.alloc(4096, 'a'));
    expect(upload.statusCode).toBe(413);
    await f.app.close();
  });

  test('unreadable board files are hidden from non-members', async () => {
    const f = await fixture();
    const upload = await f.upload();
    const fileId = upload.json().file.id;
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'files-member@acme.test');
    const privateSpace = await createSpace(f.app, f.cookie, 'Private files', { isPrivate: true });
    const privateBoard = await createBoard(f.app, f.cookie, privateSpace.id as number);
    const groupId = privateBoard.groups[0].id;
    const item = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${privateBoard.board.id}/items`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId, name: 'Hidden item' },
    });
    const hiddenId = item.json().item.id as number;
    const { body, contentType } = multipart(
      {},
      {
        name: 'hidden.txt',
        mime: 'text/plain',
        data: Buffer.from('hidden'),
      },
    );
    const hidden = await f.app.inject({
      method: 'POST',
      url: `/api/items/${hiddenId}/files`,
      headers: { ...H, cookie: f.cookie, 'content-type': contentType },
      payload: body,
    });
    const hiddenFile = hidden.json().file.id;
    const res = await f.app.inject({
      method: 'GET',
      url: `/api/files/${hiddenFile}`,
      headers: { cookie: member.cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(fileId).toBeTruthy();
    await f.app.close();
  });
});
