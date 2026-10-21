// Seeds a board with 2,000 items and 12 columns through the public API.
// Usage: BASE_URL=http://localhost:3400 EMAIL=... PASSWORD=... TOKEN=tue_... node scripts/seed-large.mjs
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const email = process.env.EMAIL ?? 'perf@example.test';
const password = process.env.PASSWORD ?? 'password123';

const H = { 'x-requested-with': 'tuesday', 'content-type': 'application/json' };

async function main() {
  const token = process.env.TOKEN;
  const headers = { 'content-type': 'application/json' };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) throw new Error(`login failed: ${login.status}`);
    headers.cookie = login.headers.get('set-cookie').split(';')[0];
    headers['x-requested-with'] = 'tuesday';
  }
  const workspace = await (
    await fetch(`${base}/api/workspaces`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `Perf ${Date.now()}` }),
    })
  ).json();
  const board = await (
    await fetch(`${base}/api/boards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId: workspace.workspace.id, name: 'Perf board' }),
    })
  ).json();
  const boardId = board.board.id;
  const groupId = board.groups[0].id;
  const types = [
    'text',
    'long_text',
    'number',
    'status',
    'dropdown',
    'people',
    'date',
    'timeline',
    'checkbox',
    'link',
    'email',
    'phone',
  ];
  const columns = [];
  for (let i = 0; i < types.length; i++) {
    const res = await fetch(`${base}/api/boards/${boardId}/columns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: `Perf ${i + 1}`, type: types[i] }),
    });
    if (!res.ok) throw new Error(`column ${types[i]} failed: ${res.status}`);
    columns.push((await res.json()).column);
  }
  let created = 0;
  for (let offset = 0; offset < 2000; offset += 40) {
    const batch = Array.from({ length: Math.min(40, 2000 - offset) }, (_, i) => {
      const n = offset + i;
      const values = {};
      for (const column of columns) {
        if (column.type === 'text' || column.type === 'long_text')
          values[String(column.id)] = { text: `Value ${n}` };
        if (column.type === 'number') values[String(column.id)] = { number: n };
        if (column.type === 'status') values[String(column.id)] = { labelId: 'todo' };
        if (column.type === 'checkbox') values[String(column.id)] = { checked: n % 2 === 0 };
        if (column.type === 'rating') values[String(column.id)] = { rating: 3 };
      }
      return fetch(`${base}/api/boards/${boardId}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ groupId, name: `Item ${n}`, values }),
      });
    });
    const results = await Promise.all(batch);
    for (const res of results) if (!res.ok) throw new Error(`item failed: ${res.status}`);
    created += batch.length;
  }
  const times = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    const res = await fetch(`${base}/api/boards/${boardId}/items`, { headers });
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const data = await res.json();
    times.push(performance.now() - started);
    if (i === 0) console.log(`items returned: ${data.items.length}`);
  }
  times.sort((a, b) => a - b);
  console.log(
    `created: ${created}; board: ${boardId}; median list ms: ${Math.round(times[2])}; max: ${Math.round(times[4])}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
