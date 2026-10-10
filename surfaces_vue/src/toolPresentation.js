const truncate = (value, length) => {
  const text = String(value ?? '');
  return text.length > length ? text.slice(0, length - 1) + '…' : text;
};
const baseName = value => String(value || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

export function shortArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args).map(([key, value]) => `${key}=${truncate(typeof value === 'string' ? value : JSON.stringify(value), 96).replace(/\n/g, ' ')}`).join('  ');
}

// Only tool-owned UI copy is translated; paths, commands, descriptions and results
// remain the model's original content. Descriptions come from run_shell.arguments.
export function toolLine(name, args, t = text => text, intent = false, preview = '') {
  const a = args && typeof args === 'object' ? args : {};
  if (intent) {
    if (name === 'run_shell') return { pre: t('请求运行 '), obj: truncate(a.command, 60) };
    if (name === 'write_file') return { pre: t('请求写入 '), obj: baseName(a.path) };
    if (['replace_in_file', 'apply_patch', 'apply_unified_diff'].includes(name)) return { pre: t('请求修改文件 '), obj: a.path ? baseName(a.path) : t('文件') };
    if (name === 'send_message') return { pre: t('请求发送消息至 '), obj: String(a.target || '') };
    return { pre: t('请求使用工具 '), obj: name };
  }
  switch (name) {
    case 'run_shell': return { pre: a.run_in_background ? t('在后台运行 ') : t('运行命令 '), obj: truncate(a.command, 60), post: typeof a.description === 'string' && a.description.trim() ? ` — ${a.description.trim()}` : '' };
    case 'shell_task_output': return { pre: t('查看后台命令输出') };
    case 'shell_task_kill': return { pre: t('停止后台命令') };
    case 'read_file': return { pre: t('读取文件 '), obj: baseName(a.path) || t('文件') };
    case 'write_file': return { pre: t('写入文件 '), obj: baseName(a.path) || t('文件') };
    case 'replace_in_file':
    case 'apply_patch':
    case 'apply_unified_diff': return { pre: t('修改文件 '), obj: a.path ? baseName(a.path) : t('文件') };
    case 'grep': return { pre: t('搜索代码 '), obj: `“${truncate(a.pattern, 40)}”` };
    case 'git_log': return { pre: t('查看最近的 Git 历史') };
    case 'todo_write': {
      const items = Array.isArray(a.todos) ? a.todos : Array.isArray(a.items) ? a.items : [];
      return { pre: t('更新计划 '), obj: items.length === 1 ? truncate(items[0]?.content ?? items[0], 70) : `${items.length} ${t('项任务')}` };
    }
    case 'send_message': {
      const [platform, target] = String(a.target || '').split(':');
      return { pre: target ? t('发送消息至 ') : t('发送消息'), obj: target ? `${platform} · ${baseName(target)}` : '' };
    }
    case 'web_search': return { pre: t('搜索网页 '), obj: `“${truncate(a.query, 60)}”` };
    case 'web_fetch': {
      let host = String(a.url || '');
      try { host = new URL(host).host || host; } catch {}
      return { pre: t('读取网页 '), obj: truncate(host, 50) };
    }
    case 'explore': return { pre: t('派出子智能体探索 '), obj: truncate(a.task ?? a.prompt, 60) };
    case 'load_skill': return { pre: preview.includes('"error"') ? t('尝试技能 ') : t('使用技能 '), obj: String(a.name || ''), post: preview.includes('"error"') ? t(' · 不可用') : '' };
    case 'ask_user': return { pre: t('向你提问') };
    case 'propose_plan': return { pre: t('提出执行计划') };
    case 'request_directory': return { pre: t('请求目录权限 '), obj: String(a.path || '') };
    default: return { pre: t('使用工具 '), obj: name, post: shortArgs(a) ? ` — ${truncate(shortArgs(a), 80)}` : '' };
  }
}

export function approvalBadge(item, approval, t = text => text) {
  const decision = approval?.resolved || item.approvalGrant;
  const denied = ['deny', 'denied'].includes(decision) || item.status === 'denied';
  if (denied) return { label: t('已拒绝'), tone: 'danger', title: item.approvalNote || approval?.reason || '' };
  if (decision === 'inbox') return { label: t('已在收件箱处理'), title: '' };
  const scope = item.approvalGrant || approval?.resolved;
  if (approval || item.approvalOrigin === 'user') return { label: t('用户已批准'), tone: 'ok', title: [scope, item.approvalNote].filter(Boolean).join(' · ') };
  const origins = {
    reviewer: t('自动审查通过'), bypass: t('已绕过审批'), trusted: t('按既有信任放行'),
    trusted_rule: t('按你的信任规则放行'), trusted_server: t('按服务器信任放行'), run_grant: t('本轮已授权'),
  };
  return origins[item.approvalOrigin] ? { label: origins[item.approvalOrigin], title: item.approvalNote || scope || '' } : null;
}
