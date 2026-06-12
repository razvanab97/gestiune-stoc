import React, { useState, useMemo } from 'react'

// ── Transport rate tables ────────────────────────────────────────────────────
const FAN_RO = [
  [1,11.48],[2,11.48],[3,11.48],[4,12.41],[5,13.34],[6,14.27],
  [7,15.19],[8,17.00],[9,18.54],[10,19.88],[11,19.88],[12,19.88],
  [13,22.66],[14,22.66],[15,22.66],[16,32.45],[17,32.45],[18,32.45],
  [19,32.45],[20,32.45],[21,34.51],[22,34.51],[23,34.51],[24,34.51],
  [25,34.51],[26,38.63],[27,38.63],[28,38.63],[29,38.63],[30,38.63],
  [31,44.81],[32,44.81],[33,44.81],[34,44.81],[35,44.81],
  [36,51.00],[37,51.00],[38,51.00],[39,51.00],[40,51.00],
]
const DPD_RO = [
  [1,11.07],[2,11.07],[3,11.07],[4,12.36],[5,13.13],[6,14.27],
  [7,15.84],[8,17.86],[9,20.05],[10,21.51],[11,21.51],[12,21.51],
  [13,24.05],[14,24.05],[15,24.05],[16,35.90],[17,35.90],[18,35.90],
  [19,35.90],[20,35.90],[21,40.55],[22,40.55],[23,40.55],[24,40.55],
  [25,40.55],[26,45.30],[27,45.30],[28,45.30],[29,45.30],[30,45.30],
]
const DPD_GR = [
  [1,18.74],[2,18.74],[3,19.11],[4,23.47],[5,27.88],
  [6,32.24],[7,36.59],[8,40.95],[9,45.31],
  ...[10,11,12,13,14,15].map(k=>[k,58.43]),
  ...[16,17,18,19,20].map(k=>[k,93.40]),
  ...[21,22,23,24,25].map(k=>[k,115.24]),
  ...[26,27,28,29,30].map(k=>[k,137.08]),
]
const DPD_BG = [
  [1,13.51],[2,13.77],[3,13.77],[4,15.86],[5,17.25],
  [6,18.69],[7,20.09],[8,21.53],[9,22.92],
  ...[10,11,12,13,14,15].map(k=>[k,27.57]),
  ...[16,17,18,19,20].map(k=>[k,39.72]),
  ...[21,22,23,24,25].map(k=>[k,47.35]),
  ...[26,27,28,29,30].map(k=>[k,54.93]),
]

function lookupRate(table, kg) {
  const row = table.find(r => r[0] >= kg)
  return row ? row[1] : table[table.length - 1][1]
}

function getStandardShipping(greutate, curier, ruta) {
  const kg = Math.ceil(greutate)
  if (ruta === 'RO-RO') {
    if (curier === 'FAN') return kg > 40 ? 51.00 + (kg - 40) : lookupRate(FAN_RO, kg)
    return kg > 30 ? 47.30 + (kg - 30) * 2 : lookupRate(DPD_RO, kg)
  }
  if (ruta === 'RO-GR') return kg > 30 ? 142.08 + (kg - 30) * 5 : lookupRate(DPD_GR, kg)
  if (ruta === 'RO-BG') return kg > 30 ? 59.93 + (kg - 30) * 5 : lookupRate(DPD_BG, kg)
  return 0
}

function getMinimumThresholdTax(pretNet) {
  if (pretNet < 40) return 3
  if (pretNet < 50) return 4
  if (pretNet < 75) return 5
  if (pretNet < 125) return 8
  return null
}

function calcTransportCost(pretLista, reducereFix, cuponProc, greutate, curier, ruta, tip) {
  if (tip === 'client_plateste') return 0
  const net = pretLista - reducereFix - cuponProc
  if (net < 125 && greutate <= 10 && ruta === 'RO-RO') {
    const t = getMinimumThresholdTax(net)
    if (t !== null) return t
  }
  if ((ruta === 'RO-GR' || ruta === 'RO-BG') && net < 50 && greutate <= 5) return 8
  return getStandardShipping(greutate, curier, ruta)
}

// ── Core calculation ─────────────────────────────────────────────────────────
function computeTrendyol(s) {
  const pretAchLei = (s.pretEur || 0) * (s.curs || 5)
  const pretLista  = s.pretLista || 0
  const tvaV       = s.tvaVanzare || 0.19
  const comPct     = (s.comisionTrendyol || 15) / 100
  const kg         = s.greutate || 1

  const reducereLei   = pretLista * ((s.reducereProcentuala || 0) / 100)
  const cuponProcLei  = pretLista * ((s.cuponProcentual || 0) / 100)
  const cuponFix      = s.cuponMagazin || 0
  const totalReduceri = reducereLei + cuponFix + cuponProcLei
  const pretVanzareNet = pretLista - totalReduceri

  // Commission charged on pretLista × (1+TVA) per Trendyol rules
  const comisionBrut = pretLista * (1 + tvaV) * comPct
  const comisionNet  = comisionBrut / (1 + tvaV)
  const tvaCom       = comisionBrut - comisionNet

  const standardShip = getStandardShipping(kg, s.curier || 'FAN', s.ruta || 'RO-RO')
  const costReturTurRetur = (s.costReturTurRetur !== '' && s.costReturTurRetur != null)
    ? (s.costReturTurRetur || 0)
    : standardShip * 2

  const costTransport = calcTransportCost(
    pretLista, reducereLei + cuponFix, cuponProcLei,
    kg, s.curier || 'FAN', s.ruta || 'RO-RO', s.tipTransport || 'seller_plateste'
  )
  const costReturMediu = ((s.rataRetur || 0) / 100) * costReturTurRetur

  const tvaColectata  = pretVanzareNet * tvaV
  const tvaDeductibila = tvaCom
  const tvaVirata     = tvaColectata - tvaDeductibila

  // venit = pretLista (gross turnover, basis for micro 1% tax and margin %)
  const venit = pretLista
  const profitBrut = pretVanzareNet - pretAchLei - comisionNet - costTransport
    - costReturMediu - (s.contabilitate || 0) - (s.consumabile || 0) - (s.alteCosturi || 0)
  const impozit = s.tipImpozit === 'micro'
    ? venit * 0.01
    : Math.max(0, profitBrut) * 0.16
  const profitNet = profitBrut - impozit
  const marja = venit > 0 ? (profitNet / venit) * 100 : 0

  // Transport label
  const net4lbl = pretVanzareNet
  const thresh  = getMinimumThresholdTax(net4lbl)
  const isThresh      = net4lbl < 125 && kg <= 10 && (s.ruta || 'RO-RO') === 'RO-RO' && thresh !== null
  const isCrossBorder = (s.ruta === 'RO-GR' || s.ruta === 'RO-BG') && net4lbl < 50 && kg <= 5
  let transportLabel
  if (s.tipTransport === 'client_plateste') transportLabel = 'Client plătește'
  else if (isThresh)      transportLabel = `Sprijin sub prag minim — ${thresh} lei`
  else if (isCrossBorder) transportLabel = 'Prag transfrontalier — 8 lei'
  else                    transportLabel = `Standard ${s.curier || 'FAN'} — ${standardShip.toFixed(2)} lei`

  return {
    pretAchLei, reducereLei, cuponFix, cuponProcLei, totalReduceri, pretVanzareNet,
    comisionBrut, comisionNet, tvaCom, costTransport, costReturTurRetur, costReturMediu,
    tvaColectata, tvaDeductibila, tvaVirata, venit, profitBrut, impozit, profitNet, marja,
    transportLabel, standardShip, isThresh, isCrossBorder
  }
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  return n.toFixed(2) + ' lei'
}
function fmtPct(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—'
  return n.toFixed(1) + '%'
}

function Section({ title, open, onToggle, children }) {
  return (
    <div className="border border-gray-200 rounded-xl mb-3 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition-colors text-left"
      >
        <span>{title}</span>
        <span className={`text-gray-400 inline-block transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-4 py-4 space-y-4 bg-white">{children}</div>}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Num({ value, onChange, placeholder = '0', min = 0, step = '0.01', className = '' }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      step={step}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent ${className}`}
    />
  )
}

function Tabs({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 px-2 transition-colors ${
            value === o.value ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Badge({ children, variant = 'info' }) {
  const cls = {
    info:    'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-300',
    error:   'bg-red-50 text-red-700 border-red-200',
  }[variant]
  return <div className={`text-xs px-3 py-2 rounded-lg border font-medium ${cls}`}>{children}</div>
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrendyolCalculator() {
  const [s, setS] = useState({
    pretEur: '', curs: 5.00, tvaAchizitie: 0.21,
    pretLista: '', tvaVanzare: 0.19, comisionTrendyol: 15, greutate: 1, curier: 'FAN',
    reducereProcentuala: 0, cuponMagazin: 0, cuponProcentual: 0,
    tipTransport: 'seller_plateste', ruta: 'RO-RO',
    rataRetur: 7, costReturTurRetur: '',
    contabilitate: 2, consumabile: 1, alteCosturi: 0,
    tipImpozit: 'micro',
  })
  const [open, setOpen] = useState({
    achizitie: true, vanzare: true, reduceri: false,
    transport: true, retururi: false, cheltuieli: false,
  })

  const set = (k, v) => setS(p => ({ ...p, [k]: v }))
  const tog = k => setOpen(p => ({ ...p, [k]: !p[k] }))

  // Parse helpers
  const num = k => parseFloat(s[k]) || 0

  const r = useMemo(() => {
    const pretLista = num('pretLista')
    const pretEur   = num('pretEur')
    if (!pretLista || !pretEur) return null
    return computeTrendyol({
      pretEur, pretLista,
      curs: num('curs') || 5,
      tvaAchizitie: num('tvaAchizitie'),
      tvaVanzare: num('tvaVanzare') || 0.19,
      comisionTrendyol: num('comisionTrendyol') || 15,
      greutate: num('greutate') || 1,
      curier: s.curier, ruta: s.ruta, tipTransport: s.tipTransport,
      reducereProcentuala: num('reducereProcentuala'),
      cuponMagazin: num('cuponMagazin'),
      cuponProcentual: num('cuponProcentual'),
      rataRetur: num('rataRetur'),
      costReturTurRetur: s.costReturTurRetur === '' ? null : num('costReturTurRetur'),
      contabilitate: num('contabilitate'),
      consumabile: num('consumabile'),
      alteCosturi: num('alteCosturi'),
      tipImpozit: s.tipImpozit,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s])

  // Live preview values (no need for full compute)
  const pretLista   = num('pretLista')
  const tvaV        = num('tvaVanzare') || 0.19
  const redPct      = pretLista * (num('reducereProcentuala') / 100)
  const cupPct      = pretLista * (num('cuponProcentual') / 100)
  const cupFix      = num('cuponMagazin')
  const totalRed    = redPct + cupFix + cupPct
  const pretEfectiv = pretLista - totalRed
  const kg          = num('greutate') || 1
  const stdShip     = getStandardShipping(kg, s.curier, s.ruta)

  // Transport badge (live, before full compute)
  const transBadge = (() => {
    if (!pretLista) return null
    if (s.tipTransport === 'client_plateste') return { text: 'Client plătește transportul', v: 'info' }
    const t = getMinimumThresholdTax(pretEfectiv)
    if (pretEfectiv < 125 && kg <= 10 && s.ruta === 'RO-RO' && t !== null)
      return { text: `Eligibil sprijin sub prag minim — taxă ${t} lei (valabil din 08.06.2026)`, v: 'success' }
    if ((s.ruta === 'RO-GR' || s.ruta === 'RO-BG') && pretEfectiv < 50 && kg <= 5)
      return { text: 'Prag transfrontalier — 8 lei', v: 'success' }
    return { text: `Tarif standard ${s.curier} — ${stdShip.toFixed(2)} lei`, v: 'info' }
  })()

  const warnings = []
  if (r && pretLista > 0) {
    if (totalRed / pretLista > 0.20)
      warnings.push('Reducerile depășesc 20% din preț — verifică marja înainte de campanie')
    if (r.costTransport > 0 && r.pretVanzareNet > 0 && r.costTransport > r.pretVanzareNet * 0.25)
      warnings.push('Transportul depășește 25% din prețul de vânzare — produs neprofitabil la greutatea curentă')
  }

  const marjaColor = !r ? '' : r.marja >= 25 ? 'text-green-700' : r.marja >= 15 ? 'text-amber-600' : r.marja >= 0 ? 'text-orange-600' : 'text-red-700'
  const marjaBg    = !r ? '' : r.marja >= 25 ? 'bg-green-50 border-green-200' : r.marja >= 15 ? 'bg-amber-50 border-amber-200' : r.marja >= 0 ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'

  return (
    <div className="max-w-5xl mx-auto p-4 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
          <span className="text-white font-black text-base">T</span>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Calculator Trendyol</h2>
          <p className="text-xs text-gray-500">Profit net după comisioane, transport, retururi și reduceri</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* ── Left: inputs ───────────────────────────────────────── */}
        <div>
          {/* Achiziție */}
          <Section title="📦 Achiziție" open={open.achizitie} onToggle={() => tog('achizitie')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preț achiziție (EUR)">
                <Num value={s.pretEur} onChange={v => set('pretEur', v)} placeholder="0.00" />
              </Field>
              <Field label="Curs EUR/RON">
                <Num value={s.curs} onChange={v => set('curs', v)} placeholder="5.00" step="0.01" />
              </Field>
            </div>
            {num('pretEur') > 0 && (
              <Badge variant="info">
                Preț achiziție RON: {((num('pretEur')) * (num('curs') || 5)).toFixed(2)} lei
              </Badge>
            )}
            <Field label="TVA achiziție">
              <Tabs
                value={s.tvaAchizitie}
                onChange={v => set('tvaAchizitie', v)}
                options={[{ value: 0, label: '0%' }, { value: 0.19, label: '19%' }, { value: 0.21, label: '21%' }]}
              />
            </Field>
          </Section>

          {/* Produs & vânzare */}
          <Section title="🏷️ Produs & vânzare" open={open.vanzare} onToggle={() => tog('vanzare')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preț de listă ex-TVA (lei)">
                <Num value={s.pretLista} onChange={v => set('pretLista', v)} placeholder="0.00" />
              </Field>
              <Field label="TVA vânzare">
                <Tabs
                  value={s.tvaVanzare}
                  onChange={v => set('tvaVanzare', v)}
                  options={[{ value: 0, label: '0%' }, { value: 0.09, label: '9%' }, { value: 0.19, label: '19%' }]}
                />
              </Field>
            </div>
            {pretLista > 0 && (
              <Badge variant="info">
                Preț afișat clientului (cu TVA): {(pretLista * (1 + tvaV)).toFixed(2)} lei
              </Badge>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Comision Trendyol %" hint="Standard 15%">
                <Num value={s.comisionTrendyol} onChange={v => set('comisionTrendyol', v)} placeholder="15" max={100} step="0.5" />
              </Field>
              <Field label="Greutate (kg)" hint="Volumetrică sau reală">
                <Num value={s.greutate} onChange={v => set('greutate', v)} placeholder="1" min={0.1} step="0.1" />
              </Field>
            </div>
            <Field label="Curier">
              <Tabs
                value={s.curier}
                onChange={v => set('curier', v)}
                options={[{ value: 'FAN', label: 'FAN Courier' }, { value: 'DPD', label: 'DPD Romania' }]}
              />
            </Field>
          </Section>

          {/* Reduceri */}
          <Section title="🎟️ Reduceri suportate de seller" open={open.reduceri} onToggle={() => tog('reduceri')}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Reducere %" hint="Flash Sale, Brand Fest">
                <Num value={s.reducereProcentuala} onChange={v => set('reducereProcentuala', v)} placeholder="0" max={100} step="1" />
              </Field>
              <Field label="Cupon fix (lei)" hint="Follower Coupon">
                <Num value={s.cuponMagazin} onChange={v => set('cuponMagazin', v)} placeholder="0" />
              </Field>
              <Field label="Cupon % cumulabil">
                <Num value={s.cuponProcentual} onChange={v => set('cuponProcentual', v)} placeholder="0" max={100} />
              </Field>
            </div>
            {pretLista > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Badge variant={totalRed / pretLista > 0.2 ? 'warning' : 'success'}>
                  Total reduceri: {totalRed.toFixed(2)} lei ({pretLista > 0 ? (totalRed / pretLista * 100).toFixed(1) : 0}%)
                </Badge>
                <Badge variant="info">
                  Preț efectiv client: {(pretEfectiv * (1 + tvaV)).toFixed(2)} lei
                </Badge>
              </div>
            )}
          </Section>

          {/* Transport */}
          <Section title="🚚 Transport" open={open.transport} onToggle={() => tog('transport')}>
            <Field label="Tip transport">
              <Tabs
                value={s.tipTransport}
                onChange={v => set('tipTransport', v)}
                options={[
                  { value: 'seller_plateste', label: 'Seller oferă gratuit' },
                  { value: 'client_plateste', label: 'Client plătește' },
                ]}
              />
            </Field>
            <Field label="Rută">
              <Tabs
                value={s.ruta}
                onChange={v => set('ruta', v)}
                options={[
                  { value: 'RO-RO', label: 'România → România' },
                  { value: 'RO-GR', label: 'România → Grecia' },
                  { value: 'RO-BG', label: 'România → Bulgaria' },
                ]}
              />
            </Field>
            {transBadge && <Badge variant={transBadge.v}>{transBadge.text}</Badge>}
          </Section>

          {/* Retururi */}
          <Section title="↩️ Costuri retururi" open={open.retururi} onToggle={() => tog('retururi')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rată retur %" hint="% comenzi returnate">
                <Num value={s.rataRetur} onChange={v => set('rataRetur', v)} placeholder="7" max={100} step="1" />
              </Field>
              <Field
                label="Cost tur-retur (lei)"
                hint={`Auto: ${(stdShip * 2).toFixed(2)} lei (2× tarif standard)`}
              >
                <Num
                  value={s.costReturTurRetur}
                  onChange={v => set('costReturTurRetur', v)}
                  placeholder={(stdShip * 2).toFixed(2)}
                />
              </Field>
            </div>
          </Section>

          {/* Cheltuieli & impozit */}
          <Section title="💼 Cheltuieli interne & impozit" open={open.cheltuieli} onToggle={() => tog('cheltuieli')}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Contabilitate (lei)">
                <Num value={s.contabilitate} onChange={v => set('contabilitate', v)} placeholder="2" />
              </Field>
              <Field label="Consumabile (lei)">
                <Num value={s.consumabile} onChange={v => set('consumabile', v)} placeholder="1" />
              </Field>
              <Field label="Alte costuri (lei)">
                <Num value={s.alteCosturi} onChange={v => set('alteCosturi', v)} placeholder="0" />
              </Field>
            </div>
            <Field label="Tip impozit">
              <Tabs
                value={s.tipImpozit}
                onChange={v => set('tipImpozit', v)}
                options={[
                  { value: 'micro', label: 'Micro 1% (din CA)' },
                  { value: 'profit', label: 'Profit 16%' },
                ]}
              />
            </Field>
          </Section>
        </div>

        {/* ── Right: results ─────────────────────────────────────── */}
        <div className="space-y-4">
          {!r ? (
            <div className="flex flex-col items-center justify-center min-h-64 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              <span className="text-5xl mb-3">📊</span>
              <p className="text-sm font-medium">Completează prețul EUR și prețul de listă</p>
              <p className="text-xs mt-1 text-gray-300">Rezultatele apar automat</p>
            </div>
          ) : (
            <>
              {/* Warnings */}
              {warnings.map((w, i) => (
                <Badge key={i} variant="warning">⚠️ {w}</Badge>
              ))}

              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl p-4 border-2 ${r.profitNet >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Profit net</p>
                  <p className={`text-2xl font-black ${r.profitNet >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {fmt(r.profitNet)}
                  </p>
                </div>
                <div className={`rounded-2xl p-4 border-2 ${marjaBg}`}>
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Marjă netă</p>
                  <p className={`text-2xl font-black ${marjaColor}`}>{fmtPct(r.marja)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">din prețul de listă</p>
                </div>
                <div className="rounded-2xl p-4 border border-gray-200 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Preț efectiv client</p>
                  <p className="text-xl font-bold text-gray-800">{fmt(r.pretVanzareNet * (1 + tvaV))}</p>
                  <p className="text-xs text-gray-400 mt-0.5">incl. TVA</p>
                </div>
                <div className="rounded-2xl p-4 border border-gray-200 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Impozit</p>
                  <p className="text-xl font-bold text-gray-700">{fmt(r.impozit)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.tipImpozit === 'micro' ? '1% din CA (micro)' : '16% din profit'}</p>
                </div>
              </div>

              {/* Breakdown waterfall */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-700">Defalcare detaliată</h3>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      { label: 'Preț de listă ex-TVA', v: r.venit, bold: false },
                      r.reducereLei   > 0 && { label: 'Reducere campanie', v: -r.reducereLei },
                      r.cuponFix      > 0 && { label: 'Cupon magazin fix', v: -r.cuponFix },
                      r.cuponProcLei  > 0 && { label: 'Cupon procentual', v: -r.cuponProcLei },
                      (r.reducereLei > 0 || r.cuponFix > 0 || r.cuponProcLei > 0) &&
                        { label: '= Preț efectiv de vânzare', v: r.pretVanzareNet, sub: true },
                      { label: 'Cost achiziție (ex-TVA)', v: -r.pretAchLei },
                      { label: 'Comision Trendyol (net ex-TVA)', v: -r.comisionNet },
                      { label: `Transport (${r.transportLabel})`, v: -r.costTransport },
                      r.costReturMediu > 0 &&
                        { label: `Cost retur mediu (${s.rataRetur || 0}% × ${fmt(r.costReturTurRetur)})`, v: -r.costReturMediu },
                      num('contabilitate') > 0 && { label: 'Contabilitate', v: -num('contabilitate') },
                      num('consumabile')   > 0 && { label: 'Consumabile',   v: -num('consumabile') },
                      num('alteCosturi')   > 0 && { label: 'Alte costuri',  v: -num('alteCosturi') },
                      { label: '= Profit brut', v: r.profitBrut, sub: true },
                      { label: `Impozit ${s.tipImpozit === 'micro' ? '1% micro' : '16% profit'}`, v: -r.impozit },
                      { label: '= Profit net', v: r.profitNet, total: true },
                    ].filter(Boolean).map((row, i) => (
                      <tr key={i} className={`border-b border-gray-100 last:border-0 ${row.total ? 'bg-gray-100' : row.sub ? 'bg-gray-50' : ''}`}>
                        <td className={`px-4 py-2 ${row.total || row.sub ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                          {row.label}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono font-medium whitespace-nowrap ${
                          row.total ? (row.v >= 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold') :
                          row.sub   ? 'text-gray-800' :
                          row.v < 0 ? 'text-red-600' : 'text-gray-700'
                        }`}>
                          {fmt(row.v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* TVA summary */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-700">TVA de virat</h3>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">TVA colectată (vânzare)</span>
                    <span className="font-mono">{fmt(r.tvaColectata)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TVA deductibilă (comision Trendyol)</span>
                    <span className="font-mono text-red-600">−{fmt(r.tvaDeductibila)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                    <span className="text-gray-800">TVA de virat la ANAF</span>
                    <span className="font-mono text-gray-900">{fmt(r.tvaVirata)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
