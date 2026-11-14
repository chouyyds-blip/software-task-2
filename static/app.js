'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {user:null,page:'competitions',competitions:[],query:'',category:''};
const admin = () => state.user?.role === 'admin';
function expired(deadline){if(!deadline)return true;const end=new Date(deadline.length===10?deadline+'T23:59:59.999':deadline);return !Number.isFinite(end.getTime())||Date.now()>end.getTime();}
function deadlineInputValue(value){if(!value)return '';if(value.length===10)return value+'T23:59';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
async function api(path,method='GET',body){
  const res=await fetch('/api'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result=await res.json();if(!res.ok)throw new Error(result.error || '请求失败');return result;
}
function showModal(title,html){$('#modal-title').textContent=title;$('#modal-body').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
$('#close-modal').onclick=()=>$('#modal').close();
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
let fieldSequence=0;
const field=(name,label,value='',type='text',extra='')=>{const id='field-'+(++fieldSequence);return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;};
const area=(name,label,value='',extra='')=>{const id='field-'+(++fieldSequence);return `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${name}" ${extra}>${esc(value)}</textarea></div>`;};
const formEnd=(text='保存')=>`<div class="error" role="alert"></div><div class="form-actions"><button type="button" class="btn" data-action="close">取消</button><button class="btn primary" type="submit">${text}</button></div></form>`;
function bindForm(id,callback){
  $(id).onsubmit=async e=>{e.preventDefault();const form=e.target;const btn=form.querySelector('[type=submit]');btn.disabled=true;form.querySelector('.error').textContent='';try{await callback(Object.fromEntries(new FormData(form)));}catch(err){form.querySelector('.error').textContent=err.message;}finally{btn.disabled=false;}};
}
function account(){
 $('#account').innerHTML=state.user?`<span class="avatar">${esc(state.user.name.slice(0,1))}</span><div><strong>${esc(state.user.name)}</strong><small>${admin()?'管理员':'学生'} · ${esc(state.user.username)}</small></div><button class="link" data-action="logout">退出</button>`:`<span class="avatar">访</span><div><strong>访客</strong><small>登录后管理个人资料</small></div><button class="link" data-action="login">登录</button>`;
}
function heading(title,subtitle,button=''){$('#page-heading').innerHTML=`<div><h2>${title}</h2><p>${subtitle}</p></div>${button}`;}
function empty(title,description){return `<div class="empty"><strong>${title}</strong>${description}</div>`;}
function render(){
 document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('active',el.dataset.page===state.page);if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});account();
 if(state.page==='competitions')renderCompetitions();
 if(state.page==='profile')renderProfile();
}
async function refresh(){
 state.competitions=(await api('/competitions')).competitions;render();
}
function renderCompetitions(){
 heading('发现竞赛','找到感兴趣的方向，开启你的下一次挑战。',admin()?'<button class="btn primary" data-action="competition-new">＋ 发布竞赛</button>':'');
 const categories=[...new Set(state.competitions.map(c=>c.category))];
$('#content').innerHTML=`<div class="toolbar"><input id="search" aria-label="按竞赛名称搜索" placeholder="搜索竞赛名称…" value="${esc(state.query)}"><select id="category" aria-label="竞赛分类"><option value="">全部分类</option>${categories.map(c=>`<option ${state.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select><span class="form-note">共 0 项竞赛</span></div><div id="competition-results"></div>`;
 const search = $('#search');
 function updateQuery() {
  state.query = search.value;
  renderCompetitionResults();
 }
 search.addEventListener('input', event => {
  if (!event.isComposing) updateQuery();
 });
 search.addEventListener('compositionend', updateQuery);
 $('#category').onchange = event => {
  state.category = event.target.value;
  renderCompetitionResults();
 };
 renderCompetitionResults();
}
function renderCompetitionResults(){
 const query = state.query.trim().toLowerCase();
 const list = state.competitions.filter(c =>
  (!query || c.title.toLowerCase().includes(query) || c.category.toLowerCase().includes(query)) &&
  (!state.category || c.category === state.category)
 );
 $('#content .toolbar .form-note').textContent = `共 ${list.length} 项竞赛`;
 $('#competition-results').innerHTML = list.length?`<div class="grid">${list.map(c=>`<article class="card"><div class="card-top"><span class="tag">${esc(c.category)}</span>${!c.active?'<span class="status inactive">已下架</span>':expired(c.deadline)?'<span class="status inactive">已截止</span>':'<span class="status approved">报名开放</span>'}</div><h3>${esc(c.title)}</h3><p class="description">${esc(c.description.slice(0,85))}</p><div class="meta"><span>◷ 截止 ${esc(c.deadline.replace('T',' '))}</span><span>♧ ${c.min_members}–${c.max_members} 人 / 队</span></div><div class="card-bottom"><div class="actions">${admin()?`<button class="link" data-action="competition-edit" data-id="${c.id}">编辑</button>`:''}<button class="btn small" data-action="competition-detail" data-id="${c.id}">查看详情 ↗</button></div></div></article>`).join('')}</div>`:empty('暂无符合条件的竞赛','试试其他关键词或分类。');
}
function competitionDetail(id){const c=state.competitions.find(x=>x.id===id);showModal(c.title,`<span class="tag">${esc(c.category)}</span><p class="detail-text">${esc(c.description)}</p><div class="meta"><span>截止：${esc(c.deadline.replace('T',' '))}</span><span>人数：${c.min_members}–${c.max_members} 人</span></div>${c.official_url?`<p><a href="${esc(c.official_url)}" target="_blank" rel="noopener noreferrer">访问竞赛官网 ↗</a></p>`:''}`);}
async function competitionForm(id){
 const c=id?(await api(`/competitions/${id}`)).competition:{min_members:1,max_members:3,active:1};
 const frozen=Boolean(c.eligibility_locked),initialDeadline=deadlineInputValue(c.deadline);
 showModal(id?'编辑竞赛':'发布竞赛',`${frozen?'<div class="hint">已有队伍报名，人数和截止时间已锁定；可修改名称、简介和发布状态。</div>':''}<form id="competition-form">${field('title','竞赛名称',c.title,'text','required maxlength="100"')}${field('category','竞赛分类',c.category,'text','required maxlength="30"')}${area('description','竞赛简介',c.description,'required maxlength="3000"')}${field('deadline','报名截止时间',initialDeadline,'datetime-local','required')}<div class="form-grid">${field('min_members','最少人数',c.min_members,'number','required min="1" max="20"')}${field('max_members','最多人数',c.max_members,'number','required min="1" max="20"')}</div>${field('official_url','官网链接（选填）',c.official_url,'url')}<label class="field">发布状态<select name="active"><option value="1" ${c.active?'selected':''}>上架</option><option value="0" ${!c.active?'selected':''}>下架</option></select></label>${formEnd('保存竞赛')}`);
 if(frozen)for(const name of ['deadline','min_members','max_members'])$('#competition-form [name='+name+']').disabled=true;
 bindForm('#competition-form',async data=>{if(id&&data.deadline===initialDeadline)delete data.deadline;if(data.min_members!==undefined)data.min_members=Number(data.min_members);if(data.max_members!==undefined)data.max_members=Number(data.max_members);data.active=Number(data.active);await api('/competitions'+(id?'/'+id:''),id?'PUT':'POST',data);$('#modal').close();await refresh();toast('竞赛信息已保存');});
}
function login(register=false){
 showModal(register?'创建学生账号':'欢迎回到竞遇',`<form id="auth-form">${field('username','用户名','','text','required minlength="3" maxlength="30" autocomplete="username"')}${register?field('name','姓名','','text','required maxlength="30"'):''}${field('password','密码','','password',`required minlength="8" maxlength="128" autocomplete="${register?'new-password':'current-password'}"`)}<div class="form-note">${register?'用户名使用字母、数字或下划线；密码至少 8 位。':'输入用户名和密码登录。'}</div><div class="error" role="alert"></div><div class="form-actions"><button type="button" class="btn" data-action="${register?'login':'register'}">${register?'已有账号':'注册账号'}</button><button class="btn primary" type="submit">${register?'注册并登录':'登录'}</button></div></form><p class="form-note">资料用于身份识别和组队展示；姓名、专业、年级和简介会展示给浏览者。联系电话和报名说明仅本队成员与管理员可见。请勿填写身份证等无关敏感信息。</p>${register?'':`<div class="initial-accounts">初始账号密码为 <strong>Demo123456</strong><br>${['zhou','admin'].map(u=>`<button class="btn small" data-action="account-fill" data-user="${u}">${({zhou:'周',admin:'管理员'})[u]}</button>`).join('')}<p class="form-note">点击填入初始账号；登录后可在个人资料中修改密码。</p></div>`}`);
 bindForm('#auth-form',async data=>{const result=await api(register?'/register':'/login','POST',data);state.user=result.user|| (await api('/me')).user;$('#modal').close();await refresh();toast(register?'注册成功':'登录成功');});
}
function renderProfile(){heading('个人资料','让队友更了解你，从一份简单的自我介绍开始。');if(!state.user){$('#content').innerHTML=empty('请先登录','<button class="btn primary" data-action="login">立即登录</button>');return;}
 const u=state.user;$('#content').innerHTML=`<div class="panel profile"><p class="hint">姓名、专业、年级、技能简介会随队伍公开展示，用于组队沟通。报名快照保留提交时资料。</p><form id="profile-form">${field('name','姓名',u.name,'text','required maxlength="30"')}<div class="form-grid">${field('major','专业',u.major,'text','maxlength="60"')}${field('grade','年级',u.grade,'text','maxlength="30"')}</div>${area('skills','技能与个人简介',u.skills,'maxlength="500"')}<div class="error" role="alert"></div><button class="btn primary" type="submit">保存资料</button><button class="btn" type="button" data-action="password-change">修改密码</button></form></div>`;bindForm('#profile-form',async data=>{await api('/profile','PUT',data);state.user=(await api('/me')).user;await refresh();toast('个人资料已更新');});
}
function passwordForm(){showModal('修改密码',`<form id="password-form">${field('old_password','当前密码','','password','required autocomplete="current-password"')}${field('new_password','新密码','','password','required minlength="8" maxlength="128" autocomplete="new-password"')}<p class="form-note">8 至 128 位。修改后其他浏览器中的同账号登录失效，当前登录保留。</p>${formEnd('保存新密码')}`);bindForm('#password-form',async data=>{await api('/password','PUT',data);$('#modal').close();toast('密码已修改，其他登录已失效');});}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-page]');
 if(nav){state.page=nav.dataset.page;render();return;}
 const el=e.target.closest('[data-action]');if(!el)return;
 const action=el.dataset.action,id=Number(el.dataset.id);
 try {
  if(action==='close')$('#modal').close();
  if(action==='password-change')passwordForm();
  if(action==='login')login();
  if(action==='register')login(true);
  if(action==='account-fill'){
   $('#auth-form [name=username]').value=el.dataset.user;
   $('#auth-form [name=password]').value='Demo123456';
  }
  if(action==='logout'){await api('/logout','POST',{});state.user=null;await refresh();toast('已退出登录');}
  if(action==='competition-detail')competitionDetail(id);
  if(action==='competition-new')await competitionForm();
  if(action==='competition-edit')await competitionForm(id);
 } catch(err){toast(err.message);}
});
(async()=>{try{state.user=(await api('/me')).user;await refresh();}catch(err){$('#content').innerHTML=empty('暂时无法连接服务',esc(err.message)+'，请确认服务器已启动，然后刷新页面。');}})();
