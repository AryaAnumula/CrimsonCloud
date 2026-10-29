'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Row = Record<string, any>;
type Field = { name: string; label: string; type?: string; optional?: boolean; step?: string; min?: string;
  options?: { value: string; label: string }[] };
const dateTime = (value: string) => value ? new Date(value).toLocaleString() : '—';

// Plain HTML table: no row buttons or extra navigation screens.
function Table({ rows, columns }: { rows: Row[]; columns: [string, string][] }) {
  if (!rows.length) return <p>No records found.</p>;
  return <div className="table-area"><table><thead><tr>{columns.map(([key, title]) =>
    <th key={key}>{title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>
    {columns.map(([key]) => <td key={key}>{row[key] == null ? '—' :
      key.endsWith('_at') || key === 'next_expiry' ? dateTime(row[key]) :
      Array.isArray(row[key]) ? row[key].join(', ') : String(row[key])}</td>)}
  </tr>)}</tbody></table></div>;
}

function TaskForm({ title, fields, busy, onSave }: {
  title: string; fields: Field[]; busy: boolean; onSave: (data: Row) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data: Row = Object.fromEntries(new FormData(form));
    for (const field of fields) {
      if (field.optional && data[field.name] === '') { delete data[field.name]; continue; }
      if (field.type === 'datetime-local') data[field.name] = new Date(data[field.name]).toISOString();
    }
    if (await onSave(data)) form.reset();
  }
  return <form onSubmit={submit} className="task-form" aria-label={title}>
    {fields.map(field => {
      const controlId = title.replace(/\W+/g, '-') + '-' + field.name;
      return <div className="form-field" key={field.name}>
        <label htmlFor={controlId}>{field.label}{field.optional ? ' (optional)' : ''}</label>
        {field.options ? <select id={controlId} name={field.name} required={!field.optional} defaultValue="">
          <option value="" disabled={!field.optional}>{field.optional ? 'All / not specified' : 'Select…'}</option>
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input id={controlId} name={field.name} type={field.type || 'text'} step={field.step}
          min={field.min ?? (field.type === 'number' ? (field.step === '1' ? '1' : '0.01') : undefined)}
          required={!field.optional} />}
      </div>;
    })}
    <button disabled={busy} type="submit">{title}</button>
  </form>;
}

export default function Home() {
  const [user, setUser] = useState<Row | null>(null);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [collectionTask, setCollectionTask] = useState('Register donor');
  const [requestTask, setRequestTask] = useState('Create request');
  const [documents, setDocuments] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row[]>([]);
  const [traceability, setTraceability] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [adminTask, setAdminTask] = useState('Add hospital');
  const retries = useRef<Record<string, string>>({});

  async function api(path: string, method = 'GET', body?: Row) {
    const response = await fetch('/api/' + path, { method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== 'login') setUser(null);
      throw new Error(result.error || 'Request failed');
    }
    return result;
  }
  // Refresh operational MySQL data. MongoDB reports are loaded separately below.
  async function load() {
    const names = ['dashboard', 'groups', 'donors', 'donations', 'units', 'tests', 'storage', 'hospitals', 'requests', 'issues'];
    const values = await Promise.all(names.map(name => api(name)));
    setData(Object.fromEntries(names.map((name, index) => [name, values[index]])));
  }
  useEffect(() => {
    api('me').then(async actor => { setUser(actor); await load(); }).catch(e => {
      if (!/sign in|session expired/i.test(e.message)) setError(e.message);
    }).finally(() => setLoading(false));
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try { await api('login', 'POST', values); setUser(await api('me')); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save(path: string, values: Row, method = 'POST') {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(path, method, values);
      setMessage(result.message || `Saved successfully${result.issue_id ? ' — issue #' + result.issue_id : ''}`);
      setReportsLoaded(false);
      // The write succeeded even if a later table refresh fails. Do not resubmit it.
      try { await load(); } catch (e) { setError('Saved, but refresh failed: ' + (e as Error).message); }
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }

  const rows = (name: string): Row[] => data[name] || [];
  const field = (name: string, label: string, type = 'text', optional = false): Field => ({ name, label, type, optional });
  const select = (name: string, label: string, records: Row[], key: string, text: string): Field => ({
    name, label, options: records.map(row => ({ value: String(row[key]), label: `#${row[key]} — ${row[text]}` })),
  });
  const choice = (name: string, label: string, values: string[]): Field => ({ name, label,
    options: values.map(value => ({ value, label: value })) });
  const group = select('blood_group_id', 'Blood group', rows('groups'), 'blood_group_id', 'group_name');
  const unit = select('unit_id', 'Blood unit', rows('units').filter(row => ['QUARANTINED','AVAILABLE'].includes(row.status)), 'unit_id', 'display_status');
  const collectionFields: Record<string, Field[]> = {
    'Register donor': [field('name','Name'),field('dob','Date of birth','date'),group,
      field('phone','Phone','tel',true),field('email','Email','email',true),field('gender','Gender','text',true),
      { ...field('weight_kg','Weight (kg)','number',true), step: '0.01' },field('address','Address','text',true)],
    'Record donation': [select('donor_id','Donor',rows('donors'),'donor_id','name'),
      select('storage_id','Storage',rows('storage'),'storage_id','location_name'),
      { ...field('quantity_ml','Volume (ml)','number'), step: '0.01' },field('expires_at','Expiry','datetime-local')],
    'Save screening': [select('donation_id','Donation',rows('donations').filter(row => row.screening_status === 'PENDING'),'donation_id','donor_name'),
      choice('identity_confirmed','Identity recorded',['Yes','No']),choice('consent_recorded','Consent recorded',['Yes','No']),
      field('review_note','Staff review note'),field('follow_up','Follow-up reason','text',true),choice('decision','Screening decision',['APPROVED','REJECTED'])],
    'Record test': [select('unit_id','Blood unit',rows('units').filter(row => row.display_status === 'QUARANTINED'),'unit_id','group_name'),
      choice('result','SCREENING_PANEL result',['PASS','FAIL'])],
    'Release unit': [unit], 'Discard unit': [unit],
  };
  const requestSelect = select('request_id','Hospital request',rows('requests').filter(row =>
    requestTask === 'Verify request' || requestTask === 'Delete draft' ? row.status === 'PENDING' :
    requestTask === 'Issue blood' ? ['VERIFIED','PARTIALLY_FULFILLED'].includes(row.status) :
    ['PENDING','VERIFIED','PARTIALLY_FULFILLED'].includes(row.status)), 'request_id','status');
  const requestFields: Record<string, Field[]> = {
    'Create request': [select('hospital_id','Hospital',rows('hospitals'),'hospital_id','hospital_name'),group,
      { ...field('requested_units','Units requested','number'), step: '1' },choice('priority','Priority',['NORMAL','URGENT']),field('required_at','Required by','datetime-local')],
    'Verify request': [requestSelect], 'Issue blood': [requestSelect,{ ...field('units','Units to issue','number'),step:'1' }],
    'Cancel request': [requestSelect], 'Delete draft': [requestSelect],
  };

  const adminFields: Record<string, Field[]> = {
    'Add hospital': [field('hospital_name','Hospital name'),field('location','Location'),field('phone','Hospital phone','tel',true),field('email','Hospital email','email',true)],
    'Add storage': [field('location_name','Storage name'),field('storage_type','Storage type'),
      { ...field('temperature_c','Temperature (°C)','number'),step:'0.01',min:'-999' },{ ...field('capacity_units','Unit capacity','number'),step:'1' }],
    'Create staff account': [field('name','Staff name'),field('username','New username'),field('email','Staff email','email'),
      choice('role','Role',['STAFF','ADMIN']),field('password','New password (12–72 bytes)','password')],
  };

  // Preserve operation keys across a failed retry; a new successful task gets a new key.
  async function submitCollection(values: Row) {
    if (collectionTask === 'Register donor') return save('donors',values);
    if (collectionTask === 'Record donation') return save('donations',values);
    if (collectionTask === 'Save screening') {
      const signature = 'screening:' + JSON.stringify(values);
      const key = retries.current[signature] ||= crypto.randomUUID();
      const saved = await save(`donations/${values.donation_id}/screening`, { submission_id:key,form_version:'v1',decision:values.decision,
        answers:{ identity_confirmed:values.identity_confirmed === 'Yes',consent_recorded:values.consent_recorded === 'Yes',review_note:values.review_note,
          ...(values.follow_up ? { follow_up:{ reason:values.follow_up } } : {}) } });
      if (saved) delete retries.current[signature]; return saved;
    }
    if (collectionTask === 'Record test') return save(`units/${values.unit_id}/tests`,{ test_type:'SCREENING_PANEL',result:values.result });
    if (collectionTask === 'Discard unit' && !confirm('Discard this unit? This cannot be undone.')) return false;
    return save(`units/${values.unit_id}/${collectionTask === 'Release unit' ? 'release' : 'discard'}`,{});
  }
  async function submitRequest(values: Row) {
    if (requestTask === 'Create request') return save('requests',values);
    if (requestTask === 'Issue blood') {
      const signature = 'issue:' + JSON.stringify(values);
      const key = retries.current[signature] ||= crypto.randomUUID();
      const saved = await save(`requests/${values.request_id}/issue`,{ units:values.units,operation_key:key });
      if (saved) delete retries.current[signature]; return saved;
    }
    const action = requestTask === 'Verify request' ? 'verify' : 'cancel';
    if (requestTask !== 'Verify request' && !confirm(requestTask + '? Earlier issued records will be retained.')) return false;
    return requestTask === 'Delete draft' ? save(`requests/${values.request_id}`,{},'DELETE') : save(`requests/${values.request_id}/${action}`,{});
  }
  async function loadReports(values: Row) {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams(values).toString();
      const [forms,counts,trace,history] = await Promise.all([api('screenings?' + query),api('reports/screening'),
        api('reports/traceability'),user?.role === 'ADMIN' ? api('reports/audit') : Promise.resolve([])]);
      setDocuments(forms); setSummary(counts.map((row: Row) => ({ version:row._id.version,decision:row._id.decision,
        submissions:row.submissions,consent_recorded:row.consent_recorded })));
      setTraceability(trace); setAudit(history); setReportsLoaded(true); return false;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }

  if (loading) return <main><p>Loading…</p></main>;
  if (!user) return <main className="login"><h1>Blood Bank Management System</h1><p>MySQL + MongoDB · Local application</p>
    {error && <p role="alert" className="error">{error}</p>}
    <form onSubmit={login}><label>Username<input name="username" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>Sign in</button></form>
    <p>Account passwords are generated locally during setup. See README.md.</p></main>;

  return <main><header><div><h1>Blood Bank Management System</h1><p>DBMS mini-project · MySQL + MongoDB</p></div>
    <div>{user.name} ({user.role}) <button disabled={busy} onClick={async () => {
      try { await api('logout','POST',{});setUser(null);setData({});setDocuments([]);setSummary([]);setTraceability([]);setAudit([]);setReportsLoaded(false);setMessage('');setError('');retries.current={}; }
      catch(e) { setError((e as Error).message); }
    }}>Sign out</button></div></header>
    <nav aria-label="Page sections"><a href="#summary">Summary</a><a href="#collection">Donors & collections</a><a href="#requests">Requests & issues</a><a href="#reports">Reports</a>
      <button disabled={busy} onClick={async () => {setBusy(true);try {await load();setMessage('Records refreshed');setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Refresh records</button></nav>
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <section id="summary"><h2>Available stock</h2><Table rows={data.dashboard?.stock || []} columns={[
      ['group_name','Blood group'],['available_units','Available units'],['next_expiry','Next expiry']]} />
      <p>Only released, unexpired stock in active storage counts. Whole-blood units; exact-group matching.</p>
      <p><a href="/diagrams/Chen_ER_Diagram.pdf" target="_blank" rel="noreferrer">Chen ER diagram</a> · <a href="/diagrams/Relational_Schema.pdf" target="_blank" rel="noreferrer">Relational schema</a></p></section>
    <section id="collection"><h2>Donors and collections</h2>
      <div className="task-choice"><label htmlFor="collection-task">Collection task</label><select id="collection-task" value={collectionTask} onChange={e=>setCollectionTask(e.target.value)}>{Object.keys(collectionFields).map(name=><option key={name}>{name}</option>)}</select></div>
      <TaskForm key={collectionTask} title={collectionTask} fields={collectionFields[collectionTask]} busy={busy} onSave={submitCollection} />
      <h3>Donation records</h3><Table rows={rows('donations')} columns={[
        ['donation_id','Donation'],['donor_name','Donor'],['group_name','Group'],['quantity_ml','Volume (ml)'],['unit_id','Unit'],['screening_status','Screening']]} />
      <details><summary>Donor register</summary><Table rows={rows('donors')} columns={[
        ['donor_id','Donor'],['name','Name'],['group_name','Group'],['phone','Phone'],['email','Email']]} /></details>
      <h3>Blood units</h3><Table rows={rows('units')} columns={[
        ['unit_id','Unit'],['group_name','Group'],['volume_ml','Volume (ml)'],['location_name','Storage'],['expires_at','Expiry'],['display_status','Status']]} />
      <details><summary>Test history</summary><Table rows={rows('tests')} columns={[
        ['test_id','Test'],['unit_id','Unit'],['test_type','Type'],['result','Result'],['tester_name','Recorded by']]} /></details>
    </section>
    <section id="requests"><h2>Hospital requests and issues</h2>
      <div className="task-choice"><label htmlFor="request-task">Request task</label><select id="request-task" value={requestTask} onChange={e=>setRequestTask(e.target.value)}>{Object.keys(requestFields).map(name=><option key={name}>{name}</option>)}</select></div>
      <TaskForm key={requestTask} title={requestTask} fields={requestFields[requestTask]} busy={busy} onSave={submitRequest} />
      <h3>Request progress</h3><Table rows={rows('requests')} columns={[
        ['request_id','Request'],['hospital_name','Hospital'],['group_name','Group'],['requested_units','Required'],['issued_units','Issued'],['status','Status']]} />
      <h3>Issue records</h3><Table rows={rows('issues')} columns={[
        ['issue_id','Issue'],['request_id','Request'],['hospital_name','Hospital'],['group_name','Group'],['unit_ids','Unit IDs'],['total_ml','Volume (ml)']]} />
    </section>
    <section id="reports"><h2>Database reports</h2><p>Optional filters below apply to saved MongoDB questionnaires; the aggregation summarizes all submissions.</p>
      <TaskForm title="Load reports" busy={busy} onSave={loadReports} fields={[
        { ...field('donation_id','Filter donation ID','number',true),step:'1' },
        { ...choice('decision','Filter decision',['APPROVED','REJECTED']),optional:true }]} />
      {reportsLoaded && <><h3>MongoDB screening aggregation</h3><Table rows={summary} columns={[
        ['version','Version'],['decision','Recorded decision'],['submissions','Documents'],['consent_recorded','Consent recorded']]} />
        <h3>Saved MongoDB questionnaires</h3>{documents.length ? documents.map(doc=><article key={doc.submission_id}>
          <strong>Donation #{doc.donation_id} · {doc.decision} · {doc.form_version}</strong>
          <pre>{JSON.stringify(doc,null,2)}</pre></article>) : <p>No matching questionnaires.</p>}
        <h3>MySQL unit traceability</h3><Table rows={traceability} columns={[
          ['unit_id','Unit'],['donor','Donor'],['donation_id','Donation'],['group_name','Group'],['status','Status'],['request_id','Request'],['hospital_name','Hospital']]} />
        {user.role==='ADMIN' && <><h3>Audit records (Admin)</h3><Table rows={audit} columns={[
          ['audit_id','Audit'],['table_name','Table'],['record_id','Record'],['action','Action'],['actor_id','Staff'],['happened_at','Time']]} /></>}
      </>}
    </section>
    {user.role==='ADMIN' && <section><h2>Administration</h2><p>Add hospitals and storage before the first collection/request. New passwords are hashed by the API.</p>
      <div className="task-choice"><label htmlFor="admin-task">Admin task</label><select id="admin-task" value={adminTask} onChange={e=>setAdminTask(e.target.value)}>{Object.keys(adminFields).map(name=><option key={name}>{name}</option>)}</select></div>
      <TaskForm key={adminTask} title={adminTask} fields={adminFields[adminTask]} busy={busy} onSave={values=>save(
        adminTask==='Add hospital' ? 'hospitals' : adminTask==='Add storage' ? 'storage' : 'staff',values)} />
      <details><summary>Hospital and storage register</summary><Table rows={rows('hospitals')} columns={[
        ['hospital_id','Hospital'],['hospital_name','Name'],['location','Location'],['status','Status']]} />
        <Table rows={rows('storage')} columns={[
          ['storage_id','Storage'],['location_name','Name'],['capacity_units','Capacity'],['occupied_units','Occupied'],['status','Status']]} /></details>
    </section>}
    <footer>Academic project, not clinically validated. Use synthetic data only. Lists show at most 300 SQL records or 100 questionnaires.</footer>
  </main>;
}
