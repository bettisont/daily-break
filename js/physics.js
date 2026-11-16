// physics.js: the Table (the fixed-step ball physics), cloneTable, ray casts (trace, rayCushion, rayBar), potLine,
// allLines, simulate and the aim guide's early-exit simulation guidePotsAt. No DOM.
// Relies on core.js (constants, shapes, features, lieAt). guidePotsAt uses guideWalls from render.js (called only
// after everything has loaded).

class Table {
  constructor(hole, onEvent = () => {}) {
    this.hole = hole; this.ev = onEvent;
    this.cue = { x: hole.cue.x, y: hole.cue.y, vx: 0, vy: 0, n: 0, m: 1, potted: false, isCue: true };
    this.balls = hole.balls.map(b => ({ ...b, vx: 0, vy: 0, m: 1, potted: false }));
    this.shot = null;
    this.pk = pocketsOf(hole);
    this.cat = hole.cat ? { ...hole.cat } : null;
    this.bumps = this.cat ? [...hole.bumpers, this.cat] : hole.bumpers;   // bumpers, plus the cat while it's on the felt
    this.gp = 0;   // how far the gate is open
  }
  openPocket(i) { return !this.hole.closed.includes(i); }
  live() { return [this.cue, ...this.balls].filter(b => !b.potted); }
  moving() { return this.live().some(b => b.vx || b.vy || b.uN); }
  remaining() { return this.balls.filter(b => !b.potted).length; }

  shoot(angle, power, spin = 0, side = 0) {
    const sp = MAX_SPEED * power;
    this.cue.vx = Math.cos(angle) * sp; this.cue.vy = Math.sin(angle) * sp;
    for (const b of this.balls) { b.cush = 0; b.wallPts = []; }
    this.cue.cush = 0; this.cue.wallPts = [];
    this.shot = { pots: [], scratch: false, rattles: 0, cushions: 0, firstHit: null, spin, spinUsed: false, tunnels: 0, side };
  }

  step() {
    const tl = this.hole.tilt, s = this.shot, mouths = tunMouths(this.hole);
    if (s && s.side) { s.side *= SIDE_WEAR; if (Math.abs(s.side) < 0.02) s.side = 0; }
    // a ball in the tunnel: underground until it comes out of the other mouth, heading the same way
    if (mouths.length) for (const b of this.live()) if (b.uN && --b.uN === 0) {
      const m = mouths[b.uTo], sp = Math.hypot(b.uVx, b.uVy) || 1;
      const e = tunExit(m); b.x = e.x; b.y = e.y; b.vx = b.uVx; b.vy = b.uVy; void sp;
      this.ev('tunnelOut', { x: m.x, y: m.y, ball: b, speed: sp });
    }
    const live = mouths.length ? this.live().filter(b => !b.uN) : this.live();
    for (const b of live) {
      if (b.vx || b.vy) { b.vx += tl.x * DT; b.vy += tl.y * DT; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const sand = this.hole.patches.length > 0 && lieAt(this.hole, b.x, b.y) === 'rough';
        const fd = sand ? 3.2 : 1, fk = sand ? 1.6 : 1;
        const ns = Math.max(0, sp - (ROLL_DECEL * fd + LIN_DAMP * fk * sp) * DT);
        const f = ns < STOP ? 0 : ns / sp;
        b.vx *= f; b.vy *= f;
      }
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (!a.vx && !a.vy && !b.vx && !b.vy) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, min = 2 * R;
        if (d2 >= min * min || d2 === 0) continue;
        // rewind the pair to the exact moment of contact so the collision normal is precise
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy, dv = dx * rvx + dy * rvy, vv = rvx * rvx + rvy * rvy;
        const back = dv < 0 && vv > 0 ? Math.min(DT * 2, (dv + Math.sqrt(dv * dv - vv * (d2 - min * min))) / vv) : 0;
        a.x -= a.vx * back; a.y -= a.vy * back; b.x -= b.vx * back; b.y -= b.vy * back;
        const ex = b.x - a.x, ey = b.y - a.y, d = Math.hypot(ex, ey) || 1, nx = ex / d, ny = ey / d, inv = 1 / a.m + 1 / b.m;
        if (d < min) { const ov = (min - d) / inv; a.x -= nx * ov / a.m; a.y -= ny * ov / a.m; b.x += nx * ov / b.m; b.y += ny * ov / b.m; }
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const cueA = a === this.cue, cueB = b === this.cue;
          const cueVn = cueA ? a.vx * nx + a.vy * ny : cueB ? -(b.vx * nx + b.vy * ny) : 0;
          const jmp = -(1 + BALL_E) * vn / inv;
          a.vx -= jmp * nx / a.m; a.vy -= jmp * ny / a.m; b.vx += jmp * nx / b.m; b.vy += jmp * ny / b.m;
          if (s && (cueA || cueB)) {
            if (!s.firstHit) { s.firstHit = cueA ? b : a; s.kick = (this.cue.cush || 0) > 0; s.kickCush = this.cue.cush || 0; s.kickWalls = (this.cue.wallPts || []).length; }
            // spin takes hold on the first contact: follow carries on through, draw comes back
            if (!s.spinUsed) {
              s.spinUsed = true;
              if (s.spin) { const k = s.spin * 0.7 * Math.max(0, cueVn), sx = cueA ? nx : -nx, sy = cueA ? ny : -ny; this.cue.vx += sx * k; this.cue.vy += sy * k; if (Math.abs(s.spin) > 0.15 && cueVn > 150) this.ev('spin', { spin: s.spin, x: this.cue.x, y: this.cue.y, speed: cueVn }); }
            }
          }
          this.ev('hit', { speed: -vn, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
        a.x += a.vx * back; a.y += a.vy * back; b.x += b.vx * back; b.y += b.vy * back;
      }
    }
    if (this.hole.obst) this.stepObstacle(live);
    for (const b of live) {
      if (b.potted || (!b.vx && !b.vy)) continue;
      for (const o of this.bumps) {
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy), min = o.r + R;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        b.x = o.x + nx * min; b.y = o.y + ny * min;
        const vn = b.vx * nx + b.vy * ny, e = o.cat ? CAT_E : BUMPER_E;
        if (vn < 0) {
          b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
          if (o.cat && s) s.catHit = Math.max(s.catHit || 0, -vn);
          if (-vn > 40) this.ev(o.cat ? 'cat' : 'bumper', { o, speed: -vn });
        }
      }
      let under = false;
      for (let k = 0; k < mouths.length && !under; k++) {
        const m = mouths[k];
        // into the opening: within its width, up against the cushion, and heading into it
        const q = tunLocal(m, b.x, b.y);
        if (q.out >= R + 1 || b.vx * m.nx + b.vy * m.ny >= 0 || Math.abs(q.along) >= tunReach(m, b.vx, b.vy)) continue;
        // down the tunnel: it travels underground at a steady pace and keeps most of its own
        const o = mouths[1 - k], sp = Math.hypot(b.vx, b.vy), fx0 = b.x, fy0 = b.y;
        b.uVx = b.vx * TUN_KEEP; b.uVy = b.vy * TUN_KEEP; b.uTo = 1 - k;
        b.uN = b.uN0 = Math.round(TUN_T / DT);
        b.x = m.x; b.y = m.y; b.vx = b.vy = 0; b.tunN = (b.tunN || 0) + 1;
        if (s) s.tunnels++;
        this.ev('tunnelIn', { x: m.x, y: m.y, fromX: fx0, fromY: fy0, toX: o.x, toY: o.y, ball: b, speed: sp, dur: b.uN0 * DT });
        under = true;
      }
      if (under) continue;
      let potted = false;
      for (let i = 0; i < 6 && !potted; i++) {
        if (!this.openPocket(i)) continue;
        const pk = this.pk[i], dx = b.x - pk.x, dy = b.y - pk.y, d = Math.hypot(dx, dy);
        // a Perfect strike's shot gets slightly kinder pockets: a touch wider and harder to rattle out of
        const pf = s?.perfect;
        if (d >= pk.cap * (pf ? PERFECT_POCKET : 1)) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > potMax(this.hole) * (pf ? PERFECT_POCKET_PACE : 1)) {
          // too hot: it rattles in the jaws and spits back out
          const nx = dx / (d || 1), ny = dy / (d || 1), vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx = (b.vx - 2 * vn * nx) * 0.4; b.vy = (b.vy - 2 * vn * ny) * 0.4; }
          b.x = pk.x + nx * (pk.cap + 1); b.y = pk.y + ny * (pk.cap + 1);
          if (s) s.rattles++;
          this.ev('rattle', { x: b.x, y: b.y, ball: b });
        } else { this.pot(b, i); potted = true; }
      }
      if (potted) continue;
      const sp = Math.hypot(b.vx, b.vy);
      let hitWall = false;
      if (this.hole.shape) {
        // any shape: push the ball off the nearest point of each cushion it overlaps and bounce off that normal
        for (const g of this.hole.shape.segs) {
          const ex = g.bx - g.ax, ey = g.by - g.ay, u = clamp(((b.x - g.ax) * ex + (b.y - g.ay) * ey) / g.l2, 0, 1);
          const cx = g.ax + ex * u, cy = g.ay + ey * u, dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2), nx = d ? dx / d : g.nx, ny = d ? dy / d : g.ny;
          b.x = cx + nx * R; b.y = cy + ny * R;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= (1 + CUSHION_E) * vn * nx; b.vy -= (1 + CUSHION_E) * vn * ny; hitWall = true; if (s && s.side && b === this.cue) this.english(nx, ny, vn, sp); }
        }
      } else {
      const eng = s && s.side && b === this.cue;
      if (b.x < R) { const vn = Math.min(0, b.vx); b.x = R; b.vx = Math.abs(b.vx) * CUSHION_E; hitWall = true; if (eng) this.english(1, 0, vn, sp); }
      if (b.x > W - R) { const vn = Math.min(0, -b.vx); b.x = W - R; b.vx = -Math.abs(b.vx) * CUSHION_E; hitWall = true; if (eng) this.english(-1, 0, vn, sp); }
      if (b.y < R) { const vn = Math.min(0, b.vy); b.y = R; b.vy = Math.abs(b.vy) * CUSHION_E; hitWall = true; if (eng) this.english(0, 1, vn, sp); }
      if (b.y > H - R) { const vn = Math.min(0, -b.vy); b.y = H - R; b.vy = -Math.abs(b.vy) * CUSHION_E; hitWall = true; if (eng) this.english(0, -1, vn, sp); }
      }
      // (a touch in a pocket's jaws doesn't count, so a pot that brushes the jaw isn't a 'bank')
      if (hitWall && this.pk.every(p => Math.hypot(b.x - p.x, b.y - p.y) > p.cap + 2 * R)) b.cush = (b.cush || 0) + 1;
      if (hitWall) b.wallPts = [...(b.wallPts || []), [b.x, b.y]];   // every cushion contact and where (for the guide)
      if (hitWall && sp > 30) { if (s) s.cushions++; this.ev('cushion', { speed: sp, x: b.x, y: b.y }); }
    }
  }

  // Side spin (16 Nov): the cue ball grips the cushion and comes off bent towards the side it was struck on (right
  // side, to the shooter's right as they face that cushion), by more the harder it hits. (nx, ny) is the cushion's
  // normal into the table, vn the speed into it (negative), v0 the ball's speed before the bounce: it never comes off
  // faster than that (so the guide's bound on how far balls can still roll, in guidePotsAt, still holds). Each
  // cushion uses some of it up. Only ever runs with side set, so every shot without side (and every generated hole)
  // plays exactly as before.
  english(nx, ny, vn, v0) {
    const s = this.shot, c = this.cue, k = s.side * SIDE_K * -vn;
    c.vx += ny * k; c.vy -= nx * k;
    const m = Math.hypot(c.vx, c.vy); if (m > v0) { c.vx *= v0 / m; c.vy *= v0 / m; }
    s.side *= SIDE_KEEP;
    if (Math.abs(s.side) < 0.02) s.side = 0;
  }

  pot(b, i) {
    this.ev('pot', { ball: b, pocket: i, x: b.x, y: b.y });
    b.potted = true; b.vx = b.vy = 0;
    const s = this.shot;
    if (!s) return;
    if (b.isCue) s.scratch = true; else s.pots.push({ ball: b, pocket: i });
  }

  // The gate swings open when a ball pushes it from its open side, is solid from the other, and swings shut
  // again behind the ball.
  stepObstacle(live) {
    const o = this.hole.obst;
    if (o.type === 'gate') {
      const hits = () => { const [[ax, ay, bx, by]] = obstBars(this); return live.filter(b => segDist(b.x, b.y, ax, ay, bx, by) < R + BAR_T); };
      // swing back towards shut, but never into a ball
      if (this.gp > 0) { const was = this.gp; this.gp = Math.max(0, this.gp - GATE_BACK * DT); if (hits().length) this.gp = was; }
      for (const b of hits()) {
        const [[ax, ay, bx, by, side]] = obstBars(this);
        const ex = bx - ax, ey = by - ay, u = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
        const cx = ax + ex * u, cy = ay + ey * u, dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
        const vn = b.vx * nx + b.vy * ny, fromOpen = nx * side.nx + ny * side.ny < 0;
        if (fromOpen && vn < 0 && this.gp < GATE_MAX) {
          // the ball pushes the flap open and carries on, losing a little pace
          const first = this.gp < 0.05;
          for (let k = 0; k < 60 && this.gp < GATE_MAX && segDist(b.x, b.y, ...obstBars(this)[0].slice(0, 4)) < R + BAR_T; k++) this.gp = Math.min(GATE_MAX, this.gp + 0.02);
          // pushing the flap costs a little pace: a knock on first contact, then a gentle drag
          const f = first ? 0.85 : 0.998; b.vx *= f; b.vy *= f;
          if (first && -vn > 60) this.ev('gate', { speed: -vn, x: b.x, y: b.y });
        }
        const [[ax2, ay2, bx2, by2]] = obstBars(this), e2x = bx2 - ax2, e2y = by2 - ay2, u2 = clamp(((b.x - ax2) * e2x + (b.y - ay2) * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
        const c2x = ax2 + e2x * u2, c2y = ay2 + e2y * u2, d2x = b.x - c2x, d2y = b.y - c2y, dd = Math.hypot(d2x, d2y);
        if (dd >= R + BAR_T) continue;
        // still touching: it's the solid side (or the flap is wide open), so it's a wall
        const mx = dd ? d2x / dd : nx, my = dd ? d2y / dd : ny;
        b.x = c2x + mx * (R + BAR_T); b.y = c2y + my * (R + BAR_T);
        const v2 = b.vx * mx + b.vy * my;
        if (v2 < 0) { b.vx -= (1 + CUSHION_E) * v2 * mx; b.vy -= (1 + CUSHION_E) * v2 * my; b.wallPts = [...(b.wallPts || []), [b.x, b.y]]; if (-v2 > 60) this.ev('cushion', { speed: -v2, x: b.x, y: b.y }); }
      }
    }
  }

  // put a ball back near (x, y) without overlapping anything
  respot(b, x, y) {
    const free = (px, py) => (this.hole.shape ? freeIn(this.hole.shape, px, py, R + 1) : px > R && px < W - R && py > R && py < H - R) &&
      this.live().every(o => o === b || Math.hypot(o.x - px, o.y - py) > 2 * R + 2) &&
      this.bumps.every(o => Math.hypot(o.x - px, o.y - py) > o.r + R + 2) &&
      this.pk.every(p => Math.hypot(p.x - px, p.y - py) > p.cap + 4) &&
      tunMouths(this.hole).every(m => { const e = tunExit(m); return Math.hypot(e.x - px, e.y - py) > 2 * R + 4; }) &&
      obstBars(this).every(([ax, ay, bx, by]) => segDist(px, py, ax, ay, bx, by) > R + BAR_T + 2);
    for (let rad = 0; rad < 600; rad += 4) {
      for (let a = 0; a < TAU; a += 0.3) {
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (free(px, py)) { Object.assign(b, { x: px, y: py, vx: 0, vy: 0, potted: false }); return; }
        if (!rad) break;
      }
    }
  }
}

function cloneTable(t) {
  const c = Object.assign(Object.create(Table.prototype), t);
  c.ev = () => {};
  c.cue = { ...t.cue };
  c.cat = t.cat ? { ...t.cat } : null;
  c.bumps = c.cat ? [...t.hole.bumpers, c.cat] : t.hole.bumpers;
  c.balls = t.balls.map(b => ({ ...b }));
  c.shot = t.shot ? { ...t.shot, pots: [...t.shot.pots] } : null;
  return c;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(ax + dx * u - px, ay + dy * u - py);
}
function pathBlocked(t, ax, ay, bx, by, skip) {
  const sh = t.hole.shape;
  if (obstBars(t).some(([cx, cy, dx, dy]) => segSeg(ax, ay, bx, by, cx, cy, dx, dy) < R + BAR_T)) return true;
  // a line that runs up against a tunnel's opening: the ball would go in
  if (t.hole.tunnel && tunMouths(t.hole).some(m => tunCrosses(m, ax, ay, bx, by))) return true;
  return t.balls.some(b => !b.potted && b !== skip && segDist(b.x, b.y, ax, ay, bx, by) < 2 * R - 0.5) ||
    t.bumps.some(o => segDist(o.x, o.y, ax, ay, bx, by) < o.r + R) ||
    // shaped tables: corners sticking into the felt, and islands, get in the way
    !!sh && (sh.reflex.some(([x, y]) => segDist(x, y, ax, ay, bx, by) < R) ||
      sh.islands.length > 0 && sh.segs.slice(sh.outer.length).some(g => segSeg(ax, ay, bx, by, g.ax, g.ay, g.bx, g.by) < R));
}
// does a ball centre moving from (ax, ay) to (bx, by) come within R of the cushion across the tunnel's opening?
function tunCrosses(m, ax, ay, bx, by) {
  const p = tunLocal(m, ax, ay), q = tunLocal(m, bx, by);
  let s0 = 0, s1 = 1;
  const da = q.along - p.along, w = tunReach(m, bx - ax, by - ay);
  if (Math.abs(da) < 1e-9) { if (Math.abs(p.along) >= w) return false; }
  else { const u0 = (-w - p.along) / da, u1 = (w - p.along) / da; s0 = Math.max(0, Math.min(u0, u1)); s1 = Math.min(1, Math.max(u0, u1)); if (s0 > s1) return false; }
  return Math.min(p.out + (q.out - p.out) * s0, p.out + (q.out - p.out) * s1) < R;
}
// shortest distance between two segments
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const cr = (px, py, qx, qy) => px * qy - py * qx, d1 = cr(bx - ax, by - ay, cx - ax, cy - ay), d2 = cr(bx - ax, by - ay, dx - ax, dy - ay), d3 = cr(dx - cx, dy - cy, ax - cx, ay - cy), d4 = cr(dx - cx, dy - cy, bx - cx, by - cy);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDist(ax, ay, cx, cy, dx, dy), segDist(bx, by, cx, cy, dx, dy), segDist(cx, cy, ax, ay, bx, by), segDist(dx, dy, ax, ay, bx, by));
}
// How far a ball's centre travels from (px, py) along (dx, dy) before it touches cushion segment g.
function rayCushion(px, py, dx, dy, g) {
  let best = Infinity;
  const ex = g.bx - g.ax, ey = g.by - g.ay, den = dx * ey - dy * ex;
  if (Math.abs(den) > 1e-9) for (const sgn of [1, -1]) {
    if (dx * g.nx * sgn + dy * g.ny * sgn >= 0) continue;   // only the side the ball is heading into
    const qx = g.ax + g.nx * R * sgn - px, qy = g.ay + g.ny * R * sgn - py, t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
    if (t > -0.5 && u >= 0 && u <= 1) best = Math.min(best, Math.max(0, t));
  }
  for (const [cx, cy] of [[g.ax, g.ay], [g.bx, g.by]]) {
    const ox = px - cx, oy = py - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - R * R, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0.001) best = Math.min(best, t); }
  }
  return best;
}
// How far a ball's centre travels along (dx, dy) before it touches a bar of half-thickness th (only from the
// solid side if one is given).
function rayBar(px, py, dx, dy, ax, ay, bx, by, th, solid) {
  const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey), nx = -ey / l, ny = ex / l, r = R + th;
  if (solid && dx * solid.nx + dy * solid.ny >= 0) return Infinity;   // coming from the open side: it gives way
  let best = Infinity;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) > 1e-9) for (const sgn of [1, -1]) {
    const qx = ax + nx * r * sgn - px, qy = ay + ny * r * sgn - py, t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
    if (t > 0.001 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  for (const [cx, cy] of [[ax, ay], [bx, by]]) {
    const ox = px - cx, oy = py - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - r * r, disc = b * b - c;
    if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0.001) best = Math.min(best, t); }
  }
  return best;
}
// First thing a ball meets travelling from (px, py) along (dx, dy).
function trace(t, px, py, dx, dy, skip = null) {
  const ray = (cx, cy, rad) => {
    const ox = px - cx, oy = py - cy, b = ox * dx + oy * dy, c = ox * ox + oy * oy - rad * rad, disc = b * b - c;
    if (disc < 0) return Infinity;
    const s = -b - Math.sqrt(disc);
    return s > 0.001 ? s : Infinity;
  };
  let best = { t: Infinity };
  for (const b of t.balls) { if (b.potted || b === skip) continue; const s = ray(b.x, b.y, 2 * R); if (s < best.t) best = { t: s, ball: b }; }
  for (const o of t.bumps) { const s = ray(o.x, o.y, o.r + R); if (s < best.t) best = { t: s, bumper: o }; }
  // a tunnel's opening: where the ball centre gets to R from that cushion, inside the opening (checked after the
  // cushions, which it takes the place of)
  const tun = (b0) => { let bt = b0; tunMouths(t.hole).forEach((m, k) => {
    const p = tunLocal(m, px, py), vn = dx * m.nx + dy * m.ny;
    if (vn >= -1e-6) return;
    const s = Math.max(0, (p.out - R) / -vn), al = p.along + (dx * -m.ny + dy * m.nx) * s;
    if (Math.abs(al) < tunReach(m, dx, dy) && s <= bt.t + 0.5) bt = { t: s, tunnel: k };
  }); return bt; };
  for (const [ax, ay, bx, by, solid] of obstBars(t)) { const s = rayBar(px, py, dx, dy, ax, ay, bx, by, BAR_T, solid); if (s < best.t) best = { t: s, wall: true }; }
  if (t.hole.shape) {
    for (const g of t.hole.shape.segs) { const s = rayCushion(px, py, dx, dy, g); if (s < best.t) best = { t: s, wall: true, nx: g.nx, ny: g.ny }; }
    return tun(best);
  }
  const tx = dx > 0 ? (W - R - px) / dx : dx < 0 ? (R - px) / dx : Infinity;
  const ty = dy > 0 ? (H - R - py) / dy : dy < 0 ? (R - py) / dy : Infinity;
  if (Math.min(tx, ty) < best.t) best = tx < ty ? { t: tx, wall: true, nx: dx > 0 ? -1 : 1, ny: 0 } : { t: ty, wall: true, nx: 0, ny: dy > 0 ? -1 : 1 };
  return tun(best);
}

// ---- shot helpers ----

// The geometric line for potting ball bi into pocket i: where the cue ball must strike (the ghost ball).
function potLine(t, bi, i, from = t.cue) {
  const ball = t.balls[bi];
  if (ball.potted || !t.openPocket(i)) return null;
  const P = pocketAim(i, t.hole), d2 = Math.hypot(P.x - ball.x, P.y - ball.y);
  if (d2 < 1) return null;
  const ux = (P.x - ball.x) / d2, uy = (P.y - ball.y) / d2, gx = ball.x - ux * 2 * R, gy = ball.y - uy * 2 * R;
  if (t.hole.shape ? !freeIn(t.hole.shape, gx, gy, R - 1) : gx < R || gx > W - R || gy < R || gy > H - R) return null;
  const d1 = Math.hypot(gx - from.x, gy - from.y);
  if (d1 < 1) return null;
  const dx = (gx - from.x) / d1, dy = (gy - from.y) / d1, cos = dx * ux + dy * uy;
  if (cos < 0.42) return null;
  const blocked = pathBlocked(t, from.x, from.y, gx, gy, ball) || pathBlocked(t, ball.x, ball.y, P.x, P.y, ball);
  const q = cos ** 1.5 / (1 + (d1 + d2) / 1400) * (blocked ? 0.15 : 1);
  return { bi, pocket: i, angle: Math.atan2(dy, dx), cos, d1, d2, blocked, q, ghost: { x: gx, y: gy } };
}
function allLines(t) {
  const out = [];
  t.balls.forEach((b, bi) => { if (!b.potted) for (let i = 0; i < 6; i++) { const l = potLine(t, bi, i); if (l) out.push(l); } });
  return out;
}
function simulate(t, angle, power, spin = 0, path = null, side = 0) {
  const s = cloneTable(t);
  s.shoot(angle, power, spin, side);
  for (let n = 0; n < 9000 && s.moving(); n++) {
    s.step();
    if (path && n % 6 === 0 && !s.cue.potted) path.push([s.cue.x, s.cue.y]);
  }
  if (path && !s.cue.potted) path.push([s.cue.x, s.cue.y]);
  return s;
}
// The guide's question about one pace, answered as simulate() would but stopping as soon as the answer can't change:
// the pockets the first ball the cue ball meets drops into, off at most `cush` cushions (guideWalls), with the cue ball
// off at most `kick` before it and no scratch. (simulate() itself is untouched: the generator's holes depend on it.)
// Every exit is exact. Scratches, the cue ball's cushions before contact and the followed ball's cushions only ever
// grow, and a potted ball stays potted. To know a ball will never drop (the followed ball, or the cue ball once the
// followed ball is in), a bound on how far everything can still roll: friction takes at least (a + k v) off each speed,
// collisions and cushions only lose energy, so the total distance all the balls can still travel is at most
// n [u/k - a/k^2 ln(1 + k u / a)] with u = sqrt(E / n), E the sum of v^2 over the n balls on the table (canDrop, with
// a margin for the step-by-step physics).
// The bound is only used on holes where it holds: no tunnels (they move balls; a gate or sand only takes pace out),
// and a tilt weaker than the friction.
function guidePotsAt(t, angle, power, spin, kick, cush, side = 0) {
  const s = cloneTable(t), h = s.hole, tl = h.tilt;
  s.shoot(angle, power, spin, side);
  const a = ROLL_DECEL - Math.hypot(tl.x, tl.y), k = LIN_DAMP;   // sand only adds friction, so plain felt bounds it
  const bounded = !tunMouths(h).length && a > 20;
  const open = s.pk.filter((_, i) => s.openPocket(i));
  // how far a ball must still roll to drop into any open pocket (it drops once its centre is inside the mouth)
  const gap = b => open.reduce((m, p) => Math.min(m, Math.hypot(b.x - p.x, b.y - p.y) - p.cap), Infinity);
  // Can ball x still drop? Only if the balls can still roll, between them, as far as it takes for something moving to
  // reach x (through any chain of resting balls: each gap between them has to be rolled across) and for x to reach a
  // pocket's mouth.
  const rollable = live => {   // (0 when nothing moves)
    let E = 0, vmax = 0;
    for (const b of live) { const v2 = b.vx * b.vx + b.vy * b.vy; E += v2; if (v2 > vmax) vmax = v2; }
    if (!E) return 0;
    const n = live.length, u = Math.sqrt(E / n);
    return 1.1 * n * (u / k - a / (k * k) * Math.log(1 + k * u / a)) + 2 * R + 4 * Math.sqrt(vmax) * DT * n;
  };
  const canDrop = x => {
    const live = s.live(), roll = rollable(live), n = live.length;
    if (!roll) return false;
    let need = gap(x);
    if (roll >= need && !x.vx && !x.vy) {   // x is at rest: add the shortest chain of gaps from a moving ball to it
      const d = live.map(b => b.vx || b.vy ? 0 : Infinity), done = live.map(() => false);
      for (;;) {
        let m = -1;
        for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (m < 0 || d[i] < d[m])) m = i;
        if (m < 0 || live[m] === x) break;
        done[m] = true;
        for (let i = 0; i < n; i++) if (!done[i]) d[i] = Math.min(d[i], d[m] + Math.max(0, Math.hypot(live[i].x - live[m].x, live[i].y - live[m].y) - 2 * R));
      }
      need += d[live.indexOf(x)];
    }
    return roll >= need;
  };
  let walls = 0;
  for (let n = 0; n < 9000 && s.moving(); n++) {
    s.step();
    const sh = s.shot, b = sh.firstHit;
    if (sh.scratch) return [];
    if (!b) {
      if (s.cue.wallPts.length > kick) return [];
      // before the first contact only the cue ball rolls: if it can't get as far as any ball, it hits nothing
      if (bounded && n % 4 === 0) { const c = s.cue, roll = rollable([c]);
        if (s.balls.every(o => o.potted || Math.hypot(o.x - c.x, o.y - c.y) - 2 * R > roll)) return []; }
      continue;
    }
    if ((sh.kickWalls || 0) > kick) return [];
    if (b.potted) {
      const q = sh.pots.find(q => q.ball === b);
      if (guideWalls(s, b, q.pocket) > cush) return [];
      // in: the answer stands unless the cue ball can still follow it down
      if (s.cue.potted) return [];
      if (bounded && n % 4 === 0 && !canDrop(s.cue)) return [q.pocket];
      continue;
    }
    // off too many cushions to count whichever pocket it ends up in
    if (b.wallPts.length > cush && b.wallPts.length !== walls) {
      walls = b.wallPts.length;
      if (s.pk.every((_, i) => !s.openPocket(i) || guideWalls(s, b, i) > cush)) return [];
    }
    if (bounded && n % 4 === 0 && !canDrop(b)) return [];
  }
  const b = s.shot.firstHit;
  if (s.shot.scratch || !b || (s.shot.kickWalls || 0) > kick) return [];
  return s.shot.pots.filter(q => q.ball === b && guideWalls(s, q.ball, q.pocket) <= cush).map(q => q.pocket);
}

