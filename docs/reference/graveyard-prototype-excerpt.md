# Graveyard reference (excerpt of the user's prototype HTML)

Source: user-pasted HTML of the "Grim Renewal" artifact. Only the graveyard-relevant
parts are kept. Sound, tween, reaper, base zombie and door drawing are the same as the
modules already in `src/animation/`. Two string literals in the original paste were
broken by smart quotes (`'Trial over. It's out.'`, `'Oh, it's cancelled?'`); they are
written correctly here.

## World and camera
- World is 800 px wide, the canvas view is 480. Hallway on the left (x 0..505), an end
  wall with an archway at x 498..524, a moonlit graveyard on the right (x 520..800).
- `GRAVES = [604, 684, 764]` are the x positions of three trial graves. Doors stay at
  `[175, 260, 345, 430]`.
- Camera x eases toward a target: `cam.focus - W/2` when a scene has focus, else
  `reaper.x - W/2` while the reaper works, else the selected view (`house` -> 0,
  `yard` -> WORLD - W). Clamp to `[0, WORLD - W]`. Ease factor `dt * 3.5` (instant-ish
  `dt * 20` under reduced motion).
- Header has a segmented control "Hallway | Graveyard" (aria-pressed) and an
  "Advance one day" button. A day clock shows the simulated date.
- Tags (DOM labels) follow world x: `left = (it.x - cam.x) / W`, hidden when
  off-screen (`sx < -0.15 || sx > 1.15`).

## Trial data
```js
{ id:'lumen', kind:'trial', name:'Lumen AI Pro',    monthly:19.99, trialDays:1, shirt:'#2f8f86', found:'"Your 14-day trial has started"' }
{ id:'fit',   kind:'trial', name:'FitPath',         monthly:14.99, trialDays:4, shirt:'#b0447a', found:'"Welcome to FitPath Premium"' }
{ id:'page',  kind:'trial', name:'PageTurner Plus', monthly:9.99,  trialDays:9, shirt:'#7a8f2f', found:'"Your free month starts now"' }
```
`rise = max(0, min(1, 1 - days/10))` (how far the grave has cracked open).
`up = rise >= 0.85 ? 0.6 : 0` (how far the zombie has climbed out when close).

## Trial states
`idle` -> (`burying` -> `buried`) or (`rising` -> `converted`) -> `reapTrial` -> `dead`.
Status text: idle "Charges today/tomorrow/in N days"; burying "Burying..."; buried
"Buried before the first charge"; rising "Trial over. It's out." (fix quotes);
converted "Now charging $X/mo".
Tag classes: `trial-tag` (narrower, 15.5%), `is-soon` when idle and days <= 2 (blood
colour on the status line), `is-buried` (rot colour), `is-converted`/`is-soon` blood.

## Trial card
Category "Free trial"; line "Trial ends <date> (today|tomorrow|in N days)" (warn colour
when days <= 2); "Then $X/mo · $Y/yr"; "Found in: <email snippet>"; a coin-coloured
time bar `width = min(1, days/10)`; button by state: idle "Bury it before it charges",
converted "Send the reaper", buried "Buried", dead "Cancelled", else "Reaper assigned".
Section header "The graveyard" with the line "Free trials found in your inbox. The
closer the first charge, the further they've climbed out." and a "Bury every trial"
button. Trial cards use a 3-column grid (2 on tablet, 1 on phone).
Ledger gets a 4th stat; "Still haunting" counts non-buried trial zombies.

## Sequences
```js
async function buryTrial(it) {           // user buries a trial before it charges
  setStatus(it,'walking'); await walkTo(it.x - 30); reaper.facing = 1;
  setStatus(it,'burying'); bubble('Not today.');
  await fakeCancel(it,false); bubble(null);
  await tween(reaper,'swing',1,200,ease.in);
  sfx.swing(); sfx.thud(); if (!reduceMotion) cam.s = 3; spawnDirt(it.x - 4);
  await Promise.all([tween(e.z,'up',0,300,ease.in), tween(e,'rise',0,300)]);
  await tween(reaper,'swing',0,220);
  await tween(e,'slab',1,480,ease.in);   // a stone slab drops onto the grave
  sfx.thud(); spawnDirt(it.x - 4); sfx.coin();
  floatText(it.x, FLOOR-70, '+'+money(it.yearly)+'/yr'); savedTarget += it.yearly;
  setStatus(it,'buried');
}
async function riseTrial(it) {           // day the trial ends and it charges
  cam.focus = it.x; await wait(700); setStatus(it,'rising');
  sfx.roar(); if (!reduceMotion) cam.s = 4; spawnDirt(it.x - 4);
  e.rise = 1; await tween(e.z,'up',1,900,ease.out);
  extraEaten += it.monthly;
  floatText(it.x, FLOOR-70, '-'+money(it.monthly)+' charged', true);   // red float
  setStatus(it,'converted'); await wait(600); cam.focus = null;
}
async function reapTrial(it) {           // kill a trial that already converted
  setStatus(it,'walking'); await walkTo(it.x - 36); reaper.facing = 1;
  setStatus(it,'cancelling'); bubble('Your trial is over.');
  await fakeCancel(it,false); setStatus(it,'reaping');
  await kill(e.z, it.x - 4, '+'+money(it.yearly)+'/yr', () => savedTarget += it.yearly);
  await tween(e,'slab',1,480,ease.in); sfx.thud(); setStatus(it,'dead');
}
function advanceDay() {                  // each day: days--, grave cracks wider
  TRIALS.forEach(it => {
    if (e.status !== 'idle' || e.queued) return;
    e.days = Math.max(0, e.days - 1);
    if (e.days === 0) queue.push(() => riseTrial(it));
    else {
      const r = riseFor(e.days);
      tween(e,'rise',r,700); tween(e.z,'up',upFor(r),700,ease.out);
      if (upFor(r) > 0) { sfx.growl(); spawnDirt(it.x - 4); }
    }
  });
}
```

## Drawing (new pieces; base zombie/door/reaper already exist)
```js
// dirt particles
function spawnDirt(cx){ const n = reduceMotion ? 6 : 22;
  for (let k=0;k<n;k++) particles.push({ x:cx+(Math.random()-0.5)*20, y:FLOOR-4,
    vx:(Math.random()-0.5)*70, vy:-40-Math.random()*70, g:260, life:0, max:0.9,
    size:Math.random()<0.4?2:1, color:Math.random()<0.5?'#4d3828':'#3b2a1f', kind:'dirt' }); }
// dirt bounces like coins: in update(), treat kind 'dirt' like 'coin' on the floor.

// zombie climbing out of the ground: only the part above the floor shows
function drawRising(x, z, o, t){ if(!z.alive || z.up <= 0.01) return;
  const sc = z.scale*z.grow; ctx.save(); ctx.beginPath(); ctx.rect(x-90,0,180,FLOOR); ctx.clip();
  drawZombie(x, FLOOR + (1 - z.up)*39*sc, z, o, t); ctx.restore(); }

function drawGrave(it, e, t, idx){
  const gx = it.x, hx = gx + 10;
  const stone='#5d5870', lite='#777190', etch='#3f3b4f';
  if (idx === 1) { r(hx-2,FLOOR-24,5,24,stone); r(hx-7,FLOOR-19,15,5,stone); r(hx-2,FLOOR-24,1,24,lite); }  // cross
  else { r(hx-6,FLOOR-20,13,20,stone); r(hx-4,FLOOR-22,9,2,stone); if(idx===0) r(hx-2,FLOOR-23,5,1,stone);
         r(hx-5,FLOOR-19,1,18,lite); r(hx-3,FLOOR-16,7,1,etch); r(hx-3,FLOOR-13,7,1,etch); r(hx-3,FLOOR-10,5,1,etch); }
  drawRising(gx-4, e.z, { shirt: it.shirt, rot: 0.6 }, t);
  // a hand pokes out once the trial is close
  const showHand = e.status!=='buried' && e.z.alive && e.rise>=0.55 && e.z.up<0.1;
  if (showHand){ const wv=Math.round(Math.sin(t*5+gx)*1.5), hy=FLOOR-(e.rise>=0.75?13:10), skin='#86ad55';
    r(gx-8+wv,hy,4,FLOOR-hy,skin); r(gx-8+wv,FLOOR-6,4,1,'#5f7d3a');
    r(gx-9+wv,hy-3,1,3,skin); r(gx-7+wv,hy-4,1,4,skin); r(gx-5+wv,hy-3,1,3,skin); r(gx-10+wv,hy,1,2,skin); }
  // mound
  const m='#3b2a1f'; r(gx-18,FLOOR-4,28,4,m); r(gx-15,FLOOR-6,22,2,m); r(gx-15,FLOOR-6,22,1,'#4d3828');
  // cracks widen with rise
  if (e.status!=='buried' && e.status!=='dead' && e.slab<0.05){ const c='#120d0a';
    if(e.rise>0.25){ r(gx-11,FLOOR-5,1,2,c); r(gx-10,FLOOR-4,2,1,c); }
    if(e.rise>0.45){ r(gx-2,FLOOR-6,1,2,c); r(gx-1,FLOOR-4,1,2,c); r(gx+4,FLOOR-5,2,1,c); }
    if(e.rise>0.65){ r(gx-14,FLOOR-3,2,1,c); r(gx+6,FLOOR-3,1,2,c); } }
  // stone slab drops on a buried grave
  if (e.slab>0){ const y=Math.round(FLOOR-8-(1-e.slab)*70);
    r(gx-19,y,30,5,'#7c778f'); r(gx-19,y,30,1,'#9a95ad'); r(gx-19,y+4,30,1,'#55506a');
    r(gx-15,y+1,1,3,'#b8a26a'); r(gx+6,y+1,1,3,'#b8a26a'); r(gx-6,y+1,4,3,'#d9b25a'); r(gx-5,y+2,2,1,'#6e5a2a'); }
}
function drawFog(t){ ctx.save(); ctx.fillStyle='#c8c8e0';
  for(let k=0;k<5;k++){ const x = 520 + ((t*(6+k*2)+k*61)%280) - 20;
    ctx.globalAlpha = 0.05 + 0.02*Math.sin(t+k);
    ctx.beginPath(); ctx.ellipse(x, FLOOR-3-(k%2)*3, 34, 4, 0, 0, Math.PI*2); ctx.fill(); }
  ctx.restore(); }
```

## Background for the yard (painted once into an 800x220 offscreen canvas)
- Sky gradient `#080c22 -> #231d3d` over x 520..800; 40 random stars (1 px, alpha
  0.3..0.9); a moon at (705,40) r15 colour `#e9e4c9` with soft glow and 3 crater dabs.
- Dark hills (`#16132a`) from a sine/cosine silhouette; a bare tree (`#0d0b17`); an iron
  fence (`#0f0d1a`, two rails, pickets every 7 px).
- Ground: `#15190f` with a `#243020` top line and short grass ticks (`#1f2a1a`).
- Archway wall at x 498..524: lintel `#3a2d52`, posts `#2f2645`, inner `#151129`.
- Torches also at x=472 (five total: 132, 217, 302, 387, 472).

## CSS additions
```css
--spirit:#c99bff;
.clock{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px}
.today{font-family:var(--display);font-size:18px}
.today small{display:block;font-family:var(--body);font-size:13px;color:var(--mist)}
.seg{display:inline-flex;border:1px solid var(--stone);border-radius:3px;overflow:hidden}
.seg button{border-radius:0;background:transparent;color:var(--mist)}
.seg button[aria-pressed="true"]{background:var(--stone);color:var(--bone)}
.tag.trial-tag{width:15.5%}
.tag.is-buried .st{color:var(--rot)} .tag.is-converted .st,.tag.is-soon .st{color:var(--blood)}
.tag.is-converted{background:rgba(18,14,28,.82);border-radius:3px;padding:2px 3px}
.float.bad{color:var(--blood)}
.cards.trials{grid-template-columns:repeat(3,minmax(0,1fr))}
.card .line.warn b{color:var(--blood)} .bar.time i{background:var(--coin)} .card.alarm{border-color:var(--spirit)}
```
Note: `--spirit` is not in `.kiro/steering/animation.md`. Add it to that palette (with
`#c99bff`, used for revenant/ghost accents) as part of this work.

## Not part of this excerpt
The prototype's revenant dispute flow (evidence list, dispute letter, "Clawed back" stat,
chains on the tombstone) is richer than what is built. Out of scope for this item.
