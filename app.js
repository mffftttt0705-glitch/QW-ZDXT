
(function () {
  const K = { token: 'qw_ctrl_token', api: 'qw_ctrl_api', user: 'qw_ctrl_user', bg: 'qw_ctrl_bg' };
  let token = localStorage.getItem(K.token) || '';
  let apiBase = (localStorage.getItem(K.api) || '').replace(/\/$/, '');
  let me = null;
  try { me = JSON.parse(localStorage.getItem(K.user) || 'null'); } catch (e) {}

  const titles = {
    dashboard: '总览', users: '用户管理', orders: '订单管理', recharges: '充值审核',
    withdrawals: '提现审核', diamond: '红钻操作', shops: '店铺', products: '商品',
    announce: '公告', d1: 'D1 数据库', b2: 'B2 图库', appearance: '外观背景', settings: '设置'
  };

  const $ = id => document.getElementById(id);
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show';
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.className = 'toast', 2800);
  }
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function apiUrl(path) {
    const p = path.startsWith('/') ? path : '/' + path;
    if (!apiBase) return (p.startsWith('/api') ? p : '/api' + p);
    return apiBase + (p.startsWith('/api') ? p : '/api' + p);
  }
  function fileUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/api/file/')) return apiUrl(path);
    if (path.startsWith('/')) return (apiBase || '') + path;
    return apiUrl('/file/' + path);
  }
  async function api(path, opt = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = token;
    if (opt.headers) Object.assign(headers, opt.headers);
    const res = await fetch(apiUrl(path), { ...opt, headers });
    if (!res.ok) {
      let m = '请求失败 (' + res.status + ')';
      try { const j = await res.json(); m = j.error || j.message || m; } catch (e) {}
      throw new Error(m);
    }
    const t = await res.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch (e) { return {}; }
  }
  function showModal(html) {
    $('modalRoot').innerHTML = '<div class="modal-mask" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>';
  }
  window.closeModal = () => { $('modalRoot').innerHTML = ''; };

  function applyBg() {
    const saved = localStorage.getItem(K.bg) || '';
    const layer = $('bgLayer');
    if (saved) {
      layer.style.backgroundImage = 'linear-gradient(rgba(8,10,18,.55), rgba(8,10,18,.7)), url("' + saved + '")';
      layer.style.backgroundSize = 'cover';
      layer.style.backgroundPosition = 'center';
    } else {
      layer.style.backgroundImage = '';
      layer.removeAttribute('style');
    }
  }
  applyBg();

  async function doLogin() {
    const base = ($('apiBaseInput').value || '').trim().replace(/\/$/, '');
    const username = ($('loginUser').value || '').trim();
    const password = ($('loginPass').value || '').trim();
    $('loginErr').textContent = '';
    if (!username || !password) { $('loginErr').textContent = '请填写账号密码'; return; }
    apiBase = base;
    localStorage.setItem(K.api, apiBase);
    $('loginBtn').disabled = true;
    try {
      const data = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (!data.user || data.user.role !== 'admin') throw new Error('仅管理员可登录');
      token = data.token; me = data.user;
      localStorage.setItem(K.token, token);
      localStorage.setItem(K.user, JSON.stringify(me));
      enterApp();
      toast('登录成功');
    } catch (e) {
      $('loginErr').textContent = e.message;
    } finally {
      $('loginBtn').disabled = false;
    }
  }
  window.doLogin = doLogin;

  function doLogout() {
    token = ''; me = null;
    localStorage.removeItem(K.token);
    localStorage.removeItem(K.user);
    $('appShell').classList.add('hidden');
    $('loginPage').classList.remove('hidden');
    $('apiBaseInput').value = apiBase;
  }
  window.doLogout = doLogout;

  function enterApp() {
    $('loginPage').classList.add('hidden');
    $('appShell').classList.remove('hidden');
    $('sideUser').textContent = (me && me.username) ? me.username + ' · admin' : 'admin';
    $('topApi').textContent = apiBase || location.origin;
    go('dashboard');
    checkHealth();
  }

  function go(name) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.p === name));
    $('pageTitle').textContent = titles[name] || name;
    const map = {
      dashboard: pageDashboard, users: pageUsers, orders: pageOrders, recharges: pageRecharges,
      withdrawals: pageWithdrawals, diamond: pageDiamond, shops: pageShops, products: pageProducts,
      announce: pageAnnounce, d1: pageD1, b2: pageB2, appearance: pageAppearance, settings: pageSettings
    };
    (map[name] || pageDashboard)();
  }
  window.go = go;

  async function checkHealth() {
    try {
      await api('/health');
      $('healthDot').className = 'dot on';
      $('healthText').textContent = 'API 正常';
      return true;
    } catch (e) {
      $('healthDot').className = 'dot off';
      $('healthText').textContent = 'API 异常';
      return false;
    }
  }

  function badgeStatus(st) {
    if (st === 'active' || st === 'approved') return '<span class="badge b-ok">正常</span>';
    if (st === 'pending') return '<span class="badge b-warn">待审</span>';
    if (st === 'banned' || st === 'rejected') return '<span class="badge b-danger">' + esc(st) + '</span>';
    return '<span class="badge b-muted">' + esc(st || '-') + '</span>';
  }
  function roleTxt(r) {
    return ({ admin:'管理员', boss:'老板', handler:'打手', dispatcher:'派单', service:'客服' })[r] || r || '-';
  }

  async function pageDashboard() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const [users, orders, recharges, withdrawals, shops, products, health] = await Promise.all([
        api('/admin/users').catch(() => []),
        api('/admin/orders').catch(() => []),
        api('/admin/recharges').catch(() => []),
        api('/admin/withdrawals').catch(() => []),
        api('/shops').catch(() => []),
        api('/admin/products').catch(() => []),
        checkHealth()
      ]);
      const u = [].concat(users||[]), o=[].concat(orders||[]), r=[].concat(recharges||[]),
            w=[].concat(withdrawals||[]), s=[].concat(shops||[]), p=[].concat(products||[]);
      box.innerHTML = `
        <div class="grid">
          <div class="stat"><div class="l">用户</div><div class="v">${u.length}</div></div>
          <div class="stat"><div class="l">待审用户</div><div class="v" style="color:#fde047">${u.filter(x=>x.status==='pending').length}</div></div>
          <div class="stat"><div class="l">订单</div><div class="v">${o.length}</div></div>
          <div class="stat"><div class="l">待审充值</div><div class="v" style="color:#fde047">${r.filter(x=>x.status==='pending').length}</div></div>
          <div class="stat"><div class="l">待审提现</div><div class="v" style="color:#fde047">${w.filter(x=>x.status==='pending').length}</div></div>
          <div class="stat"><div class="l">店铺</div><div class="v">${s.length}</div></div>
          <div class="stat"><div class="l">商品</div><div class="v">${p.length}</div></div>
          <div class="stat"><div class="l">API</div><div class="v" style="font-size:15px;margin-top:8px;">${health?'✅ 正常':'❌ 异常'}</div></div>
        </div>
        <div class="card">
          <div class="card-h">快捷入口</div>
          <div class="toolbar">
            <button class="btn btn-accent btn-sm" onclick="go('d1')">D1 数据库</button>
            <button class="btn btn-blue btn-sm" onclick="go('b2')">B2 图库</button>
            <button class="btn btn-ghost btn-sm" onclick="go('users')">用户</button>
            <button class="btn btn-ghost btn-sm" onclick="go('recharges')">充值</button>
            <button class="btn btn-ghost btn-sm" onclick="go('withdrawals')">提现</button>
            <button class="btn btn-ghost btn-sm" onclick="go('diamond')">红钻</button>
          </div>
        </div>`;
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }

  async function pageUsers() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      window._users = await api('/admin/users') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>用户（' + window._users.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageUsers()">刷新</button></div>' +
        '<div class="toolbar"><input class="fc" id="uq" placeholder="搜索" style="max-width:200px" oninput="filterUsers()" />' +
        '<select class="fc" id="uf" style="max-width:130px" onchange="filterUsers()"><option value="all">全部</option><option value="admin">管理员</option><option value="boss">老板</option><option value="handler">打手</option><option value="pending">待审核</option></select></div>' +
        '<div class="table-wrap" id="ut"></div></div>';
      filterUsers();
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageUsers = pageUsers;

  function filterUsers() {
    let list = window._users || [];
    const q = ($('uq')?.value || '').toLowerCase();
    const f = $('uf')?.value || 'all';
    if (f === 'pending') list = list.filter(u => u.status === 'pending');
    else if (f !== 'all') list = list.filter(u => u.role === f);
    if (q) list = list.filter(u => String(u.username||'').toLowerCase().includes(q) || String(u.id).includes(q));
    const el = $('ut'); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty">暂无数据</div>'; return; }
    el.innerHTML = '<table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>红钻</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      list.map(u => '<tr><td><code>' + esc(u.id) + '</code></td><td>' + esc(u.username) + '</td><td>' + roleTxt(u.role) + '</td><td>' + (u.diamond||0) + '</td><td>' + badgeStatus(u.status) + '</td><td class="actions">' +
        (u.status==='pending'?'<button class="btn btn-ok btn-sm" onclick="uAct(\'' + u.id + '\',\'approve\')">审核</button>':'') +
        (u.role!=='admin'?'<button class="btn btn-warn btn-sm" onclick="uAct(\'' + u.id + '\',\'ban\')">封禁</button>':'') +
        '<button class="btn btn-ghost btn-sm" onclick="uAct(\'' + u.id + '\',\'pwd\')">重置密码</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="uChangeId(\'' + u.id + '\')">改ID</button>' +
        '<button class="btn btn-danger btn-sm" onclick="uDel(\'' + u.id + '\',' + (u.role==='admin') + ')">删除</button></td></tr>'
      ).join('') + '</tbody></table>';
  }
  window.filterUsers = filterUsers;

  async function uAct(id, act) {
    try {
      if (act === 'approve') await api('/admin/users/'+id+'/approve', { method:'PUT' });
      else if (act === 'ban') await api('/admin/users/'+id+'/ban', { method:'PUT' });
      else if (act === 'pwd') { if (!confirm('重置密码？')) return; await api('/admin/users/'+id+'/reset-password', { method:'PUT' }); }
      toast('完成'); pageUsers();
    } catch (e) { toast(e.message); }
  }
  window.uAct = uAct;

  function uChangeId(id) {
    showModal('<h3>修改 ID</h3><p style="font-size:12px;color:var(--muted);margin-bottom:8px;">当前 ' + esc(id) + '</p><div class="fg"><label>新 6 位 ID</label><input class="fc" id="nid" maxlength="6" inputmode="numeric" /></div><div class="row-btns"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="doChangeId(\'' + id + '\')">确认</button></div>');
  }
  window.uChangeId = uChangeId;
  async function doChangeId(targetUserId) {
    const newId = $('nid')?.value?.trim();
    if (!newId) return toast('请输入');
    try {
      await api('/admin/user-id', { method:'PUT', body: JSON.stringify({ targetUserId, newId }) });
      closeModal(); toast('已修改'); pageUsers();
    } catch (e) { toast(e.message); }
  }
  window.doChangeId = doChangeId;

  function uDel(id, isAdmin) {
    if (isAdmin) {
      showModal('<h3>删除管理员</h3><div class="fg"><label>删除密码</label><input class="fc" id="dpwd" type="password" /></div><div class="row-btns"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-danger" onclick="doUDel(\'' + id + '\',1)">删除</button></div>');
      return;
    }
    if (confirm('确认删除 ' + id + '？')) doUDel(id, 0);
  }
  window.uDel = uDel;
  async function doUDel(id, isAdmin) {
    try {
      const opt = { method: 'DELETE' };
      if (isAdmin) {
        const pwd = $('dpwd')?.value || '';
        if (!pwd) return toast('请输入密码');
        opt.body = JSON.stringify({ admin_delete_password: pwd });
      }
      await api('/admin/users/' + id, opt);
      closeModal(); toast('已删除'); pageUsers();
    } catch (e) { toast(e.message); }
  }
  window.doUDel = doUDel;

  async function pageOrders() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const list = await api('/admin/orders') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>订单（' + list.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageOrders()">刷新</button></div><div class="table-wrap">' +
        (!list.length ? '<div class="empty">暂无</div>' : '<table><thead><tr><th>标题</th><th>价格</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
        list.slice(0,300).map(o => '<tr><td>' + esc(o.title||o.id) + '</td><td>' + (o.price||0) + '</td><td><span class="badge b-blue">' + esc(o.status) + '</span></td><td class="actions"><button class="btn btn-ghost btn-sm" onclick="ord(\'' + o.id + '\',\'cancel\')">取消</button><button class="btn btn-danger btn-sm" onclick="ord(\'' + o.id + '\',\'del\')">删除</button></td></tr>').join('') +
        '</tbody></table>') + '</div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageOrders = pageOrders;
  async function ord(id, a) {
    try {
      if (a === 'cancel') { if (!confirm('取消？')) return; await api('/admin/orders/'+id+'/cancel',{method:'PUT'}); }
      else { if (!confirm('删除？')) return; await api('/admin/orders/'+id,{method:'DELETE'}); }
      toast('完成'); pageOrders();
    } catch (e) { toast(e.message); }
  }
  window.ord = ord;

  async function pageRecharges() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const list = await api('/admin/recharges') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>充值（' + list.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageRecharges()">刷新</button></div><div class="table-wrap">' +
        (!list.length ? '<div class="empty">暂无</div>' : '<table><thead><tr><th>用户</th><th>金额</th><th>红钻</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
        list.map(r => '<tr><td>' + esc(r.username||r.user_id) + '</td><td>¥' + r.amount + '</td><td>' + r.diamond + '</td><td>' + badgeStatus(r.status) + '</td><td class="actions">' +
          (r.status==='pending'?'<button class="btn btn-ok btn-sm" onclick="rc(\'' + r.id + '\',\'approve\')">通过</button><button class="btn btn-warn btn-sm" onclick="rc(\'' + r.id + '\',\'reject\')">拒绝</button>':'') +
          '<button class="btn btn-danger btn-sm" onclick="rc(\'' + r.id + '\',\'del\')">删除</button></td></tr>').join('') + '</tbody></table>') + '</div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageRecharges = pageRecharges;
  async function rc(id, a) {
    try {
      if (a==='approve') await api('/admin/recharges/'+id+'/approve',{method:'PUT'});
      else if (a==='reject') await api('/admin/recharges/'+id+'/reject',{method:'PUT'});
      else { if(!confirm('删除？'))return; await api('/admin/recharges/'+id,{method:'DELETE'}); }
      toast('完成'); pageRecharges();
    } catch (e) { toast(e.message); }
  }
  window.rc = rc;

  async function pageWithdrawals() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const list = await api('/admin/withdrawals') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>提现（' + list.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageWithdrawals()">刷新</button></div><div class="table-wrap">' +
        (!list.length ? '<div class="empty">暂无</div>' : '<table><thead><tr><th>用户</th><th>数量</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
        list.map(w => '<tr><td>' + esc(w.username||w.user_id) + '</td><td>' + w.amount + '</td><td>' + badgeStatus(w.status) + '</td><td class="actions">' +
          (w.status==='pending'?'<button class="btn btn-ok btn-sm" onclick="wd(\'' + w.id + '\',\'approve\')">通过</button><button class="btn btn-warn btn-sm" onclick="wd(\'' + w.id + '\',\'reject\')">拒绝</button>':'') +
          '<button class="btn btn-danger btn-sm" onclick="wd(\'' + w.id + '\',\'del\')">删除</button></td></tr>').join('') + '</tbody></table>') + '</div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageWithdrawals = pageWithdrawals;
  async function wd(id, a) {
    try {
      if (a==='approve') await api('/admin/withdrawals/'+id+'/approve',{method:'PUT'});
      else if (a==='reject') await api('/admin/withdrawals/'+id+'/reject',{method:'PUT',body:'{}'});
      else { if(!confirm('删除？'))return; await api('/admin/withdrawals/'+id,{method:'DELETE'}); }
      toast('完成'); pageWithdrawals();
    } catch (e) { toast(e.message); }
  }
  window.wd = wd;

  function pageDiamond() {
    $('pageContent').innerHTML = '<div class="card"><div class="card-h">赠送红钻</div><div class="fg"><label>用户 ID</label><input class="fc" id="gUid" /></div><div class="fg"><label>数量</label><input class="fc" id="gAmt" type="number" min="1" /></div><button class="btn btn-ok" onclick="giftD()">赠送</button></div>' +
      '<div class="card"><div class="card-h">扣除红钻</div><div class="fg"><label>用户 ID</label><input class="fc" id="dUid" /></div><div class="fg"><label>数量</label><input class="fc" id="dAmt" type="number" min="1" /></div><div class="fg"><label>原因</label><input class="fc" id="dReason" /></div><button class="btn btn-danger" onclick="deductD()">扣除</button></div>';
  }
  async function giftD() {
    try {
      const r = await api('/admin/gift',{method:'POST',body:JSON.stringify({targetUserId:$('gUid').value.trim(),amount:parseInt($('gAmt').value,10)})});
      toast(r.message||'成功');
    } catch(e){ toast(e.message); }
  }
  window.giftD = giftD;
  async function deductD() {
    if (!confirm('确认扣除？')) return;
    try {
      const r = await api('/admin/deduct',{method:'POST',body:JSON.stringify({targetUserId:$('dUid').value.trim(),amount:parseInt($('dAmt').value,10),reason:$('dReason').value.trim()})});
      toast(r.message||'成功');
    } catch(e){ toast(e.message); }
  }
  window.deductD = deductD;

  async function pageShops() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const list = await api('/shops') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>店铺（' + list.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageShops()">刷新</button></div><div class="table-wrap"><table><thead><tr><th>名称</th><th>状态</th><th>拥有者</th></tr></thead><tbody>' +
        list.map(s => '<tr><td>' + esc(s.name) + '</td><td>' + badgeStatus(s.status) + '</td><td><code>' + esc(s.owner_id||'-') + '</code></td></tr>').join('') +
        '</tbody></table></div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageShops = pageShops;

  async function pageProducts() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const list = await api('/admin/products') || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>商品（' + list.length + '）</span><button class="btn btn-ghost btn-sm" onclick="pageProducts()">刷新</button></div><div class="table-wrap"><table><thead><tr><th>标题</th><th>价格</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
        list.map(p => '<tr><td>' + esc(p.title) + '</td><td>' + p.price + '</td><td>' + esc(p.status||'-') + '</td><td class="actions">' +
          '<button class="btn btn-ghost btn-sm" onclick="pd(\'' + p.id + '\',\'unshelf\')">下架</button>' +
          '<button class="btn btn-ok btn-sm" onclick="pd(\'' + p.id + '\',\'reshelf\')">上架</button>' +
          '<button class="btn btn-danger btn-sm" onclick="pd(\'' + p.id + '\',\'del\')">删除</button></td></tr>').join('') +
        '</tbody></table></div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageProducts = pageProducts;
  async function pd(id, a) {
    try {
      if (a==='unshelf') await api('/admin/products/'+id+'/unshelf',{method:'PUT'});
      else if (a==='reshelf') await api('/admin/products/'+id+'/reshelf',{method:'PUT'});
      else { if(!confirm('删除？'))return; await api('/admin/products/'+id,{method:'DELETE'}); }
      toast('完成'); pageProducts();
    } catch(e){ toast(e.message); }
  }
  window.pd = pd;

  async function pageAnnounce() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const data = await api('/announce');
      box.innerHTML = '<div class="card"><div class="card-h">公告</div><textarea class="fc" id="ann" rows="6">' + esc(data.content||'') + '</textarea><div style="margin-top:10px"><button class="btn btn-accent" onclick="saveAnn()">保存</button></div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.pageAnnounce = pageAnnounce;
  async function saveAnn() {
    try { await api('/admin/announce',{method:'PUT',body:JSON.stringify({content:$('ann').value})}); toast('已保存'); }
    catch(e){ toast(e.message); }
  }
  window.saveAnn = saveAnn;

  async function pageD1() {
    const box = $('pageContent');
    box.innerHTML = '<div class="empty">加载表列表…</div>';
    try {
      const tables = await api('/admin/db/tables');
      window._dbTables = tables || [];
      box.innerHTML = '<div class="card"><div class="card-h"><span>D1 全库浏览</span><button class="btn btn-ghost btn-sm" onclick="pageD1()">刷新表</button></div><div class="db-layout">' +
        '<div class="table-list" id="dbTableList">' +
        (window._dbTables.map(t => '<div class="table-item" onclick="loadDbTable(\'' + t.name + '\',this)"><span>' + esc(t.name) + '</span><span class="badge b-muted">' + t.count + '</span></div>').join('') || '<div class="empty">无表</div>') +
        '</div><div><div class="toolbar"><input class="fc" id="sqlInput" placeholder="SELECT * FROM users LIMIT 20" style="flex:1;min-width:180px" />' +
        '<button class="btn btn-blue btn-sm" onclick="runSql(false)">执行 SELECT</button>' +
        '<button class="btn btn-danger btn-sm" onclick="runSql(true)">执行写操作</button></div>' +
        '<div class="table-wrap" id="dbRows"><div class="empty">点击左侧表名，或输入 SQL</div></div></div></div></div>';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '<br><small>请部署最新 [[path]].js</small></div>'; }
  }
  window.pageD1 = pageD1;

  async function loadDbTable(name, el) {
    document.querySelectorAll('.table-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
    const box = $('dbRows');
    box.innerHTML = '<div class="empty">加载…</div>';
    try {
      const data = await api('/admin/db/table/' + encodeURIComponent(name) + '?limit=100&offset=0');
      renderDbResult(data.columns, data.rows, name, data.total);
      if ($('sqlInput')) $('sqlInput').value = 'SELECT * FROM ' + name + ' LIMIT 100';
    } catch (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }
  window.loadDbTable = loadDbTable;

  function renderDbResult(columns, rows, tableName, total) {
    const box = $('dbRows');
    if (!rows || !rows.length) { box.innerHTML = '<div class="empty">无数据</div>'; return; }
    const cols = columns && columns.length ? columns : Object.keys(rows[0] || {});
    const idCol = cols.includes('id') ? 'id' : cols[0];
    box.innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">' + (tableName ? esc(tableName) + ' · ' : '') + '共 ' + (total ?? rows.length) + ' 行 · 显示 ' + rows.length + '</div><table><thead><tr>' +
      cols.map(c => '<th>' + esc(c) + '</th>').join('') + '<th>操作</th></tr></thead><tbody>' +
      rows.map(row => '<tr>' + cols.map(c => '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(String(row[c]??'')) + '">' + esc(String(row[c]??'')) + '</td>').join('') +
        '<td>' + (tableName && row[idCol]!=null ? '<button class="btn btn-danger btn-sm" onclick="delDbRow(\'' + esc(tableName) + '\',\'' + esc(String(row[idCol])) + '\',\'' + esc(idCol) + '\')">删行</button>' : '') + '</td></tr>').join('') +
      '</tbody></table>';
  }

  async function runSql(isWrite) {
    const sql = $('sqlInput')?.value?.trim();
    if (!sql) return toast('请输入 SQL');
    try {
      const body = { sql };
      if (isWrite) {
        if (!confirm('确认执行写操作？此操作可能不可恢复')) return;
        body.confirm = 'YES';
      }
      const r = await api('/admin/db/query', { method: 'POST', body: JSON.stringify(body) });
      if (r.results) {
        const cols = r.results[0] ? Object.keys(r.results[0]) : [];
        renderDbResult(cols, r.results, '', r.results.length);
      } else {
        toast(r.message || '执行成功');
        pageD1();
      }
    } catch (e) { toast(e.message); }
  }
  window.runSql = runSql;

  async function delDbRow(table, id, idCol) {
    if (!confirm('删除 ' + table + '.' + idCol + '=' + id + '？')) return;
    try {
      await api('/admin/db/row', { method: 'DELETE', body: JSON.stringify({ table, id, id_column: idCol }) });
      toast('已删除');
      loadDbTable(table);
    } catch (e) { toast(e.message); }
  }
  window.delDbRow = delDbRow;

  let b2Token = null;
  async function pageB2() {
    const box = $('pageContent');
    box.innerHTML = '<div class="card"><div class="card-h"><span>B2 全部文件 / 图片</span><div class="toolbar" style="margin:0"><input class="fc" id="b2Prefix" placeholder="前缀过滤" style="width:140px" /><button class="btn btn-ghost btn-sm" onclick="loadB2(true)">刷新</button></div></div>' +
      '<div id="b2Grid" class="img-grid"><div class="empty">加载中…</div></div>' +
      '<div style="margin-top:12px;text-align:center"><button class="btn btn-ghost btn-sm hidden" id="b2More" onclick="loadB2(false)">加载更多</button></div></div>';
    b2Token = null;
    loadB2(true);
  }
  window.pageB2 = pageB2;

  async function loadB2(reset) {
    const grid = $('b2Grid');
    if (reset) { b2Token = null; grid.innerHTML = '<div class="empty">加载中…</div>'; }
    try {
      const prefix = $('b2Prefix')?.value?.trim() || '';
      let path = '/admin/b2/list?limit=100';
      if (prefix) path += '&prefix=' + encodeURIComponent(prefix);
      if (!reset && b2Token) path += '&token=' + encodeURIComponent(b2Token);
      const data = await api(path);
      const files = data.files || [];
      b2Token = data.next_token || null;
      const more = $('b2More');
      if (more) more.classList.toggle('hidden', !data.truncated || !b2Token);
      if (reset) grid.innerHTML = '';
      if (!files.length && reset) { grid.innerHTML = '<div class="empty">暂无文件（或 B2 未配置）</div>'; return; }
      files.forEach(f => {
        const div = document.createElement('div');
        div.className = 'img-card';
        const src = fileUrl(f.url || f.key);
        const keyEsc = esc(f.key);
        const srcEsc = esc(src);
        if (f.is_image) {
          div.innerHTML = '<img src="' + srcEsc + '" loading="lazy" onclick="previewImg(\'' + srcEsc + '\')" onerror="this.style.opacity=.3" />';
        } else {
          div.innerHTML = '<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:28px;background:rgba(0,0,0,.3)">📄</div>';
        }
        div.innerHTML += '<div class="ops"><button class="btn btn-ghost btn-sm" onclick="window.open(\'' + srcEsc + '\',\'_blank\')">开</button>' +
          '<button class="btn btn-danger btn-sm" onclick="delB2(\'' + keyEsc + '\')">删</button></div>' +
          '<div class="meta">' + keyEsc + '<br>' + (f.size ? (Math.round(f.size/1024)+' KB') : '') + '</div>';
        grid.appendChild(div);
      });
    } catch (e) {
      grid.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
    }
  }
  window.loadB2 = loadB2;

  function previewImg(src) {
    showModal('<h3>预览</h3><img src="' + esc(src) + '" style="width:100%;border-radius:10px;max-height:60vh;object-fit:contain" /><div class="row-btns"><button class="btn btn-ghost" onclick="closeModal()">关闭</button><a class="btn btn-blue" href="' + esc(src) + '" target="_blank">新窗口打开</a></div>');
  }
  window.previewImg = previewImg;

  async function delB2(key) {
    if (!confirm('删除 B2 文件？\n' + key)) return;
    try {
      await api('/admin/b2/delete', { method: 'POST', body: JSON.stringify({ key }) });
      toast('已删除');
      loadB2(true);
    } catch (e) { toast(e.message); }
  }
  window.delB2 = delB2;

  function pageAppearance() {
    const cur = localStorage.getItem(K.bg) || '';
    $('pageContent').innerHTML = '<div class="card"><div class="card-h">液态玻璃 · 可替换背景</div>' +
      '<p style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5">支持图片 URL。留空恢复默认渐变。界面为 Cloudflare 控制台式侧栏 + 毛玻璃卡片。</p>' +
      '<div class="fg"><label>背景图 URL</label><input class="fc" id="bgUrl" value="' + esc(cur) + '" placeholder="https://... 或 /api/file/xxx.jpg" /></div>' +
      '<div class="toolbar"><button class="btn btn-accent" onclick="saveBg()">应用背景</button><button class="btn btn-ghost" onclick="clearBg()">恢复默认</button></div>' +
      '<div class="toolbar" style="margin-top:8px">' +
      '<button class="btn btn-ghost btn-sm" onclick="presetBg(\'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600\')">太空</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="presetBg(\'https://images.unsplash.com/photo-1557683316-973673baf926?w=1600\')">紫雾</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="presetBg(\'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1600\')">渐变</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="presetBg(\'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600\')">山景</button></div></div>';
  }
  window.pageAppearance = pageAppearance;
  function presetBg(u) { $('bgUrl').value = u; saveBg(); }
  window.presetBg = presetBg;
  function saveBg() {
    const u = ($('bgUrl')?.value || '').trim();
    if (u) localStorage.setItem(K.bg, u); else localStorage.removeItem(K.bg);
    applyBg();
    toast('背景已更新');
  }
  window.saveBg = saveBg;
  function clearBg() {
    localStorage.removeItem(K.bg);
    if ($('bgUrl')) $('bgUrl').value = '';
    applyBg();
    toast('已恢复默认');
  }
  window.clearBg = clearBg;

  function pageSettings() {
    $('pageContent').innerHTML = '<div class="card"><div class="card-h">API 连接</div><div class="fg"><label>主站地址</label><input class="fc" id="setApi" value="' + esc(apiBase) + '" placeholder="https://主站" /></div>' +
      '<div class="toolbar"><button class="btn btn-accent" onclick="saveApi()">保存</button><button class="btn btn-ghost" onclick="checkHealth().then(h=>toast(h?\'API 正常\':\'API 异常\'))">测试</button></div></div>' +
      '<div class="card"><div class="card-h">权限说明</div><p style="font-size:13px;color:var(--muted);line-height:1.7">· 仅 <b>admin</b> 可登录<br>· D1：浏览全部表、SQL、删行<br>· B2：列表、预览、删除<br>· 业务全权限<br>· 删除管理员密码：<code>@#555aaa</code></p></div>';
  }
  window.pageSettings = pageSettings;
  function saveApi() {
    apiBase = ($('setApi').value || '').trim().replace(/\/$/, '');
    localStorage.setItem(K.api, apiBase);
    $('topApi').textContent = apiBase || location.origin;
    toast('已保存');
    checkHealth();
  }
  window.saveApi = saveApi;

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('loginPage').classList.contains('hidden')) doLogin();
  });

  $('apiBaseInput').value = apiBase;
  if (token && me && me.role === 'admin') enterApp();
  else {
    $('loginPage').classList.remove('hidden');
    $('appShell').classList.add('hidden');
  }
})();
