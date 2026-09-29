import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, sandboxHtml, parseCsv } from '../src/markdown.js';
import { attachmentKind, prepareAttachment } from '../src/attachments.js';
import { historyItems } from '../src/history.js';
import { addUsage, usageTotals, normalizeTodos, transcriptGroups } from '../src/sessionState.js';

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
test('tool steps group only consecutive tools; todos support strings and objects', () => {
  const rows = transcriptGroups([{kind:'tool',name:'a'},{kind:'tool',name:'b'},{kind:'assistant',text:'x'},{kind:'tool',name:'c'}]);
  assert.deepEqual(rows.map(r=>r.kind),['steps','assistant','steps']); assert.equal(rows[0].items.length,2);
  assert.deepEqual(normalizeTodos(['one',{content:'two',status:'completed'}]),[{content:'one',status:'pending'},{content:'two',status:'completed'}]);
  assert.deepEqual(normalizeTodos([{content:'finished',status:'done'},{content:'working',status:'in_progress'},{content:'next',status:'pending'}]),[{content:'finished',status:'completed'},{content:'working',status:'in_progress'},{content:'next',status:'pending'}]);
});
