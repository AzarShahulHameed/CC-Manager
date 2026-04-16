import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const API = 'https://cc-manager-8sgi.onrender.com/api';

// ─── Demo credentials (replace with real auth backend) ───────
const DEMO_USER = { username: 'admin', password: 'ceo2024', name: 'CEO', role: 'Executive' };

// ─── Utilities ───────────────────────────────────────────────
function maskCard(num) {
  if (!num) return '•••• •••• •••• ••••';
  const c = num.replace(/\s/g, '');
  return `${c.slice(0,4)} •••• •••• ${c.slice(-4)}`;
}
function fmtCurrency(val) {
  return new Intl.NumberFormat('en-AE', { style:'currency', currency:'AED', maximumFractionDigits:0 }).format(val||0);
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

// ─── Login Page ───────────────────────────────────────────────
function LoginPage({ onLogin, logo }) {
  const [form, setForm] = useState({ username:'', password:'' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    await new Promise(r => setTimeout(r, 600));
    if (form.username === DEMO_USER.username && form.password === DEMO_USER.password) {
      onLogin(DEMO_USER);
    } else {
      setError('Invalid username or password. Try admin / ceo2024');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      {/* Left panel */}
      <div className="login-left">
        <div className="login-left-bg" />
        <div className="login-left-circles">
          <span/><span/><span/>
        </div>
        <div className="login-brand">
          <div className="login-logo-wrap">
            {logo ? <img src={logo} alt="logo" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'18px'}} /> : '◈'}
          </div>
          <div className="login-brand-name">CC Manager</div>
          <div className="login-brand-sub">Executive Credit Card Dashboard</div>
        </div>
        <div className="login-features">
          {[
            { icon:'🎯', text:'Smart card advisor with date intelligence' },
            { icon:'📊', text:'Real-time spending analytics' },
            { icon:'🔔', text:'Automated SMS payment alerts' },
            { icon:'💳', text:'Multi-card portfolio management' },
          ].map(f => (
            <div key={f.text} className="login-feature">
              <div className="login-feature-icon">{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="login-right">
        <div className="login-form-wrap">
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
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? '⏳ Signing in...' : '→ Sign In'}
            </button>
          </form>
          <div className="login-hint">Demo: admin / ceo2024</div>
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
                <div key={k} className="bar-wrap" title={`${k}: AED ${(d[k]||0).toLocaleString()}`}>
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
  const total = cards.reduce((s,c)=>s+c.credit_limit,0);
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
  const ref=useRef();
  const save=async()=>{
    try {
      await fetch(`${API}/cards/${card.id}/balance`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({outstanding_balance:parseFloat(val)||0})});
      setEditing(false); onUpdated();
    } catch{setEditing(false);}
  };
  useEffect(()=>{if(editing&&ref.current)ref.current.focus();},[editing]);
  if(editing) return(
    <div className="inline-edit">
      <span className="inline-currency">AED</span>
      <input ref={ref} type="number" value={val} onChange={e=>setVal(e.target.value)}
        onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape')setEditing(false);}} className="inline-input"/>
    </div>
  );
  return(
    <span className="editable-balance" onClick={()=>{setVal(card.outstanding_balance);setEditing(true);}} title="Click to edit">
      {fmtCurrency(card.outstanding_balance)}<span className="edit-icon">✎</span>
    </span>
  );
}

// ─── Card Modal ───────────────────────────────────────────────
function CardModal({ card, onClose, onSave }) {
  const [form,setForm]=useState(card||{card_number:'',holder_name:'',bank_name:'',credit_limit:'',outstanding_balance:'0',billing_date:'',due_date:'',sms_phone:'',color:''});
  const [saving,setSaving]=useState(false);
  const hc=e=>setForm(f=>({...f,[e.target.name]:e.target.value}));
  const rc=form.color||getBankColor(form.bank_name);
  const handleSubmit=async e=>{
    e.preventDefault();setSaving(true);
    try{
      const res=await fetch(card?`${API}/cards/${card.id}`:`${API}/cards`,{method:card?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,color:rc})});
      if(!res.ok) throw new Error('Save failed');
      onSave();
    }catch(err){alert('Error: '+err.message);}finally{setSaving(false);}
  };
  const banks=['Emirates NBD','ADCB','FAB','Mashreq','HSBC','Standard Chartered','Citibank','RAK Bank','DIB','Other'];
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
            <div className="form-group"><label>Bank Name</label>
              <select name="bank_name" value={form.bank_name} onChange={hc} required>
                <option value="">Select Bank</option>
                {banks.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Card Number</label>
              <input name="card_number" value={form.card_number} onChange={hc} placeholder="1234 5678 9012 3456" required/>
            </div>
            <div className="form-group"><label>Card Holder Name</label>
              <input name="holder_name" value={form.holder_name} onChange={hc} placeholder="Full name" required/>
            </div>
            <div className="form-group"><label>Credit Limit (AED)</label>
              <input name="credit_limit" type="number" value={form.credit_limit} onChange={hc} placeholder="50000" required/>
            </div>
            <div className="form-group"><label>Outstanding Balance (AED)</label>
              <input name="outstanding_balance" type="number" value={form.outstanding_balance} onChange={hc} placeholder="0"/>
            </div>
            <div className="form-group"><label>Billing Date (1–31)</label>
              <input name="billing_date" type="number" min="1" max="31" value={form.billing_date} onChange={hc} placeholder="e.g. 1" required/>
            </div>
            <div className="form-group"><label>Due Date (1–31)</label>
              <input name="due_date" type="number" min="1" max="31" value={form.due_date} onChange={hc} placeholder="e.g. 25" required/>
            </div>
            <div className="form-group"><label>SMS Phone</label>
              <input name="sms_phone" value={form.sms_phone} onChange={hc} placeholder="+971501234567"/>
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
function TransactionModal({ cards, onClose, onSave }) {
  const [form, setForm] = useState({
    card_id: '',
    amount: '',
    description: '',
    type: 'charge'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        card_id: Number(form.card_id),        // ✅ convert to number
        amount: Number(form.amount),          // ✅ convert to number
        description: form.description,
        type: form.type
      };

      const res = await fetch(`${API}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to add transaction');

      await onSave();                         // ✅ wait for reload
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💳 Add Transaction</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="card-form">
          <div className="form-group">
            <label>Card</label>
            <select
              value={form.card_id}
              onChange={e => setForm(f => ({ ...f, card_id: e.target.value }))}
              required
            >
              <option value="">Select Card</option>
              {cards.map(c => (
                <option key={c.id} value={c.id}>
                  {c.bank_name} — ****{c.card_number.slice(-4)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Type</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="charge">💳 Charge</option>
              <option value="payment">✅ Payment</option>
              <option value="adjustment">⚖️ Adjustment</option>
            </select>
          </div>

          <div className="form-group">
            <label>Amount (AED)</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Best Card Advisor Modal (with date) ─────────────────────
function RecommendModal({ onClose }) {
  const [amount,setAmount]=useState('');
  const today=new Date().toISOString().slice(0,10);
  const [payDate,setPayDate]=useState(today);
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);

  const handleCheck=async()=>{
    if(!amount) return;
    setLoading(true);
    try{
      const data=await fetch(`${API}/recommend?amount=${amount}&date=${payDate}`).then(r=>r.json());
      setResults(data);
    }catch(err){alert('Error: '+err.message);}
    finally{setLoading(false);}
  };

  const formatPayDate=(d)=>{
    if(!d) return '';
    return new Date(d).toLocaleDateString('en-AE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  };

  return(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>🎯 Best Card Advisor</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="modal-desc">
          Choose the <strong>payment date</strong> and <strong>amount</strong>. The system will analyze your billing cycles relative to that specific date and recommend the optimal card — maximizing your interest-free window.
        </p>

        <div className="advisor-inputs">
          <div className="advisor-field">
            <label>Payment Amount (AED)</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleCheck()}
              placeholder="Enter amount" className="advisor-date-input" style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:'18px'}}/>
          </div>
          <div className="advisor-field">
            <label>Payment Date</label>
            <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}
              min={today} className="advisor-date-input"/>
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
              const showCards = affordable.length > 0
                ? affordable.slice(0, 3)
                : [...results.recommendations].sort((a,b) => b.available - a.available).slice(0, 3);
              const noneAffordable = affordable.length === 0;
              return (
                <>
                  {noneAffordable && (
                    <div className="advisor-no-afford">
                      ⚠️ No card has enough limit for AED {Number(amount).toLocaleString()}. Showing the 3 cards with the highest available balance instead.
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
                      <div className="rec-score-wrap">
                        <div className="rec-score">{card.score}</div>
                        <div className="rec-score-label">score</div>
                      </div>
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

// ─── Export Statement ─────────────────────────────────────────
function exportStatement(card, transactions) {
  const rows=transactions.filter(t=>t.card_id===card.id||t.card_number===card.card_number)
    .map(t=>`${new Date(t.transaction_date).toLocaleDateString()}\t${t.description||''}\t${t.type}\tAED ${t.amount.toLocaleString()}`).join('\n');
  const content=['CREDIT CARD STATEMENT',`Generated: ${new Date().toLocaleString()}`,'',
    `Bank: ${card.bank_name}`,`Card: ${maskCard(card.card_number)}`,`Holder: ${card.holder_name}`,
    `Limit: AED ${card.credit_limit.toLocaleString()}`,`Outstanding: AED ${card.outstanding_balance.toLocaleString()}`,
    `Available: AED ${(card.credit_limit-card.outstanding_balance).toLocaleString()}`,
    `Billing: ${card.billing_date}th | Due: ${card.due_date}th`,'',
    'TRANSACTIONS','Date\tDescription\tType\tAmount',rows||'(None)'].join('\n');
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([content],{type:'text/plain'})),download:`${card.bank_name}_${new Date().toISOString().slice(0,10)}.txt`});
  a.click();
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { const s = sessionStorage.getItem('cc_user'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [logo, setLogo] = useState(localStorage.getItem('cc_logo')||null);
  const [dashboard,setDashboard]=useState(null);
  const [transactions,setTransactions]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [analytics,setAnalytics]=useState(null);
  const [activeTab,setActiveTab]=useState('overview');
  const [showCardModal,setShowCardModal]=useState(false);
  const [editCard,setEditCard]=useState(null);
  const [showTxnModal,setShowTxnModal]=useState(false);
  const [showRecommend,setShowRecommend]=useState(false);
  const [selectedCard,setSelectedCard]=useState(null);
  const [loading,setLoading]=useState(true);
  const [txnFilter,setTxnFilter]=useState('all');
  const [toastMsg,setToastMsg]=useState('');
  const logoInput=useRef();

  const toast=msg=>{setToastMsg(msg);setTimeout(()=>setToastMsg(''),3000);};
  const handleLogin = (u) => { sessionStorage.setItem('cc_user', JSON.stringify(u)); setUser(u); };
  const handleLogout = () => { sessionStorage.removeItem('cc_user'); setUser(null); };

  const handleLogoUpload=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{const d=ev.target.result;setLogo(d);localStorage.setItem('cc_logo',d);toast('✅ Logo updated!');};
    reader.readAsDataURL(file);
  };

  const loadDashboard=useCallback(async()=>{
    try{
      const [dash,txns,notifs,anal]=await Promise.all([
        fetch(`${API}/dashboard`).then(r=>r.json()),
        fetch(`${API}/transactions?limit=50`).then(r=>r.json()),
        fetch(`${API}/notifications`).then(r=>r.json()),
        fetch(`${API}/analytics/spending`).then(r=>r.json()).catch(()=>null),
      ]);
      setDashboard(dash);
      setTransactions(Array.isArray(txns)?txns:[]);
      setNotifications(Array.isArray(notifs)?notifs:[]);
      setAnalytics(anal);
    }catch(err){console.error(err);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{ if(user) loadDashboard(); },[user,loadDashboard]);

  const handleDeleteCard=async id=>{
    if(!window.confirm('Delete this card and all its data?')) return;
    await fetch(`${API}/cards/${id}`,{method:'DELETE'});
    setSelectedCard(null); loadDashboard(); toast('Card deleted.');
  };

  const handleTriggerNotifications=async()=>{
    await fetch(`${API}/notifications/trigger`,{method:'POST'});
    toast('✅ Notification check triggered!'); loadDashboard();
  };

  // Show login if not authenticated
  if (!user) return <LoginPage onLogin={handleLogin} logo={logo} />;

  if (loading) return(
    <div className="loading-screen">
      <div className="loading-ring"><div/><div/><div/><div/></div>
      <p>Loading your dashboard...</p>
    </div>
  );

  const cards=dashboard?.cards||[];
  const filteredTxns=txnFilter==='all'?transactions:transactions.filter(t=>t.type===txnFilter);

  return(
    <div className="app">
      {toastMsg&&<div className="toast">{toastMsg}</div>}

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <div className="logo-img-wrap" onClick={()=>logoInput.current.click()} title="Click to upload company logo" style={{cursor:'pointer'}}>
              {logo?<img src={logo} alt="logo"/>:'◈'}
            </div>
            <div>
              <div className="logo-title">CC Manager</div>
              <div className="logo-sub">Executive Dashboard</div>
            </div>
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
          ].map(item=>(
            <button key={item.id} className={`nav-item ${activeTab===item.id?'active':''}`} onClick={()=>setActiveTab(item.id)}>
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
            <span className="nav-icon">📱</span>Send SMS Alerts
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user.name.charAt(0)}</div>
            <div>
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-role">{user.role}</div>
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

      {/* ── Main ── */}
      <main className="main">
        <header className="top-bar">
          <div>
            <h1 className="page-title">
              {activeTab==='overview'&&'Portfolio Overview'}
              {activeTab==='cards'&&'Credit Cards'}
              {activeTab==='transactions'&&'Transactions'}
              {activeTab==='analytics'&&'Spending Analytics'}
              {activeTab==='notifications'&&'Alert History'}
            </h1>
            <p className="page-sub">{new Date().toLocaleDateString('en-AE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
          </div>
          <div style={{display:'flex',gap:'10px'}}>
            <button className="btn btn-teal" onClick={()=>setShowRecommend(true)}>🎯 Best Card Advisor</button>
            <button className="btn btn-ghost" onClick={loadDashboard}>↺ Refresh</button>
          </div>
        </header>

        {/* ── OVERVIEW ── */}
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
                  :cards.map(card=><CreditCardVisual key={card.id} card={card}
                    onClick={()=>{setSelectedCard(card);setActiveTab('cards');}}/>)}
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
                        <div className="cal-info">
                          <div className="cal-bank">{card.bank_name}</div>
                          <div className="cal-num">****{card.card_number.slice(-4)}</div>
                        </div>
                        <div className="cal-badges">
                          <div className="cal-badge" style={{borderColor:urgencyColor(dDue)+'66',color:urgencyColor(dDue)}}>
                            <span>DUE</span><strong>{dDue===0?'TODAY':`${dDue}d`}</strong>
                          </div>
                          <div className="cal-badge" style={{borderColor:'#4361ee44',color:'#4361ee'}}>
                            <span>BILL</span><strong>{dBill===0?'TODAY':`${dBill}d`}</strong>
                          </div>
                        </div>
                        <div className="cal-amount"><InlineBalance card={card} onUpdated={loadDashboard}/></div>
                      </div>
                    );
                  })}
              </div>
              <div className="section">
                <div className="section-header">
                  <h3 className="section-title">📋 Recent Activity</h3>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setActiveTab('transactions')}>All →</button>
                </div>
                {(dashboard?.recentTransactions||[]).length===0?<div className="empty-state">No transactions yet.</div>
                  :(dashboard?.recentTransactions||[]).map(txn=>(
                    <div key={txn.id} className="txn-row">
                      <div className={`txn-dot ${txn.type}`}/>
                      <div className="txn-info">
                        <div className="txn-desc">{txn.description||txn.type}</div>
                        <div className="txn-meta">{txn.bank_name} · {new Date(txn.transaction_date).toLocaleDateString()}</div>
                      </div>
                      <div className={`txn-amount ${txn.type==='payment'?'credit':'debit'}`}>
                        {txn.type==='payment'?'−':'+'}{fmtCurrency(txn.amount)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CARDS ── */}
        {activeTab==='cards'&&(
          <div className="content">
            <div className="cards-grid">
              {cards.length===0&&<div className="empty-state full-width">No cards yet. Click "Add Card" to get started.</div>}
              {cards.map(card=>(
                <div key={card.id} className={`card-panel ${selectedCard?.id===card.id?'card-panel-active':''}`}
                  onClick={()=>setSelectedCard(card.id===selectedCard?.id?null:card)}>
                  <CreditCardVisual card={card} selected={selectedCard?.id===card.id}/>
                  <div className="card-panel-details">
                    {[
                      {label:'Credit Limit',val:fmtCurrency(card.credit_limit)},
                      {label:'Available',val:fmtCurrency(card.credit_limit-card.outstanding_balance),color:card.credit_limit-card.outstanding_balance>0?'#10b981':'#f43f5e'},
                      {label:'Billing Day',val:`${card.billing_date}th`},
                      {label:'Due Day',val:`${card.due_date}th`},
                      {label:'SMS Alerts',val:card.sms_phone||'—'},
                    ].map(row=>(
                      <div key={row.label} className="cpd-row">
                        <span>{row.label}</span>
                        <strong style={row.color?{color:row.color}:{}}>{row.val}</strong>
                      </div>
                    ))}
                    <div className="cpd-row"><span>Outstanding</span><InlineBalance card={card} onUpdated={loadDashboard}/></div>
                    <div className="cpd-utilbar">
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px',fontSize:'11px',color:'var(--text-muted)'}}>
                        <span>Utilization</span><span>{Math.round((card.outstanding_balance/card.credit_limit)*100)}%</span>
                      </div>
                      <div className="util-bar">
                        <div className="util-fill" style={{width:`${Math.min((card.outstanding_balance/card.credit_limit)*100,100)}%`,background:urgencyColor(100-(card.outstanding_balance/card.credit_limit)*100)}}/>
                      </div>
                    </div>
                    <div className="cpd-actions">
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();exportStatement(card,transactions);toast('Statement exported!');}}>⬇ Export</button>
                      <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setEditCard(card);setShowCardModal(true);}}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();handleDeleteCard(card.id);}}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TRANSACTIONS ── */}
        {activeTab==='transactions'&&(
          <div className="content">
            <div className="section">
              <div className="section-header" style={{marginBottom:'20px'}}>
                <div style={{display:'flex',gap:'8px'}}>
                  {['all','charge','payment','adjustment'].map(f=>(
                    <button key={f} className={`filter-btn ${txnFilter===f?'active':''}`} onClick={()=>setTxnFilter(f)}>
                      {f.charAt(0).toUpperCase()+f.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>setShowTxnModal(true)}>+ Add</button>
              </div>
              <div className="txn-table-wrap">
                <table className="txn-table">
                  <thead><tr><th>Date</th><th>Card</th><th>Description</th><th>Type</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
                  <tbody>
                    {filteredTxns.map(txn=>(
                      <tr key={txn.id}>
                        <td>{new Date(txn.transaction_date).toLocaleDateString('en-AE')}</td>
                        <td>
                          <span className="bank-pill" style={{background:`${getBankColor(txn.bank_name)}15`,color:getBankColor(txn.bank_name)}}>{txn.bank_name}</span>
                          <span style={{color:'var(--text-faint)',marginLeft:'6px',fontSize:'12px'}}>****{txn.card_number?.slice(-4)}</span>
                        </td>
                        <td>{txn.description||'—'}</td>
                        <td><span className={`type-badge ${txn.type}`}>{txn.type}</span></td>
                        <td style={{textAlign:'right'}}><span className={txn.type==='payment'?'credit':'debit'}>{txn.type==='payment'?'−':'+'}{fmtCurrency(txn.amount)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTxns.length===0&&<div className="empty-state">No transactions found.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab==='analytics'&&(
          <div className="content">
            <div className="stats-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
              {[
                {label:'This Month Charged',val:fmtCurrency(transactions.filter(t=>{const d=new Date(t.transaction_date),n=new Date();return t.type==='charge'&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).reduce((s,t)=>s+t.amount,0))},
                {label:'This Month Payments',val:fmtCurrency(transactions.filter(t=>{const d=new Date(t.transaction_date),n=new Date();return t.type==='payment'&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).reduce((s,t)=>s+t.amount,0)),color:'var(--green)'},
                {label:'Total Transactions',val:transactions.length.toString()},
              ].map(s=>(
                <div key={s.label} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={s.color?{color:s.color}:{}}>{s.val}</div>
                </div>
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
                      <div className="spend-info">
                        <div className="spend-desc">{s.description||'Unnamed'}</div>
                        <div className="spend-bar-wrap"><div className="spend-bar" style={{width:`${(s.total/max)*100}%`,background:CHART_COLORS[i%CHART_COLORS.length]}}/></div>
                      </div>
                      <div className="spend-amount">{fmtCurrency(s.total)}</div>
                      <div className="spend-count">{s.count}×</div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {activeTab==='notifications'&&(
          <div className="content">
            <div className="section">
              <div className="section-header" style={{marginBottom:'20px'}}>
                <div>
                  <h3 className="section-title" style={{margin:0}}>SMS Notification Log</h3>
                  <p style={{color:'var(--text-muted)',fontSize:'13px',marginTop:'4px'}}>Fires daily at 9:00 AM · 7d, 3d, 1d before due · 3d, 1d before billing</p>
                </div>
                <button className="btn btn-accent" onClick={handleTriggerNotifications}>🔔 Trigger Now</button>
              </div>
              {notifications.length===0?<div className="empty-state">No notifications yet. Add phone numbers to cards and trigger a check.</div>
                :notifications.map(n=>(
                  <div key={n.id} className="notif-row">
                    <div className="notif-icon">{n.type==='due_reminder'?'⏰':'📅'}</div>
                    <div className="notif-info">
                      <div className="notif-title">{n.type==='due_reminder'?'Due Date Reminder':'Billing Date Reminder'}</div>
                      <div className="notif-card">{n.bank_name} ****{n.card_number?.slice(-4)}</div>
                    </div>
                    <div className="notif-date">{new Date(n.sent_at).toLocaleString('en-AE')}</div>
                    <div className={`notif-status ${n.status}`}>{n.status==='sent'?'✓ Sent':'✗ Failed'}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
     

{showCardModal && (
      <CardModal
        card={editCard}
        onClose={() => {
          setShowCardModal(false);
          setEditCard(null);
        }}
        onSave={async () => {
          setShowCardModal(false);
          setEditCard(null);
          await loadDashboard();
          toast(editCard ? '✅ Card updated!' : '✅ Card added!');
        }}
      />
    )}

    {showTxnModal && (
      <TransactionModal
        cards={cards}
        onClose={() => setShowTxnModal(false)}
        onSave={async () => {
          setShowTxnModal(false);
          await loadDashboard();
          toast('✅ Transaction added!');
        }}
      />
    )}

    {showRecommend && (
      <RecommendModal onClose={() => setShowRecommend(false)} />
    )}

  </div>
);
}