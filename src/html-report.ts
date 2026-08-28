import type { CitationSource, Evidence, ResearchPlan, ResearchRequest, ResearchTaskFailure, ResearchWorkerTask, Synthesis } from "./types.js";

export function renderInteractiveReport(input: {
  id: string;
  createdAt: string;
  request: ResearchRequest;
  plan: ResearchPlan;
  tasks: ResearchWorkerTask[];
  evidenceTasks?: ResearchWorkerTask[];
  failedTasks?: ResearchTaskFailure[];
  evidence: Evidence[];
  synthesis: Synthesis;
  sources: CitationSource[];
}): string {
  const payload = safeJson({
    ...input,
    evidenceTasks: input.evidenceTasks ?? input.tasks.slice(0, input.evidence.length),
    failedTasks: input.failedTasks ?? []
  });
  return `<!doctype html>
<html lang="${escapeAttribute(input.request.language)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.synthesis.title)} · 交互调研报告</title>
<style>
:root{color-scheme:dark;--bg:#07111d;--panel:#0e1c2d;--line:#23364a;--text:#e9f1fa;--muted:#91a4b8;--cyan:#56d9d1;--amber:#ffbd66;--red:#ff7b85}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#12304a 0,transparent 35%),var(--bg);color:var(--text);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif}header{position:sticky;top:0;z-index:5;padding:18px max(20px,4vw);background:#07111de8;border-bottom:1px solid var(--line);backdrop-filter:blur(14px)}h1{margin:0 0 5px;font-size:clamp(20px,3vw,34px)}h2{font-size:19px;margin:28px 0 12px}.muted{color:var(--muted)}.toolbar{display:grid;grid-template-columns:minmax(220px,2fr) repeat(2,minmax(140px,1fr)) auto;gap:9px;margin-top:14px}input,select,button{border:1px solid var(--line);border-radius:8px;background:#0b1929;color:var(--text);padding:10px 12px}button{cursor:pointer;background:#16334b}.wrap{max-width:1500px;margin:auto;padding:18px max(20px,4vw) 60px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.stat,.card{background:linear-gradient(145deg,#102237,#0b1827);border:1px solid var(--line);border-radius:12px}.stat{padding:14px}.stat b{display:block;font-size:24px;color:var(--cyan)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}.card{padding:15px;min-width:0}.card h3{margin:0 0 8px;font-size:16px}.tag{display:inline-block;border:1px solid #31526a;border-radius:99px;padding:2px 8px;margin:2px 3px 2px 0;color:#b8d8e9;font-size:12px}.claim{padding:10px 0;border-top:1px solid var(--line)}.claim:first-of-type{border-top:0}.source{display:block;margin-top:5px;color:var(--cyan);word-break:break-all}.source:focus,.source:hover{color:#9cf7ef}.confidence{color:var(--amber)}.gap{color:#ffadb3}.hidden{display:none!important}details{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}summary{cursor:pointer;color:#c8d9e8}.entities{max-height:130px;overflow:auto;white-space:pre-wrap}.empty{padding:30px;text-align:center;color:var(--muted)}@media(max-width:780px){.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}}
</style>
</head>
<body>
<header><h1 id="title"></h1><div class="muted" id="meta"></div><div class="toolbar"><input id="search" type="search" placeholder="搜索公司、创始人、融资、观点、证据或 URL…"><select id="role"><option value="">全部角色</option></select><select id="confidence"><option value="0">全部置信度</option><option value="0.8">≥ 80%</option><option value="0.6">≥ 60%</option></select><button id="json">导出 JSON</button></div></header>
<main class="wrap"><section class="stats" id="stats"></section><h2>结论摘要</h2><div class="grid" id="summary"></div><h2>主体索引</h2><div class="grid" id="landscape"></div><h2>角色化 Subagent 工作包</h2><div class="grid" id="workers"></div><h2>证据账本（逐叶节点）</h2><div class="grid" id="evidence"></div><div class="empty hidden" id="empty">当前筛选条件下没有结果。</div><h2>风险与待验证</h2><div class="grid" id="risks"></div></main>
<script type="application/json" id="research-data">${payload}</script>
<script>
(()=>{'use strict';const d=JSON.parse(document.getElementById('research-data').textContent);const $=id=>document.getElementById(id);const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};const link=(s)=>{const a=el('a','source',s.id+' · '+s.title);try{const u=new URL(s.url);if(u.protocol==='http:'||u.protocol==='https:'){a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'}}catch{}return a};const byId=new Map(d.sources.map(s=>[s.id,s]));const sourceFor=url=>d.sources.find(s=>{try{const a=new URL(s.url),b=new URL(url);a.hash='';b.hash='';return a.href===b.href}catch{return s.url===url}});$('title').textContent=d.synthesis.title;$('meta').textContent=d.request.topic+' · '+d.createdAt+' · '+d.request.provider+' · '+d.request.depth;
const stats=[['专业角色',new Set(d.tasks.map(t=>t.roleId)).size],['工作包',d.tasks.length],['目标实体',new Set(d.tasks.flatMap(t=>t.targetEntities)).size],['叶证据',d.evidence.reduce((n,p)=>n+p.findings.length,0)],['独立来源',d.sources.length],['隔离失败',d.failedTasks.length],['未解决',d.evidence.reduce((n,p)=>n+p.gaps.length,0)]];for(const [k,v] of stats){const c=el('div','stat');c.append(el('b','',v),el('span','muted',k));$('stats').append(c)}
function citedCard(title,text,ids,kind){const c=el('article','card searchable');c.dataset.role=kind||'';c.dataset.confidence='1';c.append(el('h3','',title),el('div','',text));for(const id of ids||[]){const s=byId.get(id);if(s)c.append(link(s))}return c}d.synthesis.executiveSummary.forEach((x,i)=>$('summary').append(citedCard('结论 '+(i+1),x.claim,x.sourceIds,'')));d.synthesis.landscape.forEach(x=>$('landscape').append(citedCard(x.entity,x.relevance,x.sourceIds,'')));
for(const t of d.tasks){const f=d.failedTasks.find(x=>x.task.id===t.id);const complete=d.evidenceTasks.some(x=>x.id===t.id);const c=el('article','card searchable');c.dataset.role=t.roleId;c.dataset.confidence='1';c.append(el('h3','',t.id+' · '+t.roleName),el('div','muted',t.purpose));const tags=el('div');tags.append(el('span','tag',t.roleId),el('span','tag',t.targetEntities.length+' 个实体'),el('span',f?'tag gap':'tag',f?'失败 '+f.attempts+' 次':complete?'已完成':'等待中'));c.append(tags);if(f)c.append(el('div','gap','错误：'+f.message));const det=el('details');det.append(el('summary','', '查看负责实体与工作契约'),el('div','entities',t.targetEntities.join('\\n')||'动态发现实体'),el('div','muted',t.objective));c.append(det);$('workers').append(c)}
d.evidence.forEach((p,i)=>{const t=d.evidenceTasks[i];const c=el('article','card searchable');c.dataset.role=t?.roleId||'';c.append(el('h3','',(t?t.id+' · '+t.roleName+' · ':'')+p.query));let max=0;for(const f of p.findings){max=Math.max(max,f.confidence);const row=el('div','claim');row.append(el('div','',f.claim),el('span','confidence','置信度 '+Math.round(f.confidence*100)+'%'));if(f.caveat)row.append(el('div','muted','限制：'+f.caveat));const s=sourceFor(f.source.url);if(s)row.append(link(s));c.append(row)}for(const g of p.gaps)c.append(el('div','gap','待验证：'+g));c.dataset.confidence=String(max);$('evidence').append(c)});
d.synthesis.risksAndUncertainties.forEach((x,i)=>$('risks').append(citedCard('风险 '+(i+1),x.claim,x.sourceIds,'')));d.synthesis.furtherResearch.forEach((x,i)=>$('risks').append(citedCard('后续 '+(i+1),x,[],'')));
for(const [id,name] of [...new Map(d.tasks.map(t=>[t.roleId,t.roleName]))]){const o=el('option','',name);o.value=id;$('role').append(o)}function apply(){const q=$('search').value.trim().toLowerCase(),r=$('role').value,c=Number($('confidence').value);let shown=0;document.querySelectorAll('.searchable').forEach(n=>{const ok=(!q||n.textContent.toLowerCase().includes(q))&&(!r||!n.dataset.role||n.dataset.role===r)&&Number(n.dataset.confidence||1)>=c;n.classList.toggle('hidden',!ok);if(ok)shown++});$('empty').classList.toggle('hidden',shown>0)}$('search').addEventListener('input',apply);$('role').addEventListener('change',apply);$('confidence').addEventListener('change',apply);$('json').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='research-'+d.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})})();
</script></body></html>`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/[^a-zA-Z0-9-]/g, "");
}
