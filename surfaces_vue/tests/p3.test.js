import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { memoryNotice, undoMemory, personaConnections, providerDefaults, providerPayload } from '../src/p3.js';
test('memory undo deletes additions (server previous: empty string) and restores edits', async () => {
  const calls = [], api = { deleteMemory: id => calls.push(['delete',id]), updateMemory: (id,content) => calls.push(['update',id,content]) };
  await undoMemory(memoryNotice({id:1,content:'new',previous:''}),api);
  await undoMemory(memoryNotice({id:2,content:'edited',previous:'old'}),api);
  assert.deepEqual(calls,[['delete',1],['update',2,'old']]);
  assert.equal(memoryNotice({id:'invalid'}),null);
});
test('provider conditional fields and defaults preserve values without sending hidden credentials', () => {
  const provider={values:{method:'account'},fields:[{key:'method',default:'key'},{key:'api_key',show_when:{method:'key'}},{key:'profile',default:'main',show_when:{method:'account'}}]};
  assert.deepEqual(providerDefaults(provider),{method:'account',api_key:'',profile:'main'});
  assert.deepEqual(providerPayload(provider,{method:'account',api_key:'secret',profile:'work'}),{method:'account',profile:'work'});
});
test('persona defaults and recommendations merge without losing MCP or disabled connections', () => {
  const rows=personaConnections({recommends:[{kind:'connector',ref:'slack'},{kind:'mcp',ref:'slack'}],default_connections:[{connector:'slack',enabled:false},{connector:'mail',enabled:true}]});
  assert.equal(rows.length,3);assert.equal(rows[0].default.enabled,false);assert.equal(rows[1].default,undefined);assert.equal(rows[2].ref,'mail');
});
test('application translation calls have English entries', () => {
  const root = new URL('../src/', import.meta.url), dictionary = JSON.parse(readFileSync(new URL('locales/en.json',root)));
  const files = ['App.vue',...readdirSync(new URL('components/',root)).filter(f=>f.endsWith('.vue')).map(f=>'components/'+f)];
  const missing = new Set();
  for (const file of files) {
    const source = readFileSync(new URL(file,root),'utf8').replaceAll('&quot;','"');
    for (const match of source.matchAll(/\bt\((["'])([^"'\n]+)\1\)/g)) {
      if (/[\u3400-\u9fff]/.test(match[2]) && !dictionary[match[2]] && !dictionary[match[2].trim()]) missing.add(match[2]);
    }
  }
  assert.deepEqual([...missing],[]);
});
