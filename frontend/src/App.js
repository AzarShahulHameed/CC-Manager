import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const API = process.env.REACT_APP_API || 'https://cc-manager-8sgi.onrender.com/api';

// ─── Auth helpers ───────────────────────────────────────────────
function getToken() { return localStorage.getItem('cc_token'); }
function setToken(t) { if (t) localStorage.setItem('cc_token', t); else localStorage.removeItem('cc_token'); }

// Wraps fetch: attaches the JWT, and force-logs-out on 401 so a dead/expired
// token never just sits there silently failing every request.
async function authFetch(url, opts = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (res.status === 401) {
    setToken(null);
    localStorage.removeItem('cc_user');
    window.location.reload();
    throw new Error('Session expired');
  }
  return res;
}

// ─── Office / currency config (was hardcoded COUNTRIES — now comes from the DB) ──
const CURRENCY_SYMBOLS = { AED: 'AED', INR: '₹' };
let _office = { id: null, code: 'UAE', name: 'UAE Office', currency: 'AED', locale: 'en-AE', symbol: 'AED', banks: [] };
function getCountry() { return _office; }
function setOfficeConfig(cfg) { _office = { ..._office, ...cfg, symbol: CURRENCY_SYMBOLS[cfg.currency] || cfg.currency }; }

// ─── Utilities ───────────────────────────────────────────────
function maskCard(num) {
  if (!num) return '•••• •••• •••• ••••';
  const c = num.replace(/\s/g, '');
  return `${c.slice(0,4)} •••• •••• ${c.slice(-4)}`;
}
function fmtCurrency(val) {
  const cfg = getCountry();
  return new Intl.NumberFormat(cfg.locale, { style:'currency', currency:cfg.currency, maximumFractionDigits:0 }).format(val||0);
}
function getDaysUntil(dayOfMonth, fromDate) {
  const ref = fromDate ? new Date(fromDate) : new Date();
  const refDay = ref.getDate();
  if (dayOfMonth === refDay) return 0;
  if (dayOfMonth > refDay) return dayOfMonth - refDay;
  const next = new Date(ref.getFullYear(), ref.getMonth() + 1, dayOfMonth);
  return Math.round((next - ref) / 86400000);
}
function urgencyColor(days) {
  if (days <= 3) return '#f43f5e';
  if (days <= 7) return '#f59e0b';
  return '#10b981';
}
const BANK_COLORS = {
  'emirates nbd':'#c8a94a','adcb':'#0052A5','fab':'#1a5c38',
  'mashreq':'#c0392b','hsbc':'#aa0000','standard chartered':'#005f8a',
  'citibank':'#003B8E','rak bank':'#6b0f0f','dib':'#00573F',
};
function getBankColor(n) {
  const l=(n||'').toLowerCase();
  for(const [k,c] of Object.entries(BANK_COLORS)) if(l.includes(k)) return c;
  return '#4361ee';
}
const CHART_COLORS=['#4361ee','#f59e0b','#10b981','#7048e8','#f43f5e','#0ea5e9'];

// ─── Logo mark — an actual card, not an abstract seal ─────────
function CardMark({ size = 24 }) {
  return (
    <svg width={size} height={size * 0.74} viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="1.5" width="37" height="27" rx="4" stroke="currentColor" strokeWidth="2.2"/>
      <rect x="1.5" y="8" width="37" height="5.5" fill="currentColor"/>
      <rect x="5.5" y="19.5" width="13" height="3" rx="1.2" fill="currentColor" opacity=".85"/>
    </svg>
  );
}

// ─── Login Page (real backend auth) ────────────────────────────
function LoginPage({ onLogin, logo }) {
  const [form, setForm] = useState({ username:'', password:'' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid username or password'); return; }
      onLogin(data.user, data.token);
    } catch (err) {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-right">
        <div className="login-form-wrap">
          <div className="login-brand">
            <div className="login-logo-wrap">
              {logo ? <img src={logo} alt="logo" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'13px'}} /> : <CardMark size={26}/>}
            </div>
            <div className="login-brand-name">CC Manager</div>
            <div className="login-brand-sub">Executive Credit Card Dashboard</div>
          </div>
          <div className="login-title">Welcome back</div>
          <div className="login-subtitle">Sign in to your CC Manager account</div>
          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">⚠️ {error}</div>}
            <div className="login-field">
              <label>Username</label>
              <input className="login-input" type="text" placeholder="Enter username"
                value={form.username} onChange={e => setForm(f=>({...f,username:e.target.value}))} required autoFocus />
            </div>
            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <input className="login-input" type={showPw?'text':'password'} placeholder="Enter password"
                  value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} required />
                <button type="button" className="login-eye" onClick={() => setShowPw(p=>!p)}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? '⏳ Signing in...' : '→ Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────
function BarChart({ data, keys, colors }) {
  if (!data || data.length === 0) return <div className="empty-state">No spending data yet.</div>;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => d[k]||0)), 1);
  return (
    <div className="bar-chart">
      <div className="bar-chart-area">
        {data.map((d, i) => (
          <div key={i} className="bar-group">
            <div className="bars">
              {keys.map((k, ki) => (
                <div key={k} className="bar-wrap" title={`${k}: ${getCountry().symbol} ${(d[k]||0).toLocaleString()}`}>
                  <div className="bar" style={{ height:`${((d[k]||0)/maxVal)*100}%`, background:colors[ki%colors.length] }} />
                </div>
              ))}
            </div>
            <div className="bar-label">{d.month?.slice(5)}</div>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        {keys.map((k, i) => (
          <div key={k} className="legend-item">
            <span className="legend-dot" style={{ background:colors[i%colors.length] }} />
            <span>{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────
function DonutChart({ cards }) {
  if (!cards || cards.length===0) return null;
  const total = cards.reduce((s,c)=>s+Number(c.credit_limit||0),0);
  let cum=0; const sz=160, r=58, circ=2*Math.PI*r;
  return (
    <div className="donut-wrap">
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{transform:'rotate(-90deg)'}}>
        {cards.map((c,i)=>{
          const pct=c.credit_limit/total, dash=pct*circ, offset=circ-cum*circ; cum+=pct;
          return <circle key={c.id||i} cx={sz/2} cy={sz/2} r={r} fill="none" stroke={c.color||getBankColor(c.bank_name)} strokeWidth="26" strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={offset} />;
        })}
      </svg>
      <div className="donut-center">
        <div className="donut-label">{cards.length}</div>
        <div className="donut-sub">Cards</div>
      </div>
    </div>
  );
}

// ─── Credit Card Visual ───────────────────────────────────────
function CreditCardVisual({ card, onClick, selected }) {
  const color = card.color || getBankColor(card.bank_name);
  const util = card.credit_limit>0 ? (card.outstanding_balance/card.credit_limit)*100 : 0;
  const dDue = getDaysUntil(card.due_date);
  return (
    <div className={`credit-card ${selected?'selected':''}`}
      style={{'--card-color':color}} onClick={()=>onClick&&onClick(card)}>
      <div className="card-shine"/>
      <div className="card-top">
        <div className="card-bank">{card.bank_name}</div>
        <div className="card-chip"><div className="chip-lines"/></div>
      </div>
      <div className="card-number">{maskCard(card.card_number)}</div>
      <div className="card-bottom">
        <div className="card-field"><span className="card-label">Holder</span><span className="card-value">{card.holder_name||'—'}</span></div>
        <div className="card-field"><span className="card-label">Due</span><span className="card-value">{card.due_date}th</span></div>
        <div className="card-field"><span className="card-label">Used</span>
          <span className="card-value" style={{color:util>80?'#fca5a5':util>60?'#fcd34d':'#86efac'}}>
            {Math.round(util)}%
          </span>
        </div>
      </div>
      <div className="card-due-badge" style={{background:urgencyColor(dDue)}}>
        {dDue===0?'DUE TODAY':`Due ${dDue}d`}
      </div>
    </div>
  );
}

// ─── Inline Balance ───────────────────────────────────────────
function InlineBalance({ card, onUpdated }) {
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(card.outstanding_balance);
  const [displayVal,setDisplayVal]=useState(card.outstanding_balance);
  const ref=useRef();

  // Once the background refresh (onUpdated) completes and a new `card` prop
  // arrives, sync back to it — this is the authoritative value.
  useEffect(()=>{ setDisplayVal(card.outstanding_balance); },[card.outstanding_balance]);

  const save=async()=>{
    const newVal = parseFloat(val)||0;
    setDisplayVal(newVal);   // show it immediately, don't wait on the network
    setEditing(false);
    try {
      await authFetch(`${API}/cards/${card.id}/balance`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({outstanding_balance:newVal})});
      onUpdated();            // background reconcile for totals/utilization elsewhere on the page
    } catch {
      setDisplayVal(card.outstanding_balance); // revert if the save actually failed
    }
  };
  useEffect(()=>{if(editing&&ref.current)ref.current.focus();},[editing]);
  if(editing) return(
    <div className="inline-edit">
      <span className="inline-currency">{getCountry().symbol}</span>
      <input ref={ref} type="number" value={val} onChange={e=>setVal(e.target.value)}
        onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEditing(false);}} className="inline-input"/>
    </div>
  );
  return(
    <span className="editable-balance" onClick={()=>{setVal(card.outstanding_balance);setEditing(true);}} title="Click to edit">
      {fmtCurrency(displayVal)}<span className="edit-icon">✎</span>
    </span>
  );
}

// ─── Card Modal ───────────────────────────────────────────────
// `offices` + `bankLists` let an admin pick which office a card belongs to.
// Non-admins never see the office field — the backend pins it to their office anyway.
function CardModal({ card, onClose, onSave, user, offices, bankLists, defaultOfficeId }) {
  const [form,setForm]=useState(card||{
    card_number:'',holder_name:'',bank_name:'',credit_limit:'',outstanding_balance:'0',
    billing_date:'',due_date:'',sms_phone:'',notify_email:'',color:'',
    office_id: defaultOfficeId || ''
  });
  const [saving,setSaving]=useState(false);
  const hc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const rc=form.color||getBankColor(form.bank_name);
  const isAdmin = user.role === 'admin';

  const handleSubmit=async e=>{
    e.preventDefault();setSaving(true);
    try{
      const res=await authFetch(card?`${API}/cards/${card.id}`:`${API}/cards`,{method:card?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,color:rc})});
      if(!res.ok) { const d=await res.json().catch(()=>({})); throw new Error(d.error||'Save failed'); }
      onSave();
    }catch(err){alert('Error: '+err.message);}finally{setSaving(false);}
  };

  const effectiveOfficeId = isAdmin ? (form.office_id || defaultOfficeId) : user.office_id;
  const banks = bankLists[effectiveOfficeId] || [];

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>{card?'✏️ Edit Card':'➕ Add New Card'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{marginBottom:'22px'}}>
          <CreditCardVisual card={{...form,outstanding_balance:parseFloat(form.outstanding_balance)||0,credit_limit:parseFloat(form.credit_limit)||1,color:rc}}/>
        </div>
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-grid">
            {isAdmin && !card && (
              <div className="form-group"><label>Office</label>
                <select name="office_id" value={form.office_id} onChange={hc} required>
                  <option value="">Select Office</option>
                  {offices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label>Bank Name</label>
              <select name="bank_name" value={form.bank_name} onChange={hc} required disabled={isAdmin && !card && !form.office_id}>
                <option value="">{isAdmin && !card && !form.office_id ? 'Select office first' : 'Select Bank'}</option>
                {banks.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Card Number</label>
              <input name="card_number" value={form.card_number} onChange={hc} placeholder="1234 5678 9012 3456" required/>
            </div>
            <div className="form-group"><label>Card Holder Name</label>
              <input name="holder_name" value={form.holder_name} onChange={hc} placeholder="Full name" required/>
            </div>
            <div className="form-group"><label>Credit Limit ({getCountry().symbol})</label>
              <input name="credit_limit" type="number" value={form.credit_limit} onChange={hc} placeholder="50000" required/>
            </div>
            <div className="form-group"><label>Outstanding Balance ({getCountry().symbol})</label>
              <input name="outstanding_balance" type="number" value={form.outstanding_balance} onChange={hc} placeholder="0"/>
            </div>
            <div className="form-group"><label>Billing Date (1–31)</label>
              <input name="billing_date" type="number" min="1" max="31" value={form.billing_date} onChange={hc} placeholder="e.g. 1" required/>
            </div>
            <div className="form-group"><label>Due Date (1–31)</label>
              <input name="due_date" type="number" min="1" max="31" value={form.due_date} onChange={hc} placeholder="e.g. 25" required/>
            </div>
            <div className="form-group"><label>WhatsApp Number</label>
              <input name="sms_phone" value={form.sms_phone} onChange={hc} placeholder="+971501234567"/>
            </div>
            <div className="form-group"><label>Alert Email</label>
              <input name="notify_email" type="email" value={form.notify_email||''} onChange={hc} placeholder="finance@cat-cons.com"/>
            </div>
            <div className="form-group"><label>Card Color</label>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input name="color" value={rc} onChange={hc} style={{flex:1}}/>
                <input type="color" value={rc} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
                  style={{width:'40px',height:'40px',border:'none',borderRadius:'8px',cursor:'pointer'}}/>
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':(card?'Save Changes':'Add Card')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Transaction Modal ────────────────────────────────────────
// ─── Replace Card Modal (lost/expired/reissued card) ──────────
function ReplaceCardModal({ card, onClose, onSave, bankLists }) {
  const [form, setForm] = useState({
    card_number: '', bank_name: card.bank_name, credit_limit: card.credit_limit,
    billing_date: card.billing_date, due_date: card.due_date,
    sms_phone: card.sms_phone || '', notify_email: card.notify_email || '', color: card.color
  });
  const [saving, setSaving] = useState(false);
  const banks = bankLists[card.office_id] || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch(`${API}/cards/${card.id}/replace`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Replace failed');
      onSave();
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2>🔄 Replace Card</h2><button className="close-btn" onClick={onClose}>✕</button></div>
        <p className="modal-desc">
          For a lost, expired, or reissued card. The old card ({card.bank_name} {maskCard(card.card_number)}) gets archived —
          its transaction history stays intact — and its outstanding balance ({fmtCurrency(card.outstanding_balance)}) moves to
          the new card as a logged transaction, not a silent overwrite.
        </p>
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-grid">
            <div className="form-group"><label>New Card Number</label>
              <input value={form.card_number} onChange={e=>setForm(f=>({...f,card_number:e.target.value}))} placeholder="1234 5678 9012 3456" required/>
            </div>
            <div className="form-group"><label>Bank</label>
              <select value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))} required>
                {banks.map(b=><option key={b}>{b}</option>)}
                {!banks.includes(form.bank_name) && <option>{form.bank_name}</option>}
              </select>
            </div>
            <div className="form-group"><label>Credit Limit</label>
              <input type="number" value={form.credit_limit} onChange={e=>setForm(f=>({...f,credit_limit:e.target.value}))} required/>
            </div>
            <div className="form-group"><label>Billing Date</label>
              <input type="number" min="1" max="31" value={form.billing_date} onChange={e=>setForm(f=>({...f,billing_date:e.target.value}))} required/>
            </div>
            <div className="form-group"><label>Due Date</label>
              <input type="number" min="1" max="31" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} required/>
            </div>
            <div className="form-group"><label>WhatsApp Number</label>
              <input value={form.sms_phone} onChange={e=>setForm(f=>({...f,sms_phone:e.target.value}))}/>
            </div>
            <div className="form-group"><label>Alert Email</label>
              <input type="email" value={form.notify_email} onChange={e=>setForm(f=>({...f,notify_email:e.target.value}))}/>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Replacing...':'Replace Card'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TransactionModal({ cards, onClose, onSave }) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ card_id:'', amount:'', description:'', type:'charge', transaction_date: todayDate });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        card_id: Number(form.card_id), amount: Number(form.amount),
        description: form.description, type: form.type, transaction_date: form.transaction_date
      };
      const res = await authFetch(`${API}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||'Failed to add transaction'); }
      await onSave();
    } catch (err) { alert('Error: ' + err.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>💳 Add Transaction</h2><button className="close-btn" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-group">
            <label>Card</label>
            <select value={form.card_id} onChange={e => setForm(f => ({ ...f, card_id: e.target.value }))} required>
              <option value="">Select Card</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.bank_name} — ****{c.card_number.slice(-4)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="charge">💳 Charge</option>
              <option value="payment">✅ Payment</option>
              <option value="adjustment">⚖️ Adjustment</option>
            </select>
          </div>
          <div className="form-group">
            <label>Amount ({getCountry().symbol})</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required/>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Hotel, Flight, Dinner"/>
          </div>
          <div className="form-group">
            <label>Transaction Date</label>
            <input type="date" value={form.transaction_date} max={new Date().toISOString().slice(0,10)} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} required/>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Transaction</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Inline Transaction Edit Row ─────────────────────────────
function InlineTxnEdit({ txn, cards, onSave, onCancel }) {
  const [form, setForm] = useState({
    amount: txn.amount, description: txn.description || '', type: txn.type, card_id: txn.card_id,
    transaction_date: txn.transaction_date ? new Date(txn.transaction_date).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)
  });
  const handleSave = async () => {
    try {
      const res = await authFetch(`${API}/transactions/${txn.id}`,{
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({...form, amount:parseFloat(form.amount), card_id:Number(form.card_id)})
      });
      if(!res.ok) { const d=await res.json().catch(()=>({})); throw new Error(d.error||'Update failed'); }
      onSave();
    } catch(err){ alert('Error: '+err.message); }
  };
  return (
    <tr style={{background:'#eef1ff'}}>
      <td><input type="date" value={form.transaction_date} max={new Date().toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,transaction_date:e.target.value}))} className="txn-inline-input" style={{width:'130px'}}/></td>
      <td><select value={form.card_id} onChange={e=>setForm(f=>({...f,card_id:e.target.value}))} className="txn-inline-input">
        {cards.map(c=><option key={c.id} value={c.id}>{c.bank_name} ****{c.card_number.slice(-4)}</option>)}
      </select></td>
      <td><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="txn-inline-input" placeholder="Description" style={{width:'140px'}}/></td>
      <td><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="txn-inline-input">
        <option value="charge">Charge</option><option value="payment">Payment</option><option value="adjustment">Adjustment</option>
      </select></td>
      <td><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="txn-inline-input" style={{width:'100px',textAlign:'right'}}/></td>
      <td style={{textAlign:'center',whiteSpace:'nowrap'}}>
        <button onClick={handleSave} title="Save" className="icon-btn success" style={{fontSize:'18px'}}>✅</button>
        <button onClick={onCancel} title="Cancel" className="icon-btn" style={{fontSize:'18px'}}>✕</button>
      </td>
    </tr>
  );
}

// ─── Best Card Advisor Modal ─────────────────────
function RecommendModal({ onClose, officeParam }) {
  const [amount,setAmount]=useState('');
  const today=new Date().toISOString().slice(0,10);
  const [payDate,setPayDate]=useState(today);
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);

  const handleCheck=async()=>{
    if(!amount) return;
    setLoading(true);
    try{
      const data=await authFetch(`${API}/recommend?amount=${amount}&date=${payDate}${officeParam}`).then(r=>r.json());
      setResults(data);
    }catch(err){alert('Error: '+err.message);}
    finally{setLoading(false);}
  };

  const formatPayDate=(d)=>{
    if(!d) return '';
    return new Date(d).toLocaleDateString(getCountry().locale,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  };

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2>🎯 Best Card Advisor</h2><button className="close-btn" onClick={onClose}>✕</button></div>
        <p className="modal-desc">
          Choose the <strong>payment date</strong> and <strong>amount</strong>. The system will analyze your billing cycles relative to that specific date and recommend the optimal card — maximizing your interest-free window.
        </p>
        <div className="advisor-inputs">
          <div className="advisor-field">
            <label>Payment Amount ({getCountry().symbol})</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleCheck()}
              placeholder="Enter amount" className="advisor-date-input" style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:'18px'}}/>
          </div>
          <div className="advisor-field">
            <label>Payment Date</label>
            <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} min={today} className="advisor-date-input"/>
          </div>
          <button className="btn btn-primary" onClick={handleCheck} disabled={loading} style={{height:'50px',alignSelf:'flex-end'}}>
            {loading?'⏳ Analyzing..':'🔍 Analyze'}
          </button>
        </div>
        {payDate && (
          <div className="advisor-explain">
            📅 Analyzing card fitness for a payment on <strong>{formatPayDate(payDate)}</strong>.
            Days until each card's billing cycle and due date are calculated from this specific date.
          </div>
        )}
        {results && (
          <div className="recommend-results">
            {(() => {
              const affordable = results.recommendations.filter(c => c.canAfford);
              const showCards = affordable.length > 0 ? affordable.slice(0, 3)
                : [...results.recommendations].sort((a,b) => b.available - a.available).slice(0, 3);
              const noneAffordable = affordable.length === 0;
              return (
                <>
                  {noneAffordable && (
                    <div className="advisor-no-afford">
                      ⚠️ No card has enough limit for {getCountry().symbol} {Number(amount).toLocaleString()}. Showing the 3 cards with the highest available balance instead.
                    </div>
                  )}
                  {showCards.map((card, i) => (
                    <div key={card.id} className={`recommend-card ${i===0&&!noneAffordable?'best':''} ${noneAffordable?'fallback':''}`}>
                      <div className="rec-rank">{i===0&&!noneAffordable?'⭐':`#${i+1}`}</div>
                      <div className="rec-card-strip" style={{background:card.color||getBankColor(card.bank_name)}}/>
                      <div className="rec-info">
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                          <div className="rec-name">{card.bank_name} <span className="rec-num">****{card.card_number.slice(-4)}</span></div>
                          {i===0&&!noneAffordable && <span className="advisor-tag best-tag">BEST CHOICE</span>}
                          {noneAffordable && <span className="advisor-tag" style={{background:'#fef3c7',color:'#b45309'}}>HIGHEST AVAILABLE</span>}
                          {card.daysToBilling<=2&&card.canAfford && <span className="advisor-tag" style={{background:'#fef3c7',color:'#b45309'}}>⚠️ BILLING CLOSES SOON</span>}
                        </div>
                        <div className="rec-recommendation">{noneAffordable ? `Available: ${fmtCurrency(card.available)} — closest to your required amount` : card.recommendation}</div>
                        <div className="rec-stats">
                          {[
                            {label:'Available',val:fmtCurrency(card.available),color:card.canAfford?'#10b981':'#f59e0b'},
                            {label:'Credit Limit',val:fmtCurrency(card.credit_limit),color:'inherit'},
                            {label:'Days to Billing',val:`${card.daysToBilling}d`,color:urgencyColor(card.daysToBilling)},
                            {label:'Days to Due',val:`${card.daysToDue}d`,color:urgencyColor(card.daysToDue)},
                            {label:'Interest-Free',val:`${card.daysToBilling+card.daysToDue}d`,color:'#4361ee'},
                          ].map(s=>(
                            <div key={s.label} className="rec-stat">
                              <div className="rec-stat-label">{s.label}</div>
                              <div className="rec-stat-val" style={{color:s.color}}>{s.val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rec-score-wrap"><div className="rec-score">{card.score}</div><div className="rec-score-label">score</div></div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Page ─────────────────────────────────────────────
// Everything here used to require editing App.js and redeploying. Now it's just API calls.
function SettingsPage({ user, offices, toast, onProfileSaved }) {
  const [tab, setTab] = useState('profile');
  const [users, setUsers] = useState([]);
  const [settingsOfficeId, setSettingsOfficeId] = useState(user.office_id || offices[0]?.id || '');
  const [banks, setBanks] = useState([]);
  const [newBank, setNewBank] = useState('');
  const [channels, setChannels] = useState({ whatsapp: true, email: true });
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username:'', email:'', full_name:'', role:'viewer', office_id:'' });
  const [editingUser, setEditingUser] = useState(null);
  const [pwResetFor, setPwResetFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testingChannel, setTestingChannel] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('invite');
  const [templateDraft, setTemplateDraft] = useState({ subject: '', body: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: user.full_name, username: user.username });
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password:'', new_password:'', confirm:'' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const avatarFileInput = useRef();

  const loadUsers = useCallback(async () => {
    if (user.role !== 'admin') return;
    const res = await authFetch(`${API}/admin/users`);
    setUsers(await res.json());
  }, [user.role]);

  const loadOfficeSettings = useCallback(async (officeId) => {
    if (!officeId) return;
    const [banksRes, chanRes] = await Promise.all([
      authFetch(`${API}/admin/settings?category=banks&office_id=${officeId}`).then(r=>r.json()),
      authFetch(`${API}/admin/settings?category=notifications&office_id=${officeId}`).then(r=>r.json()),
    ]);
    const banksRow = banksRes.find(r => r.key === 'list' && r.office_id === Number(officeId));
    setBanks(banksRow?.value || []);
    const chanRow = chanRes.find(r => r.key === 'channels' && r.office_id === Number(officeId));
    setChannels(chanRow?.value || { whatsapp: true, email: true });
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => {
    if (tab === 'audit' && user.role === 'admin' && !auditLoaded) {
      authFetch(`${API}/admin/audit-log`).then(r=>r.json()).then(data => {
        setAuditLog(Array.isArray(data) ? data : []);
        setAuditLoaded(true);
      });
    }
  }, [tab, user.role, auditLoaded]);
  useEffect(() => { loadOfficeSettings(settingsOfficeId); }, [settingsOfficeId, loadOfficeSettings]);

  const loadTemplates = useCallback(async () => {
    if (!settingsOfficeId) return;
    const res = await authFetch(`${API}/admin/email-templates?office_id=${settingsOfficeId}`);
    const data = await res.json();
    setTemplates(Array.isArray(data) ? data : []);
  }, [settingsOfficeId]);

  useEffect(() => {
    if (tab === 'emailTemplates') loadTemplates();
  }, [tab, loadTemplates]);

  useEffect(() => {
    const t = templates.find(t => t.key === selectedTemplateKey);
    if (t) { setTemplateDraft({ subject: t.subject, body: t.body }); setPreviewData(null); }
  }, [templates, selectedTemplateKey]);

  const handlePreviewTemplate = async () => {
    setPreviewLoading(true);
    try {
      const res = await authFetch(`${API}/admin/email-templates/${selectedTemplateKey}/preview`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(templateDraft)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreviewData(data);
    } catch (err) { alert('Error: ' + err.message); }
    finally { setPreviewLoading(false); }
  };

  const handleSaveTemplate = async () => {
    setTemplateSaving(true);
    try {
      const res = await authFetch(`${API}/admin/email-templates/${selectedTemplateKey}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ...templateDraft, office_id: settingsOfficeId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      await loadTemplates();
      toast('✅ Template saved');
    } catch (err) { alert('Error: ' + err.message); }
    finally { setTemplateSaving(false); }
  };

  const handleResetTemplate = async () => {
    if (!window.confirm('Reset this template to the default? Your customization will be lost.')) return;
    try {
      await authFetch(`${API}/admin/email-templates/${selectedTemplateKey}?office_id=${settingsOfficeId}`, { method: 'DELETE' });
      await loadTemplates();
      toast('✅ Reset to default');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const saveBanks = async (updated) => {
    setBanks(updated);
    await authFetch(`${API}/admin/settings/banks/list`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ office_id: settingsOfficeId, value: updated })
    });
    toast('✅ Bank list updated');
  };

  const saveChannels = async (updated) => {
    setChannels(updated);
    await authFetch(`${API}/admin/settings/notifications/channels`, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ office_id: settingsOfficeId, value: updated })
    });
    toast('✅ Notification channels updated');
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API}/admin/users`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(newUser)
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error||'Failed to create user');
      setShowAddUser(false);
      setNewUser({ username:'', email:'', full_name:'', role:'viewer', office_id:'' });
      loadUsers();
      if (data.email_warning) {
        toast(`⚠️ User created, but the invite email failed: ${data.email_warning}`);
      } else {
        toast('✅ Invite sent — they\'ll set their own password from the link');
      }
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API}/admin/users/${editingUser.id}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ full_name: editingUser.full_name, email: editingUser.email, role: editingUser.role, office_id: editingUser.office_id })
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||'Failed to update user'); }
      setEditingUser(null);
      loadUsers();
      toast('✅ User updated');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.full_name} (${u.username})? This can't be undone.`)) return;
    try {
      const res = await authFetch(`${API}/admin/users/${u.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||'Failed to delete user'); }
      loadUsers();
      toast('✅ User deleted');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleResendInvite = async (u) => {
    try {
      const res = await authFetch(`${API}/admin/users/${u.id}/resend-invite`, { method: 'POST' });
      const d = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(d.error||'Failed to resend invite');
      toast('✅ Invite resent');
    } catch (err) { alert('Error: ' + err.message); }
  };

  const handleResetPw = async (userId) => {
    if (!newPw || newPw.length < 8) { alert('Password must be at least 8 characters'); return; }
    await authFetch(`${API}/admin/users/${userId}/reset-password`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ new_password: newPw })
    });
    setPwResetFor(null); setNewPw('');
    toast('✅ Password reset');
  };

  const toggleUserActive = async (u) => {
    await authFetch(`${API}/admin/users/${u.id}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ is_active: !u.is_active })
    });
    loadUsers();
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 1_500_000) { alert('Photo is too large — pick one under ~1.5MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const body = { ...profileForm };
      if (avatarPreview !== user.avatar_url) body.avatar_url = avatarPreview;
      const res = await authFetch(`${API}/auth/me`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      onProfileSaved(data.user);
      toast(profileForm.username !== user.username ? '✅ Profile updated — use your new username next time you log in' : '✅ Profile updated');
    } catch (err) { alert('Error: ' + err.message); }
    finally { setProfileSaving(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.new_password.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pwForm.new_password !== pwForm.confirm) { setPwError("New passwords don't match"); return; }
    setPwSaving(true);
    try {
      const res = await authFetch(`${API}/auth/change-password`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ current_password: pwForm.current_password, new_password: pwForm.new_password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change password');
      setPwForm({ current_password:'', new_password:'', confirm:'' });
      toast('✅ Password changed');
    } catch (err) { setPwError(err.message); }
    finally { setPwSaving(false); }
  };

  const sendTest = async (channel) => {
    const target = channel === 'email' ? testEmail : testPhone;
    if (!target) { alert(channel === 'email' ? 'Enter an email to test' : 'Enter a WhatsApp number to test'); return; }
    setTestingChannel(channel);
    try {
      const path = channel === 'email' ? 'test-email' : 'test-sms';
      const body = channel === 'email' ? { email: target } : { phone: target };
      const res = await authFetch(`${API}/notifications/${path}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      toast(data.mode === 'mock' ? `⚠️ Sent in mock mode — ${channel === 'email' ? 'RESEND_API_KEY' : 'Twilio credentials'} not configured on the server` : `✅ Test ${channel} sent`);
    } catch (err) { alert('Error: ' + err.message); }
    finally { setTestingChannel(null); }
  };

  return (
    <div className="content">
      <div className="section">
        <div style={{display:'flex',gap:'8px',marginBottom:'20px',borderBottom:'1.5px solid var(--border)',paddingBottom:'12px'}}>
          <button className={`filter-btn ${tab==='profile'?'active':''}`} onClick={()=>setTab('profile')}>🙋 Profile</button>
          {user.role === 'admin' && (
            <button className={`filter-btn ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>👤 Users</button>
          )}
          <button className={`filter-btn ${tab==='banks'?'active':''}`} onClick={()=>setTab('banks')}>🏦 Banks</button>
          <button className={`filter-btn ${tab==='notifications'?'active':''}`} onClick={()=>setTab('notifications')}>🔔 Notification Channels</button>
          {user.role !== 'viewer' && (
            <button className={`filter-btn ${tab==='emailTemplates'?'active':''}`} onClick={()=>setTab('emailTemplates')}>✉️ Email Templates</button>
          )}
          {user.role === 'admin' && (
            <button className={`filter-btn ${tab==='audit'?'active':''}`} onClick={()=>setTab('audit')}>📋 Audit Log</button>
          )}
        </div>

        {tab === 'profile' && (
          <>
            <h3 className="section-title" style={{marginBottom:'16px'}}>Your Profile</h3>
            <form onSubmit={handleProfileSave} className="card-form" style={{maxWidth:'420px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'14px',marginBottom:'4px'}}>
                <div onClick={()=>avatarFileInput.current.click()} title="Click to change photo"
                  style={{width:'56px',height:'56px',borderRadius:'50%',background:avatarPreview?`url(${avatarPreview})`:'var(--accent)',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'20px',cursor:'pointer',flexShrink:0}}>
                  {!avatarPreview && profileForm.full_name.charAt(0)}
                </div>
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={()=>avatarFileInput.current.click()}>Change Photo</button>
                  <input ref={avatarFileInput} type="file" accept="image/*" style={{display:'none'}} onChange={handleAvatarChange}/>
                </div>
              </div>
              <div className="form-group"><label>Display Name</label>
                <input value={profileForm.full_name} onChange={e=>setProfileForm(f=>({...f,full_name:e.target.value}))} required/>
              </div>
              <div className="form-group"><label>Username</label>
                <input value={profileForm.username} onChange={e=>setProfileForm(f=>({...f,username:e.target.value}))} required minLength={3}/>
              </div>
              <div className="form-actions" style={{justifyContent:'flex-start'}}>
                <button type="submit" className="btn btn-primary" disabled={profileSaving}>{profileSaving?'Saving...':'Save Changes'}</button>
              </div>
            </form>

            <div style={{borderTop:'1px solid var(--border)',margin:'24px 0 16px',paddingTop:'20px',maxWidth:'420px'}}>
              <h3 className="section-title" style={{marginBottom:'12px'}}>Change Password</h3>
              <form onSubmit={handlePasswordChange} className="card-form">
                {pwError && <div className="login-error">⚠️ {pwError}</div>}
                <div className="form-group"><label>Current Password</label>
                  <input type="password" value={pwForm.current_password} onChange={e=>setPwForm(f=>({...f,current_password:e.target.value}))} required/>
                </div>
                <div className="form-group"><label>New Password</label>
                  <input type="password" value={pwForm.new_password} onChange={e=>setPwForm(f=>({...f,new_password:e.target.value}))} required minLength={8}/>
                </div>
                <div className="form-group"><label>Confirm New Password</label>
                  <input type="password" value={pwForm.confirm} onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))} required minLength={8}/>
                </div>
                <div className="form-actions" style={{justifyContent:'flex-start'}}>
                  <button type="submit" className="btn btn-primary" disabled={pwSaving}>{pwSaving?'Updating...':'Update Password'}</button>
                </div>
              </form>
            </div>

            <p style={{fontSize:'11.5px',color:'var(--text-faint)',lineHeight:1.5,maxWidth:'420px'}}>
              Your session stays active for 12 hours after login, then you'll need to sign in again. Email-verified password changes (OTP) aren't built yet — flagged as a separate follow-up, not forgotten.
            </p>
          </>
        )}

        {tab === 'users' && user.role === 'admin' && (
          <>
            <div className="section-header" style={{marginBottom:'16px'}}>
              <h3 className="section-title">Users</h3>
              <button className="btn btn-primary btn-sm" onClick={()=>setShowAddUser(true)}>+ Add User</button>
            </div>
            <div className="txn-table-wrap">
              <table className="txn-table">
                <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Office</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="txn-table-row">
                      <td>{u.username}</td>
                      <td>{u.full_name}</td>
                      <td style={{fontSize:'12px',color:'var(--text-muted)'}}>{u.email || '—'}</td>
                      <td><span className="type-badge charge">{u.role}</span></td>
                      <td>{u.office_name || 'All offices'}</td>
                      <td>
                        {u.pending_invite ? (
                          <span className="notif-status failed" title="Hasn't set a password yet">Pending</span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={()=>toggleUserActive(u)}>
                            {u.is_active ? '✅ Active' : '⛔ Disabled'}
                          </button>
                        )}
                      </td>
                      <td style={{whiteSpace:'nowrap'}}>
                        {pwResetFor === u.id ? (
                          <div style={{display:'flex',gap:'6px'}}>
                            <input type="password" placeholder="New password" value={newPw} onChange={e=>setNewPw(e.target.value)} className="txn-inline-input" style={{width:'130px'}}/>
                            <button className="btn btn-primary btn-sm" onClick={()=>handleResetPw(u.id)}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={()=>{setPwResetFor(null);setNewPw('');}}>✕</button>
                          </div>
                        ) : (
                          <div style={{display:'flex',gap:'4px'}}>
                            <button className="icon-btn" title="Edit" onClick={()=>setEditingUser({...u})}>✏️</button>
                            {u.pending_invite && (
                              <button className="icon-btn" title="Resend invite" onClick={()=>handleResendInvite(u)}>✉️</button>
                            )}
                            {!u.pending_invite && (
                              <button className="btn btn-ghost btn-sm" onClick={()=>setPwResetFor(u.id)}>Reset password</button>
                            )}
                            <button className="icon-btn danger" title="Delete" onClick={()=>handleDeleteUser(u)}>🗑️</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {(tab === 'banks' || tab === 'notifications') && (
          <>
            {user.role === 'admin' && (
              <div className="form-group" style={{maxWidth:'280px',marginBottom:'16px'}}>
                <label>Office</label>
                <select value={settingsOfficeId} onChange={e=>setSettingsOfficeId(e.target.value)}>
                  {offices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {tab === 'banks' && (
              <>
                <h3 className="section-title">Bank List — {offices.find(o=>o.id===Number(settingsOfficeId))?.name}</h3>
                <p style={{color:'var(--text-muted)',fontSize:'13px',marginBottom:'16px'}}>These are the banks that appear in the "Add Card" dropdown for this office.</p>
                <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'16px'}}>
                  {banks.map(b => (
                    <span key={b} className="bank-pill" style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--bg-3)',padding:'6px 10px',borderRadius:'8px'}}>
                      {b}
                      <button onClick={()=>saveBanks(banks.filter(x=>x!==b))} className="icon-btn danger" style={{padding:'2px 4px'}}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{display:'flex',gap:'8px'}}>
                  <input value={newBank} onChange={e=>setNewBank(e.target.value)} placeholder="Add a bank name" className="txn-inline-input" style={{flex:1}}/>
                  <button className="btn btn-primary btn-sm" onClick={()=>{ if(newBank.trim()){ saveBanks([...banks, newBank.trim()]); setNewBank(''); } }}>Add</button>
                </div>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <h3 className="section-title">Notification Channels — {offices.find(o=>o.id===Number(settingsOfficeId))?.name}</h3>
                <p style={{color:'var(--text-muted)',fontSize:'13px',marginBottom:'16px'}}>Cards need a WhatsApp number and/or alert email set individually — this controls which channels the office sends on.</p>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <label style={{display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
                    <input type="checkbox" checked={channels.whatsapp} onChange={e=>saveChannels({...channels, whatsapp:e.target.checked})}/>
                    📱 WhatsApp (via Twilio)
                  </label>
                  <div style={{display:'flex',gap:'8px',marginLeft:'26px'}}>
                    <input value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="+971501234567" className="txn-inline-input" style={{width:'180px'}}/>
                    <button className="btn btn-ghost btn-sm" onClick={()=>sendTest('whatsapp')} disabled={testingChannel==='whatsapp'}>
                      {testingChannel==='whatsapp' ? 'Sending...' : 'Send test'}
                    </button>
                  </div>
                  <label style={{display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
                    <input type="checkbox" checked={channels.email} onChange={e=>saveChannels({...channels, email:e.target.checked})}/>
                    ✉️ Email (via Resend)
                  </label>
                  <div style={{display:'flex',gap:'8px',marginLeft:'26px'}}>
                    <input value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="you@cat-cons.com" className="txn-inline-input" style={{width:'220px'}}/>
                    <button className="btn btn-ghost btn-sm" onClick={()=>sendTest('email')} disabled={testingChannel==='email'}>
                      {testingChannel==='email' ? 'Sending...' : 'Send test'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'emailTemplates' && user.role !== 'viewer' && (
          <>
            <div className="form-group" style={{maxWidth:'280px',marginBottom:'16px'}}>
              <label>Office</label>
              <select value={settingsOfficeId} onChange={e=>setSettingsOfficeId(e.target.value)}>
                {offices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div style={{display:'flex',gap:'8px',marginBottom:'18px',flexWrap:'wrap'}}>
              {templates.map(t => (
                <button key={t.key} className={`filter-btn ${selectedTemplateKey===t.key?'active':''}`} onClick={()=>setSelectedTemplateKey(t.key)}>
                  {t.key === 'invite' && 'Invite'}
                  {t.key === 'due_reminder' && 'Due Reminder'}
                  {t.key === 'billing_reminder' && 'Billing Reminder'}
                  {t.key === 'test' && 'Test Email'}
                  {t.is_customized && ' •'}
                </button>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
              <div>
                <div className="form-group" style={{marginBottom:'12px'}}>
                  <label>Subject</label>
                  <input value={templateDraft.subject} onChange={e=>setTemplateDraft(f=>({...f,subject:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:'12px'}}>
                  <label>Body (HTML)</label>
                  <textarea
                    value={templateDraft.body}
                    onChange={e=>setTemplateDraft(f=>({...f,body:e.target.value}))}
                    style={{width:'100%',minHeight:'280px',fontFamily:"'IBM Plex Mono',monospace",fontSize:'12px',padding:'12px',border:'1.5px solid var(--border)',borderRadius:'8px',resize:'vertical'}}
                  />
                </div>
                <div style={{marginBottom:'14px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:'6px'}}>Available Variables</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                    {(templates.find(t=>t.key===selectedTemplateKey)?.variables||[]).map(v => (
                      <code key={v} style={{background:'var(--bg-3)',padding:'3px 8px',borderRadius:'6px',fontSize:'11px'}}>{`{{${v}}}`}</code>
                    ))}
                  </div>
                </div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button className="btn btn-ghost btn-sm" onClick={handlePreviewTemplate} disabled={previewLoading}>{previewLoading?'Rendering...':'👁 Preview'}</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate} disabled={templateSaving}>{templateSaving?'Saving...':'Save Template'}</button>
                  {templates.find(t=>t.key===selectedTemplateKey)?.is_customized && (
                    <button className="btn btn-danger btn-sm" onClick={handleResetTemplate}>Reset to Default</button>
                  )}
                </div>
              </div>

              <div>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.3px',marginBottom:'8px'}}>
                  Live Preview {previewData ? '' : '(click Preview to render with sample data)'}
                </div>
                <div style={{border:'1.5px solid var(--border)',borderRadius:'8px',overflow:'hidden',minHeight:'380px',background:'#fff'}}>
                  {previewData ? (
                    <>
                      <div style={{padding:'10px 14px',background:'var(--bg-3)',fontSize:'12px',borderBottom:'1px solid var(--border)'}}>
                        <strong>Subject:</strong> {previewData.subject}
                      </div>
                      <iframe
                        title="Email preview"
                        srcDoc={previewData.html}
                        style={{width:'100%',height:'420px',border:'none'}}
                        sandbox=""
                      />
                    </>
                  ) : (
                    <div className="empty-state">No preview yet</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'audit' && user.role === 'admin' && (
          <>
            <h3 className="section-title">Audit Log</h3>
            <p style={{color:'var(--text-muted)',fontSize:'13px',marginBottom:'16px'}}>Who did what, when. Most recent 200 actions.</p>
            {!auditLoaded ? (
              <div className="empty-state">Loading...</div>
            ) : auditLog.length === 0 ? (
              <div className="empty-state">No audit entries yet.</div>
            ) : (
              <div className="txn-table-wrap">
                <table className="txn-table">
                  <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>Office</th></tr></thead>
                  <tbody>
                    {auditLog.map(entry => (
                      <tr key={entry.id} className="txn-table-row">
                        <td style={{whiteSpace:'nowrap',fontSize:'12px'}}>{new Date(entry.created_at).toLocaleString()}</td>
                        <td>{entry.actor_name || '—'}</td>
                        <td><span className="type-badge charge">{entry.action}</span></td>
                        <td style={{fontSize:'11.5px',color:'var(--text-faint)',maxWidth:'260px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={entry.details ? JSON.stringify(entry.details) : ''}>
                          {entry.entity_type}{entry.entity_id ? ` #${entry.entity_id}` : ''}{entry.details ? ` — ${JSON.stringify(entry.details).slice(0,80)}` : ''}
                        </td>
                        <td>{entry.office_name || 'Global'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showAddUser && (
        <div className="modal-overlay" onClick={()=>setShowAddUser(false)}>
          <div className="modal modal-sm" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>➕ Add User</h2><button className="close-btn" onClick={()=>setShowAddUser(false)}>✕</button></div>
            <p className="modal-desc">They'll get an email with a link to set their own password — nobody types it for them.</p>
            <form onSubmit={handleAddUser} className="card-form">
              <div className="form-group"><label>Full Name</label>
                <input value={newUser.full_name} onChange={e=>setNewUser(f=>({...f,full_name:e.target.value}))} required/>
              </div>
              <div className="form-group"><label>Username</label>
                <input value={newUser.username} onChange={e=>setNewUser(f=>({...f,username:e.target.value}))} required/>
              </div>
              <div className="form-group"><label>Email</label>
                <input type="email" value={newUser.email} onChange={e=>setNewUser(f=>({...f,email:e.target.value}))} placeholder="name@cat-cons.com" required/>
              </div>
              <div className="form-group"><label>Role</label>
                <select value={newUser.role} onChange={e=>setNewUser(f=>({...f,role:e.target.value}))}>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {newUser.role !== 'admin' && (
                <div className="form-group"><label>Office</label>
                  <select value={newUser.office_id} onChange={e=>setNewUser(f=>({...f,office_id:e.target.value}))} required>
                    <option value="">Select Office</option>
                    {offices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowAddUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Send Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="modal-overlay" onClick={()=>setEditingUser(null)}>
          <div className="modal modal-sm" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>✏️ Edit User</h2><button className="close-btn" onClick={()=>setEditingUser(null)}>✕</button></div>
            <form onSubmit={handleEditUser} className="card-form">
              <div className="form-group"><label>Full Name</label>
                <input value={editingUser.full_name} onChange={e=>setEditingUser(f=>({...f,full_name:e.target.value}))} required/>
              </div>
              <div className="form-group"><label>Email</label>
                <input type="email" value={editingUser.email||''} onChange={e=>setEditingUser(f=>({...f,email:e.target.value}))}/>
              </div>
              <div className="form-group"><label>Role</label>
                <select value={editingUser.role} onChange={e=>setEditingUser(f=>({...f,role:e.target.value}))}>
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {editingUser.role !== 'admin' && (
                <div className="form-group"><label>Office</label>
                  <select value={editingUser.office_id||''} onChange={e=>setEditingUser(f=>({...f,office_id:e.target.value}))} required>
                    <option value="">Select Office</option>
                    {offices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={()=>setEditingUser(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── CSV Export ─────────────────────────────────────────────
// Proper CSV: quoted fields, commas/quotes escaped, opens cleanly in Excel/Sheets.
function toCSV(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
}
function downloadCSV(csv, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })),
    download: filename
  });
  a.click();
}

function exportStatement(card, transactions) {
  const txns = transactions.filter(t => t.card_id === card.id || t.card_number === card.card_number);
  const symbol = getCountry().symbol;

  const summary = toCSV(
    ['Field', 'Value'],
    [
      ['Bank', card.bank_name], ['Card', maskCard(card.card_number)], ['Holder', card.holder_name],
      ['Credit Limit', `${symbol} ${card.credit_limit.toLocaleString()}`],
      ['Outstanding', `${symbol} ${card.outstanding_balance.toLocaleString()}`],
      ['Available', `${symbol} ${(card.credit_limit - card.outstanding_balance).toLocaleString()}`],
      ['Billing Date', `${card.billing_date}th`], ['Due Date', `${card.due_date}th`],
      ['Generated', new Date().toLocaleString()]
    ]
  );
  const txnCSV = toCSV(
    ['Date', 'Description', 'Type', 'Amount'],
    txns.map(t => [new Date(t.transaction_date).toLocaleDateString(), t.description || '', t.type, t.amount])
  );

  downloadCSV(summary + '\r\n\r\n' + txnCSV, `${card.bank_name.replace(/\s+/g,'_')}_statement_${new Date().toISOString().slice(0,10)}.csv`);
}

// Full transaction list, respecting whatever filters are currently applied on the Transactions tab
function exportTransactions(transactions, label) {
  const csv = toCSV(
    ['Date', 'Bank', 'Card', 'Description', 'Type', 'Amount'],
    transactions.map(t => [
      new Date(t.transaction_date).toLocaleDateString(),
      t.bank_name || '', `****${t.card_number ? t.card_number.slice(-4) : ''}`,
      t.description || '', t.type, t.amount
    ])
  );
  downloadCSV(csv, `transactions_${label}_${new Date().toISOString().slice(0,10)}.csv`);
}

// ─── Main App ─────────────────────────────────────────────────
// ─── Accept Invite Page ─────────────────────────────────────
function AcceptInvitePage({ token }) {
  const [loading, setLoading] = useState(true);
  const [invitee, setInvitee] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/invite/${token}`).then(r=>r.json()).then(data => {
      if (data.error) setError(data.error);
      else setInvitee(data);
    }).catch(() => setError('Could not reach the server.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/auth/accept-invite`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      setDone(true);
    } catch (err) { setError('Could not reach the server.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="login-page">
      <div className="login-right">
        <div className="login-form-wrap">
          <div className="login-brand">
            <div className="login-logo-wrap"><CardMark size={26}/></div>
            <div className="login-brand-name">CC Manager</div>
            <div className="login-brand-sub">Executive Credit Card Dashboard</div>
          </div>
          {loading ? (
            <div className="login-subtitle">Checking your invite...</div>
          ) : done ? (
            <>
              <div className="login-title">Password set</div>
              <div className="login-subtitle">You're all set — you can log in now.</div>
              <a className="btn btn-primary btn-full" href="/login">Go to login</a>
            </>
          ) : invitee ? (
            <>
              <div className="login-title">Hi, {invitee.full_name}</div>
              <div className="login-subtitle">Set a password to activate your account ({invitee.username}).</div>
              <form className="login-form" onSubmit={handleSubmit}>
                {error && <div className="login-error">⚠️ {error}</div>}
                <div className="login-field">
                  <label>New Password</label>
                  <input className="login-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoFocus/>
                </div>
                <div className="login-field">
                  <label>Confirm Password</label>
                  <input className="login-input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required/>
                </div>
                <button type="submit" className="login-btn" disabled={submitting}>{submitting?'Setting up...':'Activate Account'}</button>
              </form>
            </>
          ) : (
            <>
              <div className="login-title">Invite not valid</div>
              <div className="login-error">⚠️ {error}</div>
              <p className="login-hint">Ask an admin to resend your invite.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Entry-point routing: an invite link loads the app fresh at this URL.
  // This top-level component itself calls no hooks, so there's nothing to
  // violate rules-of-hooks over — the actual app hooks all live in MainApp,
  // called unconditionally every time MainApp renders.
  if (window.location.pathname === '/accept-invite') {
    const token = new URLSearchParams(window.location.search).get('token');
    return <AcceptInvitePage token={token} />;
  }
  return <MainApp />;
}

function MainApp() {
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem('cc_user'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [logo, setLogo] = useState(localStorage.getItem('cc_logo')||null);
  const [offices, setOffices] = useState([]);
  const [bankLists, setBankLists] = useState({}); // { officeId: [bankNames] }
  const [selectedOfficeId, setSelectedOfficeId] = useState(null); // admin: null = all offices
  const [dashboard,setDashboard]=useState(null);
  const [transactions,setTransactions]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [analytics,setAnalytics]=useState(null);
  const VALID_TABS = ['overview','cards','transactions','analytics','notifications','settings'];
  const [activeTab,setActiveTab]=useState(() => {
    const fromUrl = window.location.pathname.slice(1);
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'overview';
  });
  const [showCardModal,setShowCardModal]=useState(false);
  const [editCard,setEditCard]=useState(null);
  const [replacingCard,setReplacingCard]=useState(null);
  const [showTxnModal,setShowTxnModal]=useState(false);
  const [showRecommend,setShowRecommend]=useState(false);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [selectedCard,setSelectedCard]=useState(null);
  const [loading,setLoading]=useState(true);
  const [txnFilter,setTxnFilter]=useState('all');
  const [txnCardFilter,setTxnCardFilter]=useState('all');
  const [txnDateFrom,setTxnDateFrom]=useState('');
  const [txnDateTo,setTxnDateTo]=useState('');
  const [editingTxnId,setEditingTxnId]=useState(null);
  const [toastMsg,setToastMsg]=useState('');
  const logoInput=useRef();

  const toast=msg=>{setToastMsg(msg);setTimeout(()=>setToastMsg(''),3000);};

  const handleLogin = (u, token) => {
    setToken(token);
    localStorage.setItem('cc_user', JSON.stringify(u));
    setUser(u);
    setSelectedOfficeId(u.role === 'admin' ? null : u.office_id);
  };
  const handleLogout = () => { setToken(null); localStorage.removeItem('cc_user'); setUser(null); };

  const handleLogoUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{const d=ev.target.result;setLogo(d);localStorage.setItem('cc_logo',d);toast('✅ Logo updated!');};
    reader.readAsDataURL(file);
  };

  // Office param appended to every scoped API call
  const officeParam = selectedOfficeId ? `&office_id=${selectedOfficeId}` : '';
  const officeParamQ = selectedOfficeId ? `?office_id=${selectedOfficeId}` : '';

  // Load offices + bank lists once, right after login
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [offs, settingsRows] = await Promise.all([
          authFetch(`${API}/admin/offices`).then(r=>r.json()),
          authFetch(`${API}/admin/settings?category=banks`).then(r=>r.json()),
        ]);
        setOffices(offs);
        const map = {};
        settingsRows.forEach(row => { if (row.key === 'list' && row.office_id) map[row.office_id] = row.value; });
        setBankLists(map);

        const activeOfficeId = user.role === 'admin' ? (selectedOfficeId || offs[0]?.id) : user.office_id;
        const activeOffice = offs.find(o => o.id === activeOfficeId);
        if (activeOffice) setOfficeConfig(activeOffice);
      } catch (err) { console.error('Failed to load offices/settings', err); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Keep the currency/locale config in sync whenever the admin switches office
  useEffect(() => {
    if (!offices.length) return;
    const activeOfficeId = user?.role === 'admin' ? selectedOfficeId : user?.office_id;
    const activeOffice = offices.find(o => o.id === activeOfficeId) || offices[0];
    if (activeOffice) setOfficeConfig(activeOffice);
  }, [selectedOfficeId, offices, user]);

  const [refreshing, setRefreshing] = useState(false);
  const [txnTotal, setTxnTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadDashboard=useCallback(async()=>{
    if (!user) return;
    setRefreshing(true);
    try{
      const [dash,txnsRes,notifs,anal]=await Promise.all([
        authFetch(`${API}/dashboard${officeParamQ}`).then(r=>r.json()),
        authFetch(`${API}/transactions?limit=200&offset=0${officeParam}`).then(r=>r.json()),
        authFetch(`${API}/notifications${officeParamQ}`).then(r=>r.json()),
        authFetch(`${API}/analytics/spending${officeParamQ}`).then(r=>r.json()).catch(()=>null),
      ]);
      setDashboard(dash);
      setTransactions(Array.isArray(txnsRes?.transactions)?txnsRes.transactions:[]);
      setTxnTotal(txnsRes?.total || 0);
      setNotifications(Array.isArray(notifs)?notifs:[]);
      setAnalytics(anal);
    }catch(err){console.error(err);}
    finally{setLoading(false); setRefreshing(false);}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user, selectedOfficeId]);

  const loadMoreTransactions = async () => {
    setLoadingMore(true);
    try {
      const res = await authFetch(`${API}/transactions?limit=200&offset=${transactions.length}${officeParam}`).then(r=>r.json());
      setTransactions(prev => [...prev, ...(res.transactions||[])]);
    } catch(err) { console.error(err); }
    finally { setLoadingMore(false); }
  };

  useEffect(()=>{ if(user) loadDashboard(); },[user,loadDashboard]);

  // Sync the URL to whatever's actually on screen. Previously nothing ever
  // called history.pushState/replaceState, so the address bar just stayed
  // frozen at whatever path the page happened to load from.
  useEffect(() => {
    if (user) window.history.replaceState(null, '', `/${activeTab}`);
  }, [activeTab, user]);
  useEffect(() => {
    if (!user) window.history.replaceState(null, '', '/login');
  }, [user]);

  const handleDeleteTxn=async id=>{
    if(!window.confirm('Delete this transaction?')) return;
    try{ await authFetch(`${API}/transactions/${id}`,{method:'DELETE'}); loadDashboard(); toast('Transaction deleted.'); }
    catch(err){toast('❌ Delete failed');}
  };

  const handleDeleteCard=async id=>{
    if(!window.confirm('Delete this card and all its data?')) return;
    await authFetch(`${API}/cards/${id}`,{method:'DELETE'});
    setSelectedCard(null); loadDashboard(); toast('Card deleted.');
  };

  const handleTriggerNotifications=async()=>{
    await authFetch(`${API}/notifications/trigger`,{method:'POST'});
    toast('✅ Notification check triggered!'); loadDashboard();
  };

  const handleRetryNotification = async (id) => {
    try {
      const res = await authFetch(`${API}/notifications/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      toast(data.status === 'sent' ? '✅ Resent successfully' : '❌ Retry failed again — check the delivery config');
      loadDashboard();
    } catch (err) { alert('Error: ' + err.message); }
  };

  if (!user) return <LoginPage onLogin={handleLogin} logo={logo} />;

  if (loading) return(
    <div className="loading-screen">
      <div className="loading-ring"><div/><div/><div/><div/></div>
      <p>Loading your dashboard...</p>
    </div>
  );

  const cards=dashboard?.cards||[];
  const filteredTxns = transactions.filter(t => {
    if (txnFilter !== 'all' && t.type !== txnFilter) return false;
    if (txnCardFilter !== 'all' && String(t.card_id) !== String(txnCardFilter)) return false;
    if (txnDateFrom) { const from = new Date(txnDateFrom); from.setHours(0,0,0,0); if (new Date(t.transaction_date) < from) return false; }
    if (txnDateTo) { const to = new Date(txnDateTo); to.setHours(23,59,59,999); if (new Date(t.transaction_date) > to) return false; }
    return true;
  });

  const isGlobalAdmin = user.role === 'admin' && user.office_id === null;

  return(
    <div className="app">
      {toastMsg&&<div className="toast">{toastMsg}</div>}

      <div className={`mobile-nav-overlay ${mobileNavOpen?'visible':''}`} onClick={()=>setMobileNavOpen(false)} />
      <aside className={`sidebar ${mobileNavOpen?'mobile-open':''}`}>
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <div className="logo-img-wrap" onClick={()=>logoInput.current.click()} title="Click to upload company logo" style={{cursor:'pointer'}}>
              {logo?<img src={logo} alt="logo"/>:<CardMark size={20}/>}
            </div>
            <div><div className="logo-title">CC Manager</div><div className="logo-sub">Executive Dashboard</div></div>
            <input ref={logoInput} type="file" accept="image/*" style={{display:'none'}} onChange={handleLogoUpload}/>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Menu</div>
          {[
            {id:'overview',icon:'◉',label:'Overview'},
            {id:'cards',icon:'▤',label:'My Cards'},
            {id:'transactions',icon:'↕',label:'Transactions'},
            {id:'analytics',icon:'📈',label:'Analytics'},
            {id:'notifications',icon:'🔔',label:'Alerts'},
            {id:'settings',icon:'⚙️',label:'Settings'},
          ].map(item=>(
            <button key={item.id} className={`nav-item ${activeTab===item.id?'active':''}`} onClick={()=>{setActiveTab(item.id);setMobileNavOpen(false);}}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </button>
          ))}

          <div className="nav-section-label" style={{marginTop:'8px'}}>Actions</div>
          <button className="nav-item" onClick={()=>{setEditCard(null);setShowCardModal(true);}}>
            <span className="nav-icon">＋</span>Add Card
          </button>
          <button className="nav-item" onClick={()=>setShowTxnModal(true)}>
            <span className="nav-icon">↗</span>Add Transaction
          </button>
          <button className="nav-item" style={{color:'#7048e8'}} onClick={()=>setShowRecommend(true)}>
            <span className="nav-icon">🎯</span>Best Card Advisor
          </button>
          <button className="nav-item" onClick={handleTriggerNotifications}>
            <span className="nav-icon">📱</span>Send Alerts Now
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar" style={user.avatar_url?{background:`url(${user.avatar_url})`,backgroundSize:'cover',backgroundPosition:'center'}:{}}>
              {!user.avatar_url && user.full_name.charAt(0)}
            </div>
            <div style={{cursor:'pointer'}} onClick={()=>{setActiveTab('settings');setMobileNavOpen(false);}} title="Edit profile">
              <div className="sidebar-user-name">{user.full_name}</div>
              <div className="sidebar-user-role">{user.role} · {user.office_name || 'All offices'}</div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout} title="Sign out">⏏</button>
          </div>
          <div className="sidebar-util-wrap" style={{marginTop:'12px'}}>
            <div className="sidebar-util-label">Portfolio Utilization</div>
            <div className="sidebar-util-bar">
              <div style={{width:`${dashboard?.utilizationRate||0}%`,background:urgencyColor(100-(dashboard?.utilizationRate||0))}}/>
            </div>
            <div className="sidebar-util-pct">{Math.round(dashboard?.utilizationRate||0)}%</div>
          </div>
        </div>
      </aside>

      <main className="main" style={{opacity:refreshing?0.45:1, transition:'opacity .25s ease', pointerEvents:refreshing?'none':'auto'}}>
        <header className="top-bar">
          <div style={{display:'flex',alignItems:'center'}}>
            <button className="mobile-nav-toggle" onClick={()=>setMobileNavOpen(o=>!o)} aria-label="Toggle menu">☰</button>
            <div>
            <h1 className="page-title">
              {activeTab==='overview'&&'Portfolio Overview'}
              {activeTab==='cards'&&'Credit Cards'}
              {activeTab==='transactions'&&'Transactions'}
              {activeTab==='analytics'&&'Spending Analytics'}
              {activeTab==='notifications'&&'Alert History'}
              {activeTab==='settings'&&'Settings'}
            </h1>
            <p className="page-sub">{new Date().toLocaleDateString(getCountry().locale,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
            </div>
          </div>
          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
            {isGlobalAdmin ? (
              <div style={{display:'flex',alignItems:'center',gap:'6px',background:'var(--bg-3)',border:'1.5px solid var(--border)',borderRadius:'10px',padding:'6px 12px'}}>
                <button onClick={()=>setSelectedOfficeId(null)}
                  style={{background:!selectedOfficeId?'var(--accent)':'transparent',color:!selectedOfficeId?'#fff':'var(--text-muted)',border:'none',borderRadius:'6px',padding:'4px 10px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                  All Offices
                </button>
                {offices.map(o=>(
                  <button key={o.id} onClick={()=>setSelectedOfficeId(o.id)}
                    style={{background:selectedOfficeId===o.id?'var(--accent)':'transparent',color:selectedOfficeId===o.id?'#fff':'var(--text-muted)',border:'none',borderRadius:'6px',padding:'4px 10px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                    {o.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{background:'var(--bg-3)',border:'1.5px solid var(--border)',borderRadius:'10px',padding:'6px 14px',fontSize:'12px',fontWeight:600,color:'var(--text-muted)'}}>
                🏢 {user.office_name}
              </div>
            )}
            <button className="btn btn-teal" onClick={()=>setShowRecommend(true)}>🎯 Best Card Advisor</button>
            <button className="btn btn-ghost" onClick={loadDashboard}>↺ Refresh</button>
          </div>
        </header>

        {activeTab==='overview'&&(
          <div className="content">
            <div className="stats-row">
              {[
                {icon:'💳',label:'Total Credit Limit',val:fmtCurrency(dashboard?.totalLimit),sub:`${cards.length} active card${cards.length!==1?'s':''}`,c:'c-blue'},
                {icon:'⚠️',label:'Total Outstanding',val:fmtCurrency(dashboard?.totalOutstanding),sub:'across all cards',c:'c-red'},
                {icon:'✅',label:'Available Credit',val:fmtCurrency(dashboard?.availableCredit),sub:'ready to use',c:'c-green'},
                {icon:'📊',label:'Utilization',val:`${dashboard?.utilizationRate}%`,sub:'portfolio average',c:'c-gold',bar:true},
              ].map(s=>(
                <div key={s.label} className={`stat-card ${s.c}`}>
                  <div className="stat-card-bg"/>
                  <div className="stat-icon-wrap">{s.icon}</div>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.val}</div>
                  {s.bar?(
                    <div className="util-bar" style={{marginTop:'10px'}}>
                      <div className="util-fill" style={{width:`${Math.min(dashboard?.utilizationRate||0,100)}%`,background:urgencyColor(100-(dashboard?.utilizationRate||0))}}/>
                    </div>
                  ):<div className="stat-sub">{s.sub}</div>}
                </div>
              ))}
            </div>

            <div className="section">
              <div className="section-header">
                <h3 className="section-title">Cards — Ordered by Soonest Due</h3>
                <button className="btn btn-ghost btn-sm" onClick={()=>setActiveTab('cards')}>View All →</button>
              </div>
              <div className="cards-scroll">
                {cards.length===0?<div className="empty-state">No cards yet. Click "Add Card" to begin.</div>
                  :cards.map(card=><CreditCardVisual key={card.id} card={card} onClick={()=>{setSelectedCard(card);setActiveTab('cards');}}/>)}
              </div>
            </div>

            <div className="two-col">
              <div className="section">
                <h3 className="section-title">⏰ Payment Calendar</h3>
                {cards.length===0?<div className="empty-state">No cards added yet.</div>
                  :cards.map(card=>{
                    const dDue=getDaysUntil(card.due_date),dBill=getDaysUntil(card.billing_date);
                    return(
                      <div key={card.id} className="calendar-row">
                        <div className="cal-stripe" style={{background:card.color||getBankColor(card.bank_name)}}/>
                        <div className="cal-info"><div className="cal-bank">{card.bank_name}</div><div className="cal-num">****{card.card_number.slice(-4)}</div></div>
                        <div className="cal-badges">
                          <div className="cal-badge" style={{borderColor:urgencyColor(dDue)+'66',color:urgencyColor(dDue)}}><span>DUE</span><strong>{dDue===0?'TODAY':`${dDue}d`}</strong></div>
                          <div className="cal-badge" style={{borderColor:'#4361ee44',color:'#4361ee'}}><span>BILL</span><strong>{dBill===0?'TODAY':`${dBill}d`}</strong></div>
                        </div>
                        <div className="cal-amount"><InlineBalance card={card} onUpdated={loadDashboard}/></div>
                      </div>
                    );
                  })}
              </div>
              <div className="section">
                <div className="section-header"><h3 className="section-title">📋 Recent Activity</h3><button className="btn btn-ghost btn-sm" onClick={()=>setActiveTab('transactions')}>All →</button></div>
                {(dashboard?.recentTransactions||[]).length===0?<div className="empty-state">No transactions yet.</div>
                  :(dashboard?.recentTransactions||[]).map(txn=>(
                    <div key={txn.id} className="txn-row">
                      <div className={`txn-dot ${txn.type}`}/>
                      <div className="txn-info"><div className="txn-desc">{txn.description||txn.type}</div><div className="txn-meta">{txn.bank_name} · {new Date(txn.transaction_date).toLocaleDateString()}</div></div>
                      <div className={`txn-amount ${txn.type==='payment'?'credit':'debit'}`}>{txn.type==='payment'?'−':'+'}{fmtCurrency(txn.amount)}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {activeTab==='cards'&&(
          <div className="content">
            <div className="cards-grid">
              {cards.length===0&&<div className="empty-state full-width">No cards yet. Click "Add Card" to get started.</div>}
              {cards.map(card=>(
                <div key={card.id} className={`card-panel ${selectedCard?.id===card.id?'card-panel-active':''}`} onClick={()=>setSelectedCard(card.id===selectedCard?.id?null:card)}>
                  <CreditCardVisual card={card} selected={selectedCard?.id===card.id}/>
                  <div className="card-panel-details">
                    {[
                      {label:'Credit Limit',val:fmtCurrency(card.credit_limit)},
                      {label:'Available',val:fmtCurrency(card.credit_limit-card.outstanding_balance),color:card.credit_limit-card.outstanding_balance>0?'#10b981':'#f43f5e'},
                      {label:'Billing Day',val:`${card.billing_date}th`},
                      {label:'Due Day',val:`${card.due_date}th`},
                      {label:'WhatsApp',val:card.sms_phone||'—'},
                      {label:'Email Alerts',val:card.notify_email||'—'},
                    ].map(row=>(
                      <div key={row.label} className="cpd-row"><span>{row.label}</span><strong style={row.color?{color:row.color}:{}}>{row.val}</strong></div>
                    ))}
                    <div className="cpd-row"><span>Outstanding</span><InlineBalance card={card} onUpdated={loadDashboard}/></div>
                    <div className="cpd-utilbar">
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px',fontSize:'11px',color:'var(--text-muted)'}}>
                        <span>Utilization</span><span>{Math.round((card.outstanding_balance/card.credit_limit)*100)}%</span>
                      </div>
                      <div className="util-bar"><div className="util-fill" style={{width:`${Math.min((card.outstanding_balance/card.credit_limit)*100,100)}%`,background:urgencyColor(100-(card.outstanding_balance/card.credit_limit)*100)}}/></div>
                    </div>
                    <div className="cpd-actions">
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();exportStatement(card,transactions);toast('✅ Statement exported as CSV');}}>⬇ Export CSV</button>
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setEditCard(card);setShowCardModal(true);}}>✏️ Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setReplacingCard(card);}}>🔄 Replace</button>
                      <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();handleDeleteCard(card.id);}}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==='transactions'&&(
          <div className="content">
            <div className="section">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',marginBottom:'12px'}}>
                <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text-muted)',marginRight:'4px'}}>Type</span>
                  {['all','charge','payment','adjustment'].map(f=>(
                    <button key={f} className={`filter-btn ${txnFilter===f?'active':''}`} onClick={()=>setTxnFilter(f)}>{f==='all'?'All Types':f.charAt(0).toUpperCase()+f.slice(1)}</button>
                  ))}
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>setShowTxnModal(true)}>+ Add Transaction</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{exportTransactions(filteredTxns, txnFilter);toast(`✅ Exported ${filteredTxns.length} transactions`);}}>⬇ Export CSV</button>
              </div>
              <div style={{display:'flex',alignItems:'flex-end',gap:'12px',flexWrap:'wrap',marginBottom:'20px',paddingBottom:'16px',borderBottom:'1.5px solid var(--border)'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                  <span style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text-muted)'}}>Card</span>
                  <select value={txnCardFilter} onChange={e=>setTxnCardFilter(e.target.value)} className="txn-filter-select">
                    <option value="all">All Cards</option>
                    {cards.map(c=><option key={c.id} value={c.id}>{c.bank_name} ****{c.card_number.slice(-4)}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                  <span style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text-muted)'}}>From Date</span>
                  <input type="date" value={txnDateFrom} max={txnDateTo||undefined} onChange={e=>setTxnDateFrom(e.target.value)} className="txn-filter-date"/>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                  <span style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.6px',color:'var(--text-muted)'}}>To Date</span>
                  <input type="date" value={txnDateTo} min={txnDateFrom||undefined} onChange={e=>setTxnDateTo(e.target.value)} className="txn-filter-date"/>
                </div>
                {(txnCardFilter!=='all'||txnDateFrom||txnDateTo||txnFilter!=='all')&&(
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:'1px'}} onClick={()=>{setTxnFilter('all');setTxnCardFilter('all');setTxnDateFrom('');setTxnDateTo('');}}>✕ Clear</button>
                )}
                <div style={{marginLeft:'auto',fontSize:'12px',color:'var(--text-muted)',paddingBottom:'4px'}}>{filteredTxns.length} shown · {transactions.length} of {txnTotal} loaded</div>
              </div>
              <div className="txn-table-wrap">
                <table className="txn-table">
                  <thead><tr><th>Date</th><th>Card</th><th>Description</th><th>Type</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'center',width:'70px'}}></th></tr></thead>
                  <tbody>
                    {filteredTxns.map(txn=>(
                      editingTxnId===txn.id
                        ? <InlineTxnEdit key={txn.id} txn={txn} cards={cards} onSave={()=>{setEditingTxnId(null);loadDashboard();toast('✅ Transaction updated!');}} onCancel={()=>setEditingTxnId(null)}/>
                        : <tr key={txn.id} className="txn-table-row">
                            <td>{new Date(txn.transaction_date).toLocaleDateString('en-AE')}</td>
                            <td><span className="bank-pill" style={{background:`${getBankColor(txn.bank_name)}15`,color:getBankColor(txn.bank_name)}}>{txn.bank_name}</span><span style={{color:'var(--text-faint)',marginLeft:'6px',fontSize:'12px'}}>****{txn.card_number?.slice(-4)}</span></td>
                            <td>{txn.description||'—'}</td>
                            <td><span className={`type-badge ${txn.type}`}>{txn.type}</span></td>
                            <td style={{textAlign:'right'}}><span className={txn.type==='payment'?'credit':'debit'}>{txn.type==='payment'?'−':'+'}{fmtCurrency(txn.amount)}</span></td>
                            <td style={{textAlign:'center',whiteSpace:'nowrap'}}>
                              <button onClick={()=>setEditingTxnId(txn.id)} title="Edit" className="icon-btn" style={{fontSize:'15px'}}>✏️</button>
                              <button onClick={()=>handleDeleteTxn(txn.id)} title="Delete" className="icon-btn danger" style={{fontSize:'15px'}}>🗑️</button>
                            </td>
                          </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTxns.length===0&&<div className="empty-state">No transactions found.</div>}
              </div>
              {transactions.length < txnTotal && (
                <div style={{textAlign:'center',marginTop:'16px'}}>
                  <button className="btn btn-ghost btn-sm" onClick={loadMoreTransactions} disabled={loadingMore}>
                    {loadingMore ? 'Loading...' : `Load ${Math.min(200, txnTotal - transactions.length)} more (${txnTotal - transactions.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab==='analytics'&&(
          <div className="content">
            <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
              {[
                {label:'Last 30 Days Charged',val:fmtCurrency(transactions.filter(t=>{const d=new Date(t.transaction_date),n=new Date();const days=(n-d)/86400000;return t.type==='charge'&&days>=0&&days<=30;}).reduce((s,t)=>s+Number(t.amount||0),0))},
                {label:'Last 30 Days Payments',val:fmtCurrency(transactions.filter(t=>{const d=new Date(t.transaction_date),n=new Date();const days=(n-d)/86400000;return t.type==='payment'&&days>=0&&days<=30;}).reduce((s,t)=>s+Number(t.amount||0),0)),color:'var(--green)'},
                {label:'Total Transactions',val:transactions.length.toString()},
              ].map(s=>(
                <div key={s.label} className="stat-card"><div className="stat-label">{s.label}</div><div className="stat-value" style={s.color?{color:s.color}:{}}>{s.val}</div></div>
              ))}
            </div>
            <div className="two-col">
              <div className="section">
                <h3 className="section-title">📈 Monthly Spending by Card</h3>
                {analytics?.chartData?<BarChart data={analytics.chartData} keys={analytics.cards||[]} colors={CHART_COLORS}/>:<div className="empty-state">Add transactions to see chart.</div>}
              </div>
              <div className="section">
                <h3 className="section-title">🍩 Credit Limit Distribution</h3>
                <div style={{display:'flex',alignItems:'center',gap:'24px'}}>
                  <DonutChart cards={cards}/>
                  <div style={{flex:1}}>
                    {cards.map(c=>(
                      <div key={c.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'13px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <div style={{width:'10px',height:'10px',borderRadius:'50%',background:c.color||getBankColor(c.bank_name)}}/>
                          <span style={{color:'var(--text)',fontWeight:500}}>{c.bank_name}</span>
                        </div>
                        <strong style={{color:'var(--text)'}}>{fmtCurrency(c.credit_limit)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="section">
              <h3 className="section-title">🏆 Top Spending (Last 30 Days)</h3>
              {(analytics?.topSpend||[]).length===0?<div className="empty-state">No data yet.</div>
                :(analytics?.topSpend||[]).map((s,i)=>{
                  const max=analytics.topSpend[0]?.total||1;
                  return(
                    <div key={i} className="spend-row">
                      <div className="spend-rank">#{i+1}</div>
                      <div className="spend-info"><div className="spend-desc">{s.description||'Unnamed'}</div><div className="spend-bar-wrap"><div className="spend-bar" style={{width:`${(s.total/max)*100}%`,background:CHART_COLORS[i%CHART_COLORS.length]}}/></div></div>
                      <div className="spend-amount">{fmtCurrency(s.total)}</div>
                      <div className="spend-count">{s.count}×</div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {activeTab==='notifications'&&(
          <div className="content">
            <div className="section">
              <div className="section-header" style={{marginBottom:'20px'}}>
                <div>
                  <h3 className="section-title" style={{margin:0}}>Notification Log</h3>
                  <p style={{color:'var(--text-muted)',fontSize:'13px',marginTop:'4px'}}>Fires daily at 9:00 AM · 7d, 3d, 1d before due · 3d, 1d before billing · WhatsApp and/or email, per office setting</p>
                </div>
                <button className="btn btn-accent" onClick={handleTriggerNotifications}>🔔 Trigger Now</button>
              </div>
              {notifications.length===0?<div className="empty-state">No notifications yet. Add a WhatsApp number or email to a card and trigger a check.</div>
                :notifications.map(n=>(
                  <div key={n.id} className="notif-row">
                    <div className="notif-icon">{n.channel==='email'?'✉️':'📱'}</div>
                    <div className="notif-info">
                      <div className="notif-title">{n.type==='due_reminder'?'Due Date Reminder':'Billing Date Reminder'} · {n.channel||'whatsapp'}</div>
                      <div className="notif-card">{n.bank_name} ****{n.card_number?.slice(-4)}</div>
                    </div>
                    <div className="notif-date">{new Date(n.sent_at).toLocaleString('en-AE')}</div>
                    <div className={`notif-status ${n.status}`}>{n.status==='sent'?'✓ Sent':'✗ Failed'}</div>
                    {n.status==='failed' && (
                      <button className="btn btn-ghost btn-sm" onClick={()=>handleRetryNotification(n.id)}>↺ Retry</button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab==='settings' && (
          <SettingsPage
            user={user}
            offices={offices}
            toast={toast}
            onProfileSaved={(updatedUser) => {
              const merged = { ...user, ...updatedUser };
              setUser(merged);
              localStorage.setItem('cc_user', JSON.stringify(merged));
            }}
          />
        )}
      </main>

      {showCardModal && (
        <CardModal
          card={editCard}
          user={user}
          offices={offices}
          bankLists={bankLists}
          defaultOfficeId={selectedOfficeId || user.office_id}
          onClose={() => { setShowCardModal(false); setEditCard(null); }}
          onSave={async () => { setShowCardModal(false); setEditCard(null); await loadDashboard(); toast(editCard ? '✅ Card updated!' : '✅ Card added!'); }}
        />
      )}

      {replacingCard && (
        <ReplaceCardModal
          card={replacingCard}
          bankLists={bankLists}
          onClose={() => setReplacingCard(null)}
          onSave={async () => { setReplacingCard(null); await loadDashboard(); toast('✅ Card replaced — balance transferred'); }}
        />
      )}

      {showTxnModal && (
        <TransactionModal cards={cards} onClose={() => setShowTxnModal(false)}
          onSave={async () => { setShowTxnModal(false); await loadDashboard(); toast('✅ Transaction added!'); }}/>
      )}

      {showRecommend && (
        <RecommendModal onClose={() => setShowRecommend(false)} officeParam={officeParam} />
      )}
    </div>
  );
}
