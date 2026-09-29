export const automationTemplates = [
  {id:'github',title:'GitHub 每周摘要',needs:['github','slack'],frequency:'mon',time:'09:00',repository:true,delivery:true,instructions:'总结指定仓库过去一周的提交、拉取请求、问题和发布，列出重要变化及需要跟进的事项。'},
  {id:'pipeline',title:'销售管道周报',needs:['hubspot','slack'],frequency:'mon',time:'09:00',delivery:true,instructions:'查看 HubSpot 销售管道，汇总过去一周的交易进展、停滞交易及需要跟进的机会。'},
  {id:'brief',title:'每日工作简报',needs:['google_calendar','gmail'],time:'08:00',instructions:'查看今天的日历与需要处理的邮件，准备简洁的工作简报，包括会议、待回复事项和建议优先级。'},
  {id:'news',title:'每日新闻摘要',needs:[],time:'08:00',instructions:'搜索并总结今天的重要新闻，注明可靠来源链接与发布日期，区分事实和评论。'},
  {id:'inboxdigest',title:'邮件收件箱摘要',needs:['gmail'],frequency:'weekdays',time:'09:00',instructions:'总结最近一天的重要邮件，按需要回复、需要行动、仅供知晓分类。不要发送邮件。'},
  {id:'cleanup',title:'每周工作区整理',needs:[],frequency:'fri',time:'17:30',instructions:'检查本任务工作区的文件，整理本周产出摘要并建议归档方案。涉及删除或移动前先请求确认。'},
];
export function templateInstructions(template,repository,channel) {
  if(template.repository && !repository.trim()) throw new Error('请填写 GitHub 仓库');
  if(template.delivery && !channel.trim()) throw new Error('请选择投递频道');
  return [template.instructions,template.repository ? `仓库：${repository.trim()}` : '',template.delivery ? `将摘要发送到 ${channel.trim()}。` : '在此任务的运行会话中返回结果。'].filter(Boolean).join('\n');
}
