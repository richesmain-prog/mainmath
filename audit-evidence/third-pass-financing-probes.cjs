// Reproduce: node audit-evidence/third-pass-financing-probes.cjs
// Local only. No network, submissions, files, clipboard or print interactions.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { JSDOM, VirtualConsole } = require('node:module').createRequire(path.join(repo, 'package.json'))('jsdom');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8'), mod = { exports:{} };
new Function('module', html.match(/<script>([\s\S]*?)<\/script>/)[1])(mod);
const E = mod.exports;
const money = x => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(x);
function page(spec = {}) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { url:'https://math.therichmain.com', runScripts:'dangerously', pretendToBeVisual:true,
    virtualConsole:vc, beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => null; w.HTMLElement.prototype.scrollIntoView = () => {};
      w.fetch = () => { throw new Error('No network in financing probes'); };
      w.localStorage.setItem('dmp_mode_v1', 'full'); w.localStorage.setItem('dmp_last_v1', JSON.stringify(spec));
    } });
  const w = dom.window, get = id => w.document.getElementById(id);
  return { w, get, close() { assert.deepEqual(errors, []); dom.window.close(); },
    input(id, x) { get(id).value = x; get(id).dispatchEvent(new w.Event('input')); get(id).dispatchEvent(new w.Event('blur')); },
    sw(id, on) { if (get(id).classList.contains('on') !== on) get(id).click(); } };
}
const row = (root, label) => [...root.querySelectorAll('.row')]
  .find(x => x.querySelector('.l').firstChild.textContent === label)?.querySelector('.v').textContent;

// Each rendered GC amount compared with independently stated contract economics.
{
  const p = page();
  for (const [id,x] of Object.entries({ cHard:100000, cPermits:10000, cDesign:20000, cContPct:20, cLumpPct:20, cDbPct:20 })) p.input(id,x);
  let cases = 0;
  for (const variation of [-90,0,10,300]) for (const fee of [0,10]) for (const share of [0,100]) for (const cap of [0,90000]) {
    for (const [id,x] of Object.entries({ cVar:variation, cFeePct:fee, cSharePct:share, cGmp:cap })) p.input(id,x);
    const actual = 110000*(1+variation/100), gmp = cap || 132000*(1+fee/100), bill = actual*(1+fee/100);
    const gp = Math.min(gmp, bill + Math.max(0,gmp-bill)*share/100), pays = [bill,gp,158400,182400];
    const owner = pays.map((amount,i) => amount+(i===3?0:20000)), lowest = Math.min(...owner);
    const maximum = ['No limit',money(gmp+20000),money(178400),money(182400)];
    const spec = p.w._last.r.lines.buildTotal+p.w._last.r.lines.demo;
    assert.equal(p.get('cActual').textContent,money(actual));
    [...p.get('cCards').children].forEach((card,i) => {
      assert.equal(card.querySelector(':scope > .v').firstChild.textContent.trim(),money(owner[i]));
      assert.equal(row(card,'To the GC'),money(pays[i])); assert.equal(row(card,'Design'),i===3?'Inside the price':money(20000));
      assert.equal(row(card,'Most you can be billed'),maximum[i]);
      assert.equal(row(card,'The GC makes'),money(pays[i]-actual-(i===3?20000:0)));
      assert.equal(row(card,'More than the cheapest'),i===owner.indexOf(lowest)?'—':'+'+money(owner[i]-lowest));
      const difference = owner[i]-spec;
      assert.equal(row(card,'Against your Spec Build budget'),Math.abs(difference)<.5?'Even':money(Math.abs(difference))+(difference>0?' over':' under'));
    }); cases++;
  }
  p.close(); console.log(JSON.stringify({gcUiCases:cases,result:'all four contract outputs agree'}));
}

// Exact financing rows in all owned/acquired × drawn/full × cash/reserve × sale/permanent states.
{
  const p = page({ dealType:'teardown',purchasePrice:400000,buildableSqft:1000,buildCostPerSqft:900,softCostPct:0,
    contingencyPct:0,permitFees:50000,demoCost:50000,salePerSqft:2000,ltcPct:85,maxLtvPct:70,ratePct:12,
    pointsPct:2,lenderFee:2000,buildMonths:10,sellMonths:2 });
  for (const [id,x] of Object.entries({lLandAdv:70,lOwed:300000,lClosing:6000,lPermRate:7,lPermYears:30})) p.input(id,x);
  let cases = 0;
  for (const own of [false,true]) for (const flat of [false,true]) for (const financed of [false,true]) for (const permanent of [false,true]) {
    p.sw('swOwn',own);p.sw('swDutch',flat);p.sw('swReserve',financed);
    p.w.document.querySelector('[data-loan="'+(permanent?'c2p':'ac')+'"]').click();
    const months=permanent?10:12,hold=months-10,q=1.01,start=322500,baseDraw=867500;
    const coefficient=q**(hold+1)*(q**10-1)/(q-1)-10;
    const reserve=!financed?0:flat?1190000*.01*months/(1-.85*.01*months)
      :(start*(q**months-1)+baseDraw/10*coefficient)/(1+.15/10*coefficient);
    const loan=1190000+.85*reserve,draw=867500-.15*reserve,gap=950000-draw;
    const interest=financed?reserve:flat?1190000*.01*months:.01*(start*months+867500*(5.5+hold));
    const points=.02*loan,cashClose=(own?300000:400000)-280000+7500+6000+points+2000;
    const totalCash=cashClose+gap+(financed?0:interest);
    const expected={ [own?'Pay off the lot':'Buy the lot']:'−'+money(own?300000:400000),
      'The bank puts toward the lot':'+'+money(280000),'Demolition paid upfront':'−'+money(50000),
      'The bank funds demolition':'+'+money(42500),'Closing costs':'−'+money(6000),'Points':'−'+money(points),
      'Lender fees':'−'+money(2000),'Cash you bring to closing':money(cashClose),'Construction budget':money(1000000),
      'Already paid upfront':money(50000),'Work after closing':money(950000),'The bank pays in draws':money(draw),
      'You pay':money(gap),'Interest payment at full draw':money(loan*.01)+'/mo','Total interest':money(interest),
      'Loan to cost':money((1400000+reserve)*.85),'Loan to ARV':money(1400000),'The smaller one is your limit':money(loan) };
    if(own)expected['Your lot equity']=money(100000); if(financed)expected['Interest reserve']=money(reserve);
    if(permanent){expected['Mortgage balance']=money(loan);const rate=.07/12;
      expected['Monthly payment']=money(Math.round(loan*rate/(1-(1+rate)**-360)))+'/mo';}
    else expected['Pay the bank back']=money(loan);
    for(const [label,value]of Object.entries(expected))assert.equal(row(p.get('lOut'),label),value,JSON.stringify({label,own,flat,financed,permanent}));
    assert.equal(p.get('lOut').querySelector('.solver > .v').textContent,money(loan));
    assert.equal(p.get('lOut').querySelector('.grand b').textContent,money(totalCash));
    [...p.get('lOut').querySelectorAll('.kpis > .kpi > .v')].forEach((el,i)=>assert.equal(el.textContent,money([cashClose,gap,interest,points+2000+interest][i])));
    cases++;
  }
  p.close(); console.log(JSON.stringify({lenderUiCases:cases,result:'all displayed financing rows and KPIs agree'}));
}

// Broader deterministic event-ledger reconciliation. High PRNG bits avoid low-bit boolean correlation.
{
  let seed=638686;
  const choose=a=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return a[(seed>>>8)%a.length]};
  const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<0.002,`${label}: ${a} != ${b}`);
  const covered={owned:0,negativeEquity:0,partialReserve:0,fullReserve:0,permanent:0,fullInterest:0};
  for(let k=0;k<2500;k++){
    const c={lot:choose([0,100000,400000]),build:choose([0,100000,1000000]),arv:choose([0,120000,1000000,3000000]),
      own:choose([false,true]),owed:choose([0,100000,500000]),ltcPct:choose([0,50,80,99.9999,100]),ltvPct:choose([0,50,70,100]),
      landAdvPct:choose([0,70,100]),ratePct:choose([0,1e-10,12,40]),pointsPct:choose([0,2,10]),fees:2000,closing:5000,
      buildMonths:choose([1,12,60]),holdMonths:choose([0,12,36]),dutch:choose([false,true]),reserve:choose([false,true]),
      type:choose(['ac','c2p']),permRatePct:choose([0,1e-10,7,30]),permYears:choose([1,30,40])};
    c.upfrontWork=Math.min(c.build,choose([0,50000,1000000]));const r=E.lender(c),rate=c.ratePct/1200;
    assert.ok(r.loan<=r.cap+.0001&&r.reserve<=r.interest+.0001&&r.gap>=-.0001);
    near(r.dayOne,Math.min(r.cap,c.lot*c.landAdvPct/100,c.own?c.owed:c.lot),'land draw');
    near(r.upfrontDraw,Math.min(r.cap-r.dayOne,c.upfrontWork*c.ltcPct/100),'upfront draw');near(r.cost,c.lot+c.build+r.reserve,'basis');
    near(r.cashTotal+r.loan+(c.own?c.lot-c.owed:0),c.lot+c.build+r.points+r.fees+r.closing+r.interest,'cash conservation');
    let balance=r.dayOne+r.upfrontDraw,left=r.reserve,interest=0;
    if(c.dutch)interest=r.loan*rate*r.months;
    else for(let m=1;m<=r.months;m++){if(m<=c.buildMonths)balance+=r.holdback/c.buildMonths;
      const due=balance*rate,capitalized=Math.min(left,due);interest+=due;balance+=capitalized;left-=capitalized;}
    near(r.interest,interest,'monthly interest');near(r.fullDrawPayment,r.loan*rate,'full draw payment');
    if(!c.reserve){const months=c.buildMonths+(c.type==='c2p'?0:c.holdMonths);
      near(r.interest,rate*(c.dutch?r.loan*months:(r.dayOne+r.upfrontDraw)*months+r.holdback*((c.buildMonths+1)/2+months-c.buildMonths)),'closed form interest');}
    if(c.type==='c2p'){let balance=r.loan;for(let m=0;m<c.permYears*12;m++)balance=balance*(1+c.permRatePct/1200)-r.permPay;
      near(balance,0,'mortgage ending balance');assert.equal(r.months,c.buildMonths);covered.permanent++;}
    if(c.own)covered.owned++;if(r.lotEquity<0)covered.negativeEquity++;
    if(r.reserve>0.01){if(r.interestCash>0.01)covered.partialReserve++;else covered.fullReserve++;}if(c.dutch)covered.fullInterest++;
  }
  console.log(JSON.stringify({lenderLedgerCases:2500,result:'all ledger/cap/interest/amortization checks pass',covered}));
}
