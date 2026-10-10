import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, sandboxHtml, parseCsv } from '../src/markdown.js';
import { attachmentKind, prepareAttachment } from '../src/attachments.js';
import { historyItems } from '../src/history.js';
import { addUsage, usageTotals, normalizeTodos, transcriptGroups, turnRows } from '../src/sessionState.js';
import { toolLine } from '../src/toolPresentation.js';

test('Markdown supports office content and escapes active markup/unsafe links', () => {
  const html = renderMarkdown('# Report\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst n = 1;\n```\n\n[report](artifact:report.md) [web](https://example.com)\n\n<script>alert(1)</script> [bad](javascript:alert(1))');
  assert.match(html, /<h1>Report/); assert.match(html, /<table>/); assert.match(html, /<code class="language-js">/);
  assert.match(html, /data-local-link="artifact:report.md"/); assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(sandboxHtml('<h1>Preview</h1>'), /^<meta.*default-src 'none'/);
});
test('CSV preserves quoted delimiters, embedded newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y","first\nsecond"\r\n"a""b",z'), [['a','b'],['x,y','first\nsecond'],['a"b','z']]);
});
test('attachment eligibility and size limits fail before reading files', async () => {
  assert.equal(attachmentKind({name:'REPORT.PDF', type:''}), 'pdf');
  assert.equal(attachmentKind({name:'data.yaml', type:''}), 'text');
  await assert.rejects(prepareAttachment({name:'run.exe',type:'application/octet-stream',size:1}), /不支持/);
  await assert.rejects(prepareAttachment({name:'big.pdf',type:'application/pdf',size:3*1024*1024},{max_mb:2}), /2 MB/);
});
test('image-only history is retained and non-data image URLs are not replayed as attachments', () => {
  const rows = historyItems([{role:'user', content:[{type:'image_url', image_url:{url:'data:image/png;base64,AA=='}}]}, {role:'user',content:[{type:'image_url',image_url:{url:'https://example.com/a.png'}}]}]);
  assert.equal(rows.length,1); assert.equal(rows[0].attachments[0].kind,'image');
});
test('token totals retain per-model input/output/cache and tolerate malformed sidecars', () => {
  let usage = usageTotals([{role:'assistant',usage:{model:'a',input:100,output:20,cache_read:30}},{role:'assistant',usage:{model:'b',input:50}}]);
  usage = addUsage(usage,{model:'a',input:40,output:-3,cache_write:'10'});
  assert.deepEqual(usage.a,{input:140,output:20,cache_read:30,cache_write:10});
  assert.equal(usage.b.input,50); assert.equal(addUsage(usage,null),usage);
});
test('turn grouping interleaves narration and tools; todos support strings and objects', () => {
  const rows = transcriptGroups([{kind:'tool',name:'a'},{kind:'tool',name:'b'},{kind:'assistant',text:'x'},{kind:'tool',name:'c'}]);
  assert.deepEqual(rows.map(r=>r.kind),['steps']); assert.equal(rows[0].items.length,4);
  assert.deepEqual(normalizeTodos(['one',{content:'two',status:'completed'}]),[{content:'one',status:'pending'},{content:'two',status:'completed'}]);
  assert.deepEqual(normalizeTodos([{content:'finished',status:'done'},{content:'working',status:'in_progress'},{content:'next',status:'pending'}]),[{content:'finished',status:'completed'},{content:'working',status:'in_progress'},{content:'next',status:'pending'}]);
});

test('live narration stays in its turn until completion; pending approvals do not split it', () => {
  const items = [{kind:'user',text:'build'}, {kind:'assistant',text:'Inspecting'}, {kind:'tool',name:'read_file',status:'ok'}, {kind:'assistant',text:'Checking build'}, {kind:'approval',name:'run_shell'}];
  const live = transcriptGroups(items, true);
  assert.deepEqual(live.map(row => row.kind), ['user','steps']);
  assert.equal(live[1].live, true);
  assert.equal(live[1].items.at(-1).text, 'Checking build');
  const done = transcriptGroups(items, false);
  assert.deepEqual(done.map(row => row.kind), ['user','steps','assistant']);
  assert.equal(done[1].key, live[1].key);
  assert.equal(done[2].text, 'Checking build');
  assert.deepEqual(transcriptGroups([{kind:'assistant',text:'Hello'}], true).map(row => row.kind), ['assistant']);
});

test('user messages and notices separate turns and only the last turn is live', () => {
  const rows = transcriptGroups([{kind:'tool',name:'a'}, {kind:'assistant',text:'first answer'}, {kind:'user',text:'next'}, {kind:'tool',name:'b'}, {kind:'notice',text:'compacted'}, {kind:'tool',name:'c'}], true);
  assert.deepEqual(rows.map(row => row.kind), ['steps','assistant','user','steps','notice','steps']);
  assert.deepEqual(rows.filter(row => row.kind === 'steps').map(row => row.live), [false,false,true]);
});

test('approvals attach to the nearest unused matching call, while denied requests keep their position', () => {
  const items = [{kind:'tool',name:'read_file',id:'read'}, {kind:'approval',name:'run_shell',resolved:'once'}, {kind:'tool',name:'run_shell',id:'first'}, {kind:'assistant',text:'Next'}, {kind:'tool',name:'run_shell',id:'second'}, {kind:'approval',name:'write_file',resolved:'deny'}, {kind:'approval',name:'web_fetch',resolved:'deny'}];
  const rows = turnRows(items);
  assert.equal(rows.find(row => row.item.id === 'first').approval, items[1]);
  assert.equal(rows.find(row => row.item.id === 'second').approval, undefined);
  assert.deepEqual(rows.slice(-2).map(row => row.item.name), ['write_file','web_fetch']);
  assert.deepEqual(rows.slice(-2).map(row => row.kind), ['ask','ask']);
});

test('humanized actions preserve Windows filenames, command descriptions and blocked skill wording', () => {
  assert.equal(toolLine('read_file',{path:'D:\\project\\src\\main.py'}).obj, 'main.py');
  assert.deepEqual(toolLine('run_shell',{command:'npm test',description:'Verify local changes'}), {pre:'运行命令 ',obj:'npm test',post:' — Verify local changes'});
  assert.match(toolLine('load_skill',{name:'review'},undefined,false,'{"error":"denied"}').pre, /尝试/);
  assert.match(toolLine('write_file',{path:'a.txt'},undefined,true).pre, /请求/);
});
