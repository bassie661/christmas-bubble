const between = (min, max) => min + Math.random() * (max - min);
const stormBuildSeconds = 48;
const stormEaseSeconds = 68;
const flareSeconds = 2;
const frameIntervalMs = 1000 / 30;
const windMode = new URL(import.meta.url).searchParams.get('wind') ?? 'shared';

// Only the heading follows wall time, so buttons opened at different times agree.
function windHeading(mode, now, localDirection) {
  if (mode === 'independent') return localDirection;
  if (mode === 'left') return -1;
  if (mode === 'right') return 1;
  const period = 4 * 60 * 1000;
  const phase = now % period;
  const direction = Math.floor(now / period) % 2 === 0 ? 1 : -1;
  return direction * smoothStep(Math.min(phase, period - phase) / 3500);
}
const maxDriftDepth = 12;
// Back-row silhouettes share a higher snow line and project smaller on the button.
// Set the back street at the crest of the snowbank and the front street near its foot.
const chaletInset = house => 1 + 8 * house.villageScale * smoothStep((.76 - house.depth) / .55);
const treeInset = tree => tree.house ? Math.max(4, chaletInset(tree.house) - 1) : 1 + (1 - tree.depth) * 6;
const chaletStyles = [
  {wall: '#885f46', half: 8.5, ridge: 20, lamp: '#ffda85', chimneyX: 5.1},
  {wall: '#b69578', half: 10, ridge: 19, lamp: '#ffdca1', chimneyX: -5.8},
  {wall: '#795747', half: 8, ridge: 22, lamp: '#ffbe74', chimneyX: 4.4},
  {wall: '#b5a28b', half: 9.5, ridge: 21, lamp: '#ffe4ab', chimneyX: -4.8},
];

// Horizontal lots in main-roof half-widths. The back street sits in the gaps of the front street.
const village = [[0, .78], [-1.04, .31], [1.07, .35], [-1.93, .64],
  [1.96, .61], [-2.91, .24], [2.96, .27], [-3.80, .50]];

// Separate reproducible scenery from the random weather, smoke and snow.
function layoutRandom(seed, stream) {
  let state = (seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function chalet(index, balcony, layout) {
  const [lot, depth] = village[index];
  const style = chaletStyles[(index + (layout?.style ?? 0)) % chaletStyles.length];
  const smokePeriod = between(112, 158);
  const jitter = layout && index ? (layoutRandom(layout.seed, index + 48)() - .5) * .18 : 0;
  return {kind: 'house', lot: (lot + jitter) * (layout?.spacing ?? 1) * (layout?.side ?? 1), depth,
    naturalScale: (.48 + depth * .98) * (balcony ? .88 : 1), style, balconyRail: index % 3 === 1,
    eave: style.half + 2.5, chimneyTop: -style.ridge - 3, snow: [.22, .22],
    smoke: [], smokePeriod, smokeAge: between(0, smokePeriod), smokeCredit: 0};
}

function placeChalets(houses, width, position, size, clustering) {
  if (!houses.length) return;
  const factor = size === 'smaller' ? .78 : size === 'bigger' ? 1.10 : 1;
  const mainRoof = houses[0].eave * houses[0].naturalScale;
  const lotSpacing = clustering === 'tight' ? .78 : clustering === 'loose' ? 1.45 : 1;
  const spacing = lotSpacing * (position === 'spread' ? 1.45 : 1);
  let left = -mainRoof, right = mainRoof;
  for (const house of houses) {
    house.offset = house.lot * mainRoof * spacing;
    const roof = house.eave * house.naturalScale;
    left = Math.min(left, house.offset - roof);
    right = Math.max(right, house.offset + roof);
  }

  // Keep even the outer eaves in the selected third, with a margin at the rounded end.
  const start = width * (position === 'right' ? .65 : .065);
  const end = width * (position === 'left' ? .35 : .935);
  const scale = Math.min(factor, (end - start) / (right - left));
  const target = width * (position === 'left' ? .21 : position === 'right' ? .79 : .5);
  const center = Math.max(start - left * scale, Math.min(target, end - right * scale));
  for (const house of houses) {
    house.villageScale = scale;
    house.position = (center + house.offset * scale) / width;
    house.scale = house.naturalScale * scale;
  }
}

const groves = {
  balcony: [[.22, 12], [.52, 16], [.69, 23], [.73, 12]],
  tree: [[.15, 12], [.49, 16], [.54, 11], [.75, 13], [.80, 22], [.86, 16], [.91, 12]],
};

function groveTree(index, balcony, layout) {
  const random = layout ? layoutRandom(layout.seed, index + 2) : undefined;
  const shift = layout ? layout.groveShift[index % 3] + (random() - .5) * .05 : 0;
  const size = random ? .85 + random() * .26 : 1;
  const anchors = balcony ? groves.balcony : groves.tree;
  if (index < anchors.length) {
    const [position, height] = anchors[index];
    return pine(position + shift, height * size, (height - 6) / 22);
  }
  // Add saplings around the same stands. Stagger rows without reshuffling on resize.
  const row = index - anchors.length;
  const centers = balcony ? [.22, .51, .75] : [.18, .47, .84];
  const fraction = value => value - Math.floor(value);
  const depth = .09 + .77 * fraction(.38 + row * .618034);
  const spread = (fraction(.32 + row * .414214) - .5) * .14;
  const height = (8 + 18 * depth) * (.70 + .30 * fraction(.67 + row * .732051));
  return pine(centers[row % centers.length] + spread + shift, height * size, depth);
}

// The main doorstep and the two ends of a larger village each get a foreground pine.
function planChaletTrees(random = Math.random) {
  return Array.from({length: 3}, () => ({
    side: random() < .5 ? -1 : 1, height: .63 + random() * .11,
  }));
}

function chaletTree(house, placement) {
  const height = Math.max(10 * house.villageScale, house.style.ridge * house.scale * placement.height);
  const tree = pine(house.position, height, .90);
  tree.house = house;
  tree.houseScale = house.scale;
  return tree;
}

const treeX = (tree, width) => tree.position * width;

// Slide crowded trees along their grove until their crowns have a clear silhouette.
// Only the layout pass uses these intervals. The animation keeps its original objects.
function placeGroveTree(tree, target, width, occupied) {
  const margin = Math.min(48, width * .13);
  const radius = .34 * tree.height;
  const start = Math.min(width / 2, margin + radius);
  const end = width - start;
  const preferred = Math.min(end, Math.max(start, target));
  const blockers = occupied.map(([left, right]) => [left - radius, right + radius]);
  const clearance = x => {
    let gap = Infinity;
    for (const [left, right] of blockers) gap = Math.min(gap, Math.max(left - x, x - right));
    return gap;
  };
  let best = preferred;
  if (clearance(preferred) < 0) {
    let bestScore = -Infinity;
    const steps = Math.min(220, Math.max(1, Math.ceil((end - start) / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = start + (end - start) * i / steps;
      const score = 1000 * Math.min(0, clearance(x)) - Math.abs(x - preferred);
      if (score > bestScore) { best = x; bestScore = score; }
    }
  }
  tree.position = best / width;
  occupied.push([best - radius, best + radius]);
}

function sceneryCount(value, fallback, max) {
  if (value == null || String(value).trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : fallback;
}
const snowHeightScale = 2 / 3;
const cloudHeightScale = 2 / 3;

function gustAt(x, center, strength, gust) {
  return strength ? strength * Math.exp(-2 * ((x - center) / gust.radius) ** 2) : 0;
}

// The whole scene feels the gust. Its moving core carries the strongest wind.
function airGustAt(x, center, strength, gust) {
  return .62 * strength + .38 * gustAt(x, center, strength, gust);
}

// Project each whorl of boughs onto the button. Positive z points towards the viewer.
function pine(position, height, depth) {
  const branches = [];
  for (let tier = 0; tier < 3; tier++) {
    const span = height * (.38 - .075 * tier);
    const whorl = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + .21 + tier * .29;
      const x = Math.cos(angle) * span;
      const z = Math.sin(angle);
      const top = -height * (.59 + .2 * tier);
      const drop = height * (.45 - tier * .055) + z * span * .42;
      whorl.push({x, z, top, drop, span, snow: between(.30, .59)});
    }
    branches.push(...whorl.sort((a, b) => a.z - b.z));
  }
  return {kind: 'tree', position, branches, height, depth, bend: 0, trunkBend: 0, velocity: 0, release: 0};
}

// The rooted trunk barely shifts; displacement increases towards the flexible crown.
function crownOffset(tree, y) {
  const height = Math.max(0, -y);
  const crown = smoothStep((height / tree.height - .65) / .31);
  const bend = tree.trunkBend + crown * (tree.bend - tree.trunkBend);
  return bend * height * height / tree.height;
}

function smoothStep(value) {
  const v = Math.max(0, Math.min(1, value));
  return v * v * (3 - 2 * v);
}

function nightSky(balcony) {
  const stars = Array.from({length: 14}, () => ({
    x: between(.13, .97), y: between(.045, .32), radius: between(.55, 1.05),
  }));
  const centers = balcony ? [[.39, .11], [.65, .23], [.84, .10]] : [[.30, .12], [.55, .19], [.78, .15]];
  for (const [x, y] of centers) {
    for (let i = 0; i < 6; i++) {
      const angle = between(0, 2 * Math.PI);
      const spread = between(.24, 1);
      stars.push({x: x + .040 * spread * Math.cos(angle), y: y + .076 * spread * Math.sin(angle),
        radius: between(.33, .78)});
    }
  }
  return stars;
}

class SnowScene {
  constructor(canvas, balcony, defaultTreeSeed) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flakes = [];
    this.ground = Array(65).fill(1);
    this.stormAge = 0;
    this.blizzard = 0;
    this.cloudCover = 0;
    this.banks = [];
    this.deckOffset = 0;
    this.quiet = between(7, 15);
    this.peak = between(85, 115);
    this.elapsed = between(0, 120);
    this.nextGust = this.elapsed + between(3, 8);
    this.nextFlare = this.elapsed + between(10, 24);
    this.phase = between(0, 2 * Math.PI);
    this.draw = this.draw.bind(this);
    this.balcony = balcony;
    this.windMode = windMode;
    this.houses = [];
    this.trees = [];
    this.defaultTreePlan = planChaletTrees(defaultTreeSeed === undefined ? Math.random : layoutRandom(defaultTreeSeed, 1));
    this.chaletTreePlan = this.defaultTreePlan;
    this.scenery = [];
    this.stars ??= nightSky(this.balcony);
    this.clouds ??= (this.balcony ? [[.22, .10, .68], [.46, .16, 1], [.62, .10, .60]]
      : [[.43, .12, .77], [.68, .16, .92]]).map(([position, height, size]) => ({
      position, height, size, offset: 0, wind: 0, phase: between(0, 2 * Math.PI),
    }));
  }

  updateScenery(treeCount, houseCount, width, housePosition, houseSize, houseClustering) {
    if (!width || (this.width === width && this.trees.length === treeCount && this.houses.length === houseCount
      && this.housePosition === housePosition && this.houseSize === houseSize && this.houseClustering === houseClustering)) return;
    this.housePosition = housePosition;
    this.houseSize = houseSize;
    this.houseClustering = houseClustering;
    while (this.houses.length < houseCount) this.houses.push(chalet(this.houses.length, this.balcony, this.layout));
    this.houses.length = houseCount;
    placeChalets(this.houses, width, housePosition, houseSize, houseClustering);
    const streets = [...this.houses].sort((a, b) => a.position - b.position);
    const main = this.houses[0];
    const left = streets[0], right = streets.at(-1);
    const doors = [main, streets.length >= 3 ? left : null, streets.length >= 5 ? right : null];
    const occupied = this.houses.map(h => {
      const x = h.position * width, roof = h.eave * h.scale;
      return [x - roof, x + roof];
    });
    this.trees.length = treeCount;
    // Reserve the doorstep trees first so larger groups also leave space around them.
    for (let i = 0; i < treeCount; i++) {
      const slot = i / 4;
      const house = doors[slot] ?? undefined;
      let tree = this.trees[i];
      if (!tree || tree.house !== house || tree.houseScale !== house?.scale) {
        tree = this.trees[i] = house ? chaletTree(house, this.chaletTreePlan[slot]) : groveTree(i, this.balcony, this.layout);
        tree.grovePosition = tree.position;
      }
      if (!house) continue;
      const side = slot === 0 ? this.chaletTreePlan[slot].side : house === left ? -1 : 1;
      const x = house.position * width + side * (house.style.half * house.scale + tree.height * .12);
      tree.position = x / width;
      occupied.push([x - tree.height * .38, x + tree.height * .38]);
    }
    for (let i = 0; i < treeCount; i++) {
      const tree = this.trees[i];
      if (tree.house) continue;
      let target = tree.grovePosition * width;
      if (main && i === 2) {
        const edge = main.position > .5 ? left : right;
        const side = main.position > .5 ? -1 : 1;
        target = edge.position * width + side * (edge.eave * edge.scale + tree.height * .48);
      }
      placeGroveTree(tree, target, width, occupied);
    }
    this.scenery = [...this.trees, ...this.houses].sort((a, b) => a.depth - b.depth);
  }

  update({width, height, scale, visible, reduced, level, treeCount, houseCount, seed, wind, housePosition, houseSize, houseClustering, alwaysNight, alwaysSnowing, alwaysWindy, adjusting}) {
    const layoutSeed = Number(seed) >>> 0;
    if (layoutSeed !== (this.layout?.seed ?? 0)) {
      const random = layoutRandom(layoutSeed, 0);
      this.layout = layoutSeed ? {seed: layoutSeed, side: random() < .5 ? -1 : 1,
        spacing: .97 + random() * .08, style: Math.floor(random() * chaletStyles.length),
        groveShift: Array.from({length: 3}, () => (random() - .5) * .15)} : undefined;
      this.chaletTreePlan = layoutSeed ? planChaletTrees(layoutRandom(layoutSeed, 1)) : this.defaultTreePlan;
      this.trees = [];
      this.houses = [];
      this.scenery = [];
    }
    this.windMode = ['left', 'right', 'independent', 'shared'].includes(wind) ? wind : windMode;
    this.updateScenery(sceneryCount(treeCount, this.balcony ? 4 : 7, 36), sceneryCount(houseCount, 1, village.length), width, housePosition, houseSize, houseClustering);
    if (this.width !== width || this.height !== height || this.scale !== scale) {
      this.width = width;
      this.height = height;
      this.scale = scale;
      this.canvas.width = Math.round(width * scale);
      this.canvas.height = Math.round(height * scale);
      if (width && height) this.ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    }
    this.alwaysSnowing = alwaysSnowing;
    this.alwaysWindy = alwaysWindy;
    this.reduced = reduced;
    const previewDay = this.balcony && adjusting;
    this.level = alwaysNight && !previewDay ? 0 : level;
    this.sunTarget = alwaysNight ? Number(Boolean(previewDay)) : Number(level !== null && level > (this.balcony ? 50 : 0));
    if (this.daylight === undefined || reduced || alwaysNight) this.daylight = this.sunTarget;
    const active = visible && width && height && !reduced;
    if (active && !this.frame) {
      this.last = performance.now();
      this.nextPaint = undefined;
      this.frame = requestAnimationFrame(this.draw);
    } else if (!active) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.ctx.clearRect(0, 0, this.width || 0, this.height || 0);
      if (visible && width && height && reduced) {
        this.daylight = this.sunTarget;
        this.drawSky();
        this.drawLandscape(true);
      }
    }
  }

  drawGalaxy(x, y, scale, tilt) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale * .36);
    const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
    haze.addColorStop(0, '#ffe7a8dc');
    haze.addColorStop(.19, '#ffd87994');
    haze.addColorStop(.57, '#efc98336');
    haze.addColorStop(1, '#e7bb7f00');
    ctx.fillStyle = haze;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeStyle = '#f2cf824d';
    ctx.lineWidth = .65;
    for (let arm = 0; arm < 2; arm++) {
      ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(.6, 0);
      ctx.bezierCurveTo(3, -3, 6, .4, 3, 3);
      ctx.quadraticCurveTo(0, 6, -6, 3.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStarFlare(x, y, age) {
    const pulse = Math.sin(Math.PI * age / flareSeconds) ** 2;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= pulse;
    const radius = 4 + 10 * pulse;
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    halo.addColorStop(0, '#ffe795e8');
    halo.addColorStop(.35, '#ffcb536b');
    halo.addColorStop(1, '#ffb52e00');
    ctx.fillStyle = halo;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.rotate(-.13);
    const ray = 2 + 10 * pulse;
    ctx.fillStyle = '#fff2ab';
    ctx.beginPath();
    ctx.moveTo(-ray, 0);
    ctx.lineTo(-1, -1);
    ctx.lineTo(0, -ray * .71);
    ctx.lineTo(1, -1);
    ctx.lineTo(ray, 0);
    ctx.lineTo(1, 1);
    ctx.lineTo(0, ray * .71);
    ctx.lineTo(-1, 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  moveClouds(dt, breeze, center, strength, gust) {
    const direction = gust?.direction || 0;
    const deckTravel = Math.min(22, this.width * .055);
    this.deckOffset += dt * (strength * direction * deckTravel - this.deckOffset) / 5;
    for (const cloud of this.clouds) {
      const x = this.width * cloud.position + cloud.offset;
      const local = airGustAt(x, center, strength, gust);
      const wind = (1 - strength) * breeze / 10 + local * direction * 3;
      cloud.wind += (wind - cloud.wind) * (1 - Math.exp(-dt / 1.2));
      // Let each cloud follow the breeze with inertia and stay near its patch of sky.
      cloud.offset += dt * ((this.balcony ? 1.7 : 1.15) * cloud.wind - cloud.offset / 12);
    }
  }

  drawDaySky() {
    const ctx = this.ctx;
    ctx.fillStyle = '#87c9ea42';
    ctx.fillRect(0, 0, this.width, this.height);

    // Keep the clouds high and clear of the sun and the balcony percentage badge.
    for (const cloud of this.clouds) {
      const t = this.elapsed;
      const swell = .5 + .5 * Math.sin(t / (11 + cloud.size * 5) + cloud.phase);
      const curl = Math.sin(t / 8.5 + cloud.phase * 2);
      const stretch = Math.abs(cloud.wind) * (this.balcony ? .32 : .22);
      const tail = cloud.wind * 2.5;
      ctx.save();
      ctx.translate(this.width * cloud.position + cloud.offset,
        (this.height * cloud.height + curl * .8) * cloudHeightScale);
      ctx.scale(cloud.size * (.87 + .32 * swell + stretch),
        cloudHeightScale * cloud.size * (.85 + .33 * swell) / (1 + .5 * stretch));
      const light = ctx.createLinearGradient(0, -5, 0, 3.5);
      light.addColorStop(0, '#fffdf4ee');
      light.addColorStop(.54, '#e3edf2e8');
      light.addColorStop(1, '#bdcedbd6');
      ctx.fillStyle = light;
      ctx.beginPath();
      const left = -10 + Math.min(0, tail);
      const right = 12 + Math.max(0, tail);
      ctx.moveTo(left, 2);
      ctx.bezierCurveTo(left - 1, -.4, -8, -2.6 - curl, -5, -1.5);
      ctx.bezierCurveTo(-4 + tail * .4, -4.5 - 2 * swell, 2 + curl, -6 - curl, 3.6, -2.1);
      ctx.bezierCurveTo(7, -3.4 + curl, 9, -1, 9, .2);
      ctx.bezierCurveTo(right + 1, .6, right, 2.8, 7, 3.2);
      ctx.quadraticCurveTo(-5, 3.5 + swell, left, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  formCloudDeck() {
    this.banks = [];
    if (this.cloudCover <= 0) return;
    for (let i = 0; i < 5; i++) {
      // One patch arrives first. The remaining patches broaden until the gaps close.
      const amount = smoothStep((this.cloudCover - (i % 3) * .09) / (1 - (i % 3) * .09));
      if (!amount) continue;
      const phase = this.phase + i * 2.3;
      const x = this.width * (.033 + i * .233 + .035 * Math.sin(this.elapsed / 29 + phase))
        + this.deckOffset;
      const radius = this.width * (.05 + .135 * amount);
      const depth = cloudHeightScale * this.height * (.07 + (.25 + .04 * Math.sin(phase)) * amount);
      // Overlapping tufts share a base but have independent heights and widths.
      // Small banks float clear of the top before they merge into an overcast sky.
      const y = cloudHeightScale * this.height * (.12 - .08 * amount + .025 * Math.sin(phase));
      const puffs = [];
      for (let j = 0; j < 7; j++) {
        const offset = (j - 3) / 4;
        const wave = Math.sin(phase * 2 + j * 2.7 + this.elapsed / 24);
        const fullness = (1 - .61 * Math.abs(offset)) * (.83 + .17 * wave);
        puffs.push({
          offset: offset + .035 * wave,
          width: .27 + .12 * fullness,
          y: y + depth * (.11 * Math.cos(phase + j * 2.1) - .14 * fullness),
          height: depth * fullness,
        });
      }
      this.banks.push({x, radius, depth, y, puffs, amount});
    }
  }

  cloudBase(bank, u) {
    let base = bank.y;
    for (const puff of bank.puffs) {
      const dx = (u - puff.offset) / puff.width;
      if (Math.abs(dx) < 1) base = Math.max(base, puff.y + puff.height * Math.sqrt(1 - dx * dx));
    }
    return base;
  }

  drawCloudDeck() {
    const ctx = this.ctx;
    ctx.save();
    for (const bank of this.banks) {
      ctx.beginPath();
      for (const puff of bank.puffs) {
        const x = bank.x + puff.offset * bank.radius;
        const rx = bank.radius * puff.width;
        ctx.moveTo(x + rx, puff.y);
        ctx.ellipse(x, puff.y, rx, puff.height, 0, 0, Math.PI * 2);
      }
      // Shade the cloud itself. Clear openings between banks retain the sky colour.
      for (const [light, crown, middle, base] of [
        [1 - this.daylight, '#627181', '#485867', '#34414d'],
        [this.daylight, '#f1f4f4', '#d5e0e5', '#9eafbe'],
      ]) {
        if (!light) continue;
        const shade = ctx.createLinearGradient(0, bank.y - bank.depth, 0, bank.y + bank.depth);
        shade.addColorStop(0, crown);
        shade.addColorStop(.54, middle);
        shade.addColorStop(1, base);
        ctx.fillStyle = shade;
        ctx.globalAlpha = bank.amount * light * .94;
        ctx.fill();
      }
      // Soft overlapping billows give the deck depth at the scale of each tuft.
      ctx.save();
      ctx.clip();
      for (let i = 1; i < bank.puffs.length; i += 2) {
        const puff = bank.puffs[i];
        const x = bank.x + bank.radius * puff.offset;
        ctx.save();
        ctx.translate(x, puff.y + .15 * puff.height);
        ctx.scale(bank.radius * puff.width, puff.height);
        const billow = ctx.createRadialGradient(-.18, -.2, .05, 0, 0, 1);
        billow.addColorStop(0, '#dee8ed');
        billow.addColorStop(1, '#dee8ed00');
        ctx.globalAlpha = bank.amount * (.09 + .16 * this.daylight);
        ctx.fillStyle = billow;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawSky() {
    if (this.level == null) return;
    const ctx = this.ctx;
    ctx.save();
    if (this.daylight > 0) {
      ctx.globalAlpha = this.daylight;
      this.drawDaySky();
    }
    if (this.daylight < 1) {
      ctx.save();
      const boundary = this.balcony ? this.width * this.level / 100 : 0;
      ctx.beginPath();
      ctx.rect(boundary, 0, this.width - boundary, this.height);
      ctx.clip();
      const starLight = (1 - this.daylight) * (1 - .96 * this.cloudCover);
      ctx.globalAlpha = starLight;
      this.drawGalaxy(this.width * (this.balcony ? .57 : .70), this.height * .14, .86, -.31);
      this.drawGalaxy(this.width * (this.balcony ? .73 : .48), this.height * .11, .49, .24);
      const visible = this.stars.filter(star => {
        const x = star.x * this.width, y = star.y * this.height;
        return x >= boundary && (x >= this.width * .47 || y <= this.height * .20)
          && (!this.balcony || x <= this.width - 70 || y <= 9);
      });
      if (!this.reduced && this.cloudCover < .4 && this.sunTarget === 0 && this.elapsed >= this.nextFlare && visible.length) {
        this.flareStar = visible[Math.floor(Math.random() * visible.length)];
        this.flareStart = this.elapsed;
        this.nextFlare = this.elapsed + flareSeconds + between(25, 50);
      }
      ctx.fillStyle = '#ffda65';
      for (const star of visible) {
        const x = star.x * this.width;
        const y = star.y * this.height;
        // Faint stars disappear into the haze before the brighter ones do.
        ctx.globalAlpha = starLight * smoothStep((.38 + .62 * star.radius - this.cloudCover) / .24)
          * (.48 + .29 * star.radius);
        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fill();
        if (star === this.flareStar && !this.reduced && this.elapsed - this.flareStart < flareSeconds) {
          this.drawStarFlare(x, y, this.elapsed - this.flareStart);
        }
      }
      ctx.restore();
    }
    if (this.daylight > 0) {
      const x = this.width - (this.balcony ? 84 : 31);
      const y = 14;
      ctx.globalAlpha = this.daylight * (1 - .60 * this.cloudCover);
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 13);
      glow.addColorStop(0, '#ffe8a8b0');
      glow.addColorStop(1, '#ffdd8200');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 13, y - 13, 26, 26);
      ctx.translate(x, y);
      ctx.fillStyle = '#fff0b8';
      ctx.beginPath();
      ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-.6, -8, 1.2, 2);
      }
    }
    ctx.restore();
    this.drawCloudDeck();
  }

  flake(x, y, size, depth = Math.random()) {
    return {x, y, depth, size: size * (.55 + depth * .82), vx: 0, vy: size * 3 + 3, phase: between(0, 6.28),
      flutter: between(.7, 1.65), opacity: between(.46, .94)};
  }

  startGust() {
    const direction = Math.random() < (this.balcony ? .67 : .42) ? 1 : -1;
    const tree = this.trees[Math.floor(Math.random() * this.trees.length)];
    this.gust = {
      start: this.elapsed, duration: this.balcony ? between(70, 100) : between(60, 90),
      origin: tree ? treeX(tree, this.width) : Math.random() * this.width, reach: this.width * between(.13, .25),
      radius: between(34, this.balcony ? 58 : 47), direction, lifted: 0
    };
    this.nextGust = this.elapsed + this.gust.duration + between(15, this.balcony ? 30 : 38);
  }

  drawTree(tree, still = false) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(treeX(tree, this.width), this.height - treeInset(tree));
    const offset = y => still ? 0 : crownOffset(tree, y);
    ctx.fillStyle = '#49635e';
    ctx.beginPath();
    ctx.moveTo(-.85, 0);
    ctx.quadraticCurveTo(-.85, -2.5, -.85 + offset(-5), -5);
    ctx.lineTo(.85 + offset(-5), -5);
    ctx.quadraticCurveTo(.85, -2.5, .85, 0);
    ctx.fill();
    for (const branch of tree.branches) {
      const {top, drop, span, x, z, snow} = branch;
      const tip = top + drop;
      const shoulder = span * (.31 + .12 * Math.abs(z));
      const mid = top + drop * .58;
      ctx.fillStyle = tree.depth < .32
        ? (z < 0 ? '#406066' : x < 0 ? '#587e7c' : '#49716d')
        : (z < 0 ? '#194a49' : x < 0 ? '#368071' : '#28665f');
      ctx.beginPath();
      const midX = x * .52 + offset(mid);
      ctx.moveTo(offset(top), top);
      ctx.lineTo(midX + shoulder, mid);
      ctx.lineTo(x + offset(tip), tip);
      ctx.lineTo(midX - shoulder, mid);
      ctx.closePath();
      ctx.fill();

      // A pillow on the upper face widens and deepens under fresh snow.
      if (snow > .04) {
        const reach = .26 + .72 * snow;
        const endX = x * reach;
        const endY = top + drop * reach;
        const breadth = shoulder * (.20 + .85 * snow);
        const ridgeY = top + (endY - top) * .62 - snow * .85;
        const capY = top - snow * .7;
        const capX = offset(capY);
        const ridgeX = offset(ridgeY);
        ctx.fillStyle = z < 0 ? '#b4d5e4' : '#d9ecf4';
        ctx.beginPath();
        ctx.moveTo(capX, capY);
        ctx.quadraticCurveTo(ridgeX + endX * .45 + breadth, ridgeY, endX + offset(endY), endY);
        ctx.quadraticCurveTo(offset(ridgeY + snow) + endX * .47 - breadth * 1.65, ridgeY + snow, capX, capY);
        ctx.fill();
        ctx.fillStyle = '#f8fdff';
        ctx.beginPath();
        ctx.moveTo(capX, capY);
        ctx.quadraticCurveTo(ridgeX + endX * .46 - breadth * 1.35, ridgeY, endX + offset(endY - snow * .6), endY - snow * .6);
        ctx.quadraticCurveTo(ridgeX + endX * .53, ridgeY, capX, capY);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  moveSmoke(house, dt, wind) {
    house.smokeAge += dt;
    if (house.smokeAge >= house.smokePeriod) {
      house.smokeAge -= house.smokePeriod;
      house.smokePeriod = between(112, 158);
    }
    const half = house.smokePeriod / 2;
    const firing = smoothStep(house.smokeAge / 13) * smoothStep((half - house.smokeAge) / 15);
    // A light breeze leaves room for buoyancy. Gusts carry the plume along faster.
    const gust = smoothStep((Math.abs(wind) - 7) / 28);
    const drift = wind * (.38 + .29 * gust);
    // Emit a continuous plume. Puffs born together hold or disperse together at its tip.
    house.smokeCredit += dt * (11 + .22 * Math.abs(drift)) * firing;
    while (house.smokeCredit >= 1) {
      house.smokeCredit--;
      const pulse = Math.sin(12 * house.smokeAge + .9 * Math.sin(3.7 * house.smokeAge));
      house.smoke.push({x: 0, y: 0, age: 0, life: between(2.2, 3.6), vx: drift * .7,
        cohesion: smoothStep((pulse + .15) / .65), phase: between(0, 6.28), opacity: firing * between(.38, .64)});
    }
    house.smoke = house.smoke.filter(puff => {
      // Gusts disperse the smoke sooner while carrying each puff at wind speed.
      puff.age += dt * (1 + 1.60 * gust);
      if (puff.age >= puff.life) return false;
      const swirl = Math.sin(this.elapsed * 1.7 + puff.phase + puff.age);
      puff.vx += (drift + 2.8 * swirl - puff.vx) * (1 - Math.exp(-dt * 3));
      puff.x += puff.vx * dt;
      puff.y -= dt * (6.5 + swirl) / (1 + Math.abs(puff.vx) * .08);
      return true;
    });
  }

  drawCottage(house) {
    const ctx = this.ctx;
    const {style, eave, chimneyTop} = house;
    ctx.save();
    ctx.translate(this.width * house.position, this.height - chaletInset(house));
    ctx.scale(house.scale, house.scale);
    ctx.fillStyle = this.daylight > .5 ? '#89959d' : '#c6cdd0';
    for (const puff of house.smoke) {
      const age = puff.age / puff.life;
      const stretch = Math.min(1, Math.abs(puff.vx) / 32);
      const tail = smoothStep((age - .32) / .26) * smoothStep((Math.abs(puff.vx) - 8) / 15);
      const length = (.75 + age * 1.8) * (1 + 2.2 * Math.min(stretch, .60)) * (1 - .30 * tail);
      const thickness = (.7 + age * 1.6) * (1 - .7 * Math.min(stretch, .40));
      ctx.globalAlpha = puff.opacity * (1 - age) ** 1.3 * (1 - .35 * stretch) * (1 - tail * (1 - puff.cohesion));
      ctx.beginPath();
      ctx.ellipse(style.chimneyX + puff.x, chimneyTop + puff.y, length, thickness,
        -.28 * (1 - stretch) * Math.sign(puff.vx), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = style.wall;
    ctx.fillRect(-style.half, -12, 2 * style.half, 12);
    ctx.fillStyle = '#573d34';
    ctx.fillRect(-1.4, -7, 2.8, 7);
    ctx.fillRect(style.chimneyX - 1.5, chimneyTop, 3, 11);
    ctx.fillStyle = '#876e66';
    ctx.fillRect(style.chimneyX - 2.1, chimneyTop - .6, 4.2, 1.6);
    ctx.fillStyle = '#493f42';
    ctx.beginPath();
    ctx.moveTo(-eave, -11); ctx.lineTo(0, -style.ridge); ctx.lineTo(eave, -11);
    ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round';
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1;
      const snow = house.snow[side];
      ctx.beginPath();
      ctx.moveTo(0, -style.ridge);
      ctx.quadraticCurveTo(sign * eave / 2, -(style.ridge + 11) / 2 - .6 * snow, sign * (eave - .4), -11.4);
      ctx.strokeStyle = '#e5f2f7';
      ctx.lineWidth = .5 + snow * 2.6;
      ctx.stroke();
    }
    for (const x of [-style.half + 2, style.half - 5.4]) {
      ctx.fillStyle = '#6590a2';
      ctx.fillRect(x, -11.2, 3.5, 4.4);
      ctx.globalAlpha = 1 - this.daylight;
      ctx.fillStyle = style.lamp;
      ctx.fillRect(x, -11.2, 3.5, 4.4);
      ctx.globalAlpha *= .14;
      ctx.fillRect(x - 1, -12.2, 5.5, 6.4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#634938';
      ctx.fillRect(x + 1.5, -11.2, .5, 4.4);
    }
    if (house.balconyRail) {
      ctx.fillStyle = '#594237';
      ctx.fillRect(-style.half, -6.4, 2 * style.half, .8);
      for (let x = -style.half + 1; x < style.half; x += 3) ctx.fillRect(x, -6.4, .7, 2.8);
      ctx.fillRect(-style.half - .5, -4, 2 * style.half + 1, 1);
    }
    ctx.restore();
  }

  moveTrees(dt, center, strength, gust) {
    for (const tree of this.trees) {
      const x = treeX(tree, this.width);
      const wind = airGustAt(x, center, strength, gust);
      const target = (gust?.direction || 0) * wind * (.16 + .56 * wind);
      const frequency = 4.4 + (23 - tree.height) * .075;
      tree.velocity += (frequency * frequency * (target - tree.bend) - .92 * frequency * tree.velocity) * dt;
      tree.bend += tree.velocity * dt;
      tree.trunkBend += (.5 * tree.bend - tree.trunkBend) * (1 - Math.exp(-dt / .65));
      if (wind < .55) continue;
      tree.release += (wind - .55) * dt * 16;
      while (tree.release >= 1) {
        tree.release--;
        const loaded = tree.branches.filter(branch => branch.snow >= .12);
        if (!loaded.length) break;
        const branch = loaded[Math.floor(Math.random() * loaded.length)];
        const along = between(.25, .35 + .65 * branch.snow);
        const y = branch.top + along * branch.drop;
        const flake = this.flake(x + crownOffset(tree, y) + along * branch.x, this.height - treeInset(tree) - 1 + y,
          between(.7, 1.35), tree.depth + along * branch.z * branch.span / 40);
        flake.vx = gust.direction * between(38, 62);
        flake.vy = between(1, 4);
        this.flakes.push(flake);
        branch.snow = Math.max(0, branch.snow - .055 * flake.size);
      }
    }
  }

  catchSnow(flake, oldY, oldX = flake.x) {
    if (flake.vy <= 0 || flake.y < this.height - 40) return false;
    const travel = flake.x - oldX;
    for (const house of this.houses) {
      if (Math.abs(flake.depth - house.depth) >= .14) continue;
      const base = this.height - chaletInset(house);
      const roofX = (flake.x - this.width * house.position) / house.scale;
      if (Math.abs(roofX) <= house.eave) {
        const side = Number(roofX > 0);
        const roofY = base + house.scale * (-house.style.ridge + Math.abs(roofX) * (house.style.ridge - 11) / house.eave - house.snow[side]);
        if (oldY <= roofY && flake.y >= roofY) {
          house.snow[side] = Math.min(1, house.snow[side] + .008 * flake.size);
          return true;
        }
      }
      if (travel) {
        const wallX = house.position * this.width - Math.sign(travel) * house.style.half * house.scale;
        const crossing = (wallX - oldX) / travel;
        if (crossing >= 0 && crossing <= 1) {
          const hitY = oldY + crossing * (flake.y - oldY);
          if (hitY >= base - 12 * house.scale && hitY <= base) {
            const bin = Math.max(0, Math.min(this.ground.length - 1, Math.round(wallX / this.width * (this.ground.length - 1))));
            this.ground[bin] = Math.min(maxDriftDepth, this.ground[bin] + .006 * flake.size);
            return true;
          }
        }
      }
    }
    for (const tree of this.trees) {
      const base = this.height - treeInset(tree);
      const dx = flake.x - treeX(tree, this.width) - crownOffset(tree, flake.y - base);
      if (Math.abs(dx) > tree.height * .42) continue;
      const dz = (flake.depth - tree.depth) * 40;
      for (const branch of tree.branches) {
        const tipZ = branch.z * branch.span;
        const along = (dx * branch.x + dz * tipZ) / (branch.span ** 2);
        if (along < 0 || along > 1 || Math.hypot(dx - branch.x * along, dz - tipZ * along) > branch.span * .33) continue;
        const surface = base + branch.top + along * branch.drop - branch.snow * .75 - flake.size * .5;
        if (oldY <= surface && flake.y >= surface) {
          branch.snow = Math.min(1, branch.snow + .032 * flake.size);
          return true;
        }
      }
    }
    return false;
  }

  snowfall(dt) {
    this.stormAge += dt;
    const age = this.stormAge - this.quiet;
    const peakAge = age - stormBuildSeconds;
    const easingAge = peakAge - this.peak;
    // Dense, wind-driven snow arrives only once the cloud deck has closed.
    const snowBand = .88 + .12 * Math.sin(this.elapsed / 7.5 + this.phase);
    this.blizzard = snowBand * smoothStep(peakAge / 15) * smoothStep(-easingAge / 22);
    this.cloudCover = smoothStep(age / stormBuildSeconds) * (1 - smoothStep(easingAge / stormEaseSeconds));
    if (this.alwaysSnowing) this.cloudCover = Math.max(this.cloudCover, .58 + .04 * Math.sin(this.elapsed / 14 + this.phase));
    this.formCloudDeck();
    if (easingAge >= stormEaseSeconds) {
      this.stormAge = 0;
      this.quiet = between(185, this.balcony ? 240 : 265);
      this.peak = between(85, 115);
    }
    return smoothStep((this.cloudCover - .20) / .80);
  }

  groundTop(index) {
    const x = index / (this.ground.length - 1);
    const depth = 3.4 + this.ground[index] + .85 * Math.sin(x * 13 + this.phase);
    return this.height - depth * snowHeightScale;
  }

  surfaceAt(x) {
    const index = Math.max(0, Math.min(1, x / this.width)) * (this.ground.length - 1);
    const left = Math.floor(index);
    const height = this.groundTop(left);
    return height + (this.groundTop(Math.ceil(index)) - height) * (index - left);
  }

  transferGroundSnow(from, to, amount) {
    const room = maxDriftDepth - this.ground[to];
    const moved = Math.min(Math.max(0, this.ground[from] - .45), room, amount * Math.min(1, room / 4));
    this.ground[from] -= moved;
    this.ground[to] += moved;
  }

  driftSnow(dt, gust, center, strength) {
    // Transfer loose snow downwind. The flux falls behind a tree or at the
    // trailing edge of a gust, so the snow collects there over successive gusts.
    const step = gust.direction;
    const last = this.ground.length - 1;
    const spacing = this.width / last;
    const walls = this.houses.map(house => {
      const x = house.position * this.width;
      const half = house.style.half * house.scale;
      const bin = offset => Math.max(0, Math.min(last, Math.round((x + step * offset) / spacing)));
      return {x, half, scale: house.scale, front: bin(-half), back: bin(half), bin};
    });
    // Work upwind so newly deposited snow stays in place for this frame.
    for (let n = 1; n <= last; n++) {
      const i = step > 0 ? last - n : n;
      const x = i * spacing;
      // Only the nearest wall shapes the local snowdrift.
      let wall;
      let gap = Infinity;
      for (const candidate of walls) {
        const distance = Math.abs(x - candidate.x) - candidate.half;
        if (distance < gap) { gap = distance; wall = candidate; }
      }
      const distance = wall ? (x - wall.x) * step : 0;
      const nearHouse = wall ? 1 - smoothStep(gap / (34 * wall.scale)) : 0;
      const wind = Math.max(gustAt(x, center, strength, gust), .38 * strength * nearHouse);
      if (wind < .01) continue;
      let shelter = 0;
      for (const tree of this.trees) {
        const lee = (x - treeX(tree, this.width)) * step / tree.height;
        if (lee > 0 && lee < 2.5) shelter = Math.max(shelter, Math.sin(Math.PI * lee / 2.5) ** 2);
      }
      const loose = Math.max(0, this.ground[i] - .45);
      const scour = wall ? Math.exp(-(((distance + wall.half + 7 * wall.scale) / (5 * wall.scale)) ** 2)) : 0;
      const inWake = wall && (i - wall.back) * step >= 0;
      const exposure = inWake ? .018 + .982 * smoothStep(((distance - wall.half) / wall.scale - 10) / 24) : 1;
      const pickup = (1 - .92 * shelter) * exposure + 1.5 * scour;
      const amount = dt * 5 / spacing * wind * pickup * Math.min(2, loose);
      if (wall && (i - wall.front) * step >= 0 && (wall.back - i) * step > 0) continue;
      if (i + step === wall?.front) {
        // Part of the scoured snow stops at the windward wall. The rest
        // travels over the roof and settles across the sheltered wake.
        this.transferGroundSnow(i, wall.front, amount * .54);
        for (const [offset, share] of [[3, .10], [9, .20], [16, .16]]) {
          const landing = wall.bin(wall.half + offset * wall.scale);
          this.transferGroundSnow(i, landing, amount * share);
        }
      } else {
        this.transferGroundSnow(i, i + step, amount);
      }
    }
    gust.lifted += dt * strength * (this.balcony ? 30 : 22) * (1 + 3.2 * this.blizzard);
    while (gust.lifted >= 1) {
      gust.lifted--;
      const x = Math.random() < .55 * this.blizzard ? between(0, this.width)
        : center + between(-gust.radius, gust.radius);
      if (x < 0 || x >= this.width) continue;
      if (this.ground[Math.round(x / this.width * last)] <= .46) continue;
      const flake = this.flake(x, this.surfaceAt(x) - between(.25, 1.45), between(.38, .75), between(.55, .95));
      flake.vx = gust.direction * between(50, this.balcony ? 92 : 77) * (1 + .4 * this.blizzard);
      flake.drift = {origin: x, distance: between(20, gust.radius * 1.7)};
      this.flakes.push(flake);
    }
  }

  drawGround() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < this.ground.length; i++) {
      const x = this.width * i / (this.ground.length - 1);
      if (i === 0) ctx.moveTo(x, this.groundTop(i));
      else ctx.lineTo(x, this.groundTop(i));
    }
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    const shade = ctx.createLinearGradient(0, this.height - 12 * snowHeightScale, 0, this.height);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(.48, '#ecf8ff');
    shade.addColorStop(1, '#beddeb');
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.restore();
  }

  paintFlake(flake) {
    const ctx = this.ctx;
    const flutter = Math.sin(this.elapsed * flake.flutter + flake.phase);
    ctx.globalAlpha = flake.opacity * (.6 + .4 * flake.depth);
    ctx.fillStyle = '#f7fcff';
    ctx.beginPath();
    if (flake.drift) {
      ctx.ellipse(flake.x, flake.y, flake.size * 3.3, flake.size * .42, 0, 0, Math.PI * 2);
    } else {
      const radius = flake.size * .90;
      ctx.ellipse(flake.x, flake.y, radius, radius * (.72 + .18 * flutter), flutter * .8, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  draw(now) {
    this.frame = requestAnimationFrame(this.draw);
    // Keep the 30 Hz schedule anchored across rounded display timestamps.
    // Skip missed slots in one step when the browser has been busy.
    const due = this.nextPaint ?? now;
    const ahead = now + 1 - due;
    if (ahead < 0) return;
    this.nextPaint = due + (1 + Math.floor(ahead / frameIntervalMs)) * frameIntervalMs;
    const dt = Math.min((now - this.last) / 1000, .08);
    this.last = now;
    this.elapsed += dt;
    const t = this.elapsed;
    const shower = this.snowfall(dt);
    // Hold the wind direction through the storm, including a scheduled lull.
    if ((!this.gust && (this.blizzard > 0 || this.alwaysWindy)) || (t >= this.nextGust && !this.blizzard)) this.startGust();
    const gust = this.gust;
    const progress = gust ? Math.min(1, (t - gust.start) / gust.duration) : 1;
    // Wind holds its direction through multiple surges before easing back to calm.
    const envelope = smoothStep(progress / .13) * smoothStep((1 - progress) / .18);
    const surge = Math.sin(t * .37 + this.phase);
    const windFloor = this.alwaysWindy ? .56 + .07 * surge : 0;
    const fairWind = windFloor + envelope * (.78 + .15 * surge + .07 * Math.sin(t * .83) - windFloor);
    const heading = windHeading(this.windMode, Date.now(), gust?.direction ?? 1);
    if (gust && heading) gust.direction = Math.sign(heading);
    const strength = (fairWind + this.blizzard * (.91 + .09 * surge - fairWind)) * Math.abs(heading);
    const center = strength ? gust.origin + heading * (progress - .5) * gust.reach : 0;
    const floor = this.height - 4 * snowHeightScale;

    const localBreeze = (this.balcony ? 7 : 3) * Math.sin(t / 7.3 + this.phase) + 3 * Math.sin(t / 3.7);
    const breeze = this.windMode === 'independent' ? localBreeze : Math.abs(localBreeze) * heading;
    this.moveClouds(dt, breeze, center, strength, gust);
    const density = .003 + .008 * this.daylight + shower * (this.balcony ? .20 : .17);
    const count = Math.min(265, Math.ceil(this.width * (density + .44 * this.blizzard)));
    const windSpeed = (this.balcony ? 70 : 50) * (1 - this.blizzard) + 158 * this.blizzard;
    // Airborne powder also settles between the individually drawn flakes.
    for (let i = 0; i < this.ground.length; i++) {
      const drift = .86 + .20 * Math.sin(i * .41 + this.phase);
      const settle = shower * .16 * drift * smoothStep((9 - this.ground[i]) / 3);
      const melt = (1 - shower) * .037;
      this.ground[i] = Math.max(.45, Math.min(maxDriftDepth, this.ground[i] + dt * (settle - melt)));
    }
    for (const tree of this.trees) {
      for (const branch of tree.branches) {
        branch.snow = Math.max(.035, Math.min(1, branch.snow + dt * (shower * .013 - (1 - shower) * .004)));
      }
    }
    const airborne = this.flakes.reduce((n, flake) => n + (flake.drift ? 0 : 1), 0);
    const seed = !airborne;
    for (let i = airborne; i < count; i++) {
      let x = between(0, this.width);
      let y = seed ? between(0, floor) : -2;
      if (Math.random() < .36 * this.blizzard) {
        // Snow also blows into view from the windward edge at every height.
        x = gust.direction > 0 ? 0 : this.width;
        y = between(0, this.surfaceAt(x));
      } else if (this.banks.length && shower > 0) {
        const bank = this.banks[Math.floor(Math.random() * this.banks.length)];
        const u = between(Math.max(-.85, -bank.x / bank.radius), Math.min(.85, (this.width - bank.x) / bank.radius));
        x = bank.x + bank.radius * u;
        y = this.cloudBase(bank, u) - between(0, 2);
      }
      const flake = this.flake(x, y, between(.5, 1 + shower * 1.5));
      flake.vx = (gust?.direction || 0) * airGustAt(x, center, strength, gust) * windSpeed * this.blizzard;
      this.flakes.push(flake);
    }
    if (strength) this.driftSnow(dt, gust, center, strength);
    this.moveTrees(dt, center, strength, gust);
    for (const house of this.houses) {
      const houseWind = (gust?.direction || 0) * airGustAt(house.position * this.width, center, strength, gust);
      this.moveSmoke(house, dt, (1 - strength) * breeze + houseWind * windSpeed);
      for (let side = 0; side < 2; side++) {
        const exposure = Math.max(0, side ? -houseWind : houseWind);
        const change = shower * .012 - (1 - shower) * .004 - exposure * .008;
        house.snow[side] = Math.max(0, Math.min(1, house.snow[side] + dt * change));
      }
    }
    this.ctx.clearRect(0, 0, this.width, this.height);
    const fadeStep = dt / 1.25;
    this.daylight += Math.max(-fadeStep, Math.min(fadeStep, this.sunTarget - this.daylight));
    this.drawSky();
    this.flakes = this.flakes.filter(flake => {
      if (flake.drift) {
        const drift = flake.drift;
        flake.x += flake.vx * dt;
        const progress = Math.abs(flake.x - drift.origin) / drift.distance;
        if (progress >= 1 || flake.x < 0 || flake.x > this.width) return false;
        const clearance = this.surfaceAt(flake.x) - flake.y;
        if (clearance < 0 || clearance > 2.4) return false;
        flake.opacity = .65 * Math.sin(Math.PI * progress) * smoothStep((2.4 - clearance) / .8);
        return true;
      }
      const flutter = Math.sin(t * flake.flutter + flake.phase);
      const air = airGustAt(flake.x, center, strength, gust);
      const wind = (1 - strength) * (breeze + flutter * 2)
        + (gust?.direction || 0) * air * windSpeed;
      flake.vx += (wind - flake.vx) * dt * 1.8;
      flake.vy += (4 + flake.size * (3 + shower * 2) + 11 * this.blizzard + flutter - flake.vy) * dt * .85;
      const oldY = flake.y;
      const oldX = flake.x;
      flake.x += flake.vx * dt;
      flake.y += flake.vy * dt;
      if (flake.x < -3 || flake.x > this.width + 3) return false;
      if (this.catchSnow(flake, oldY, oldX)) return false;
      const bin = Math.max(0, Math.min(this.ground.length - 1, Math.round(flake.x / this.width * (this.ground.length - 1))));
      if (flake.y >= this.groundTop(bin) + flake.depth * 2) {
        this.ground[bin] = Math.min(maxDriftDepth, this.ground[bin] + .006 * flake.size);
        return false;
      }
      return true;
    });
    this.flakes.sort((a, b) => a.depth - b.depth);
    this.drawLandscape(false);
  }

  drawLandscape(still) {
    const ctx = this.ctx;
    // A distant snowbank anchors the back row above the foreground drifts.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    for (let i = 0; i <= 32; i++) {
      const x = i / 32;
      ctx.lineTo(x * this.width, this.height - 7.4 - .6 * Math.sin(x * 11));
    }
    ctx.lineTo(this.width, this.height);
    ctx.fillStyle = '#a9c5d2';
    ctx.fill();
    if (this.houses.length > 1) {
      const main = this.houses[0];
      const x = main.position * this.width;
      const radius = Math.max(...this.houses.map(h => Math.abs(h.offset) * h.villageScale + h.eave * h.scale));
      const crest = this.height - 1 - 9 * main.villageScale;
      ctx.beginPath();
      ctx.moveTo(x - radius - 18, this.height);
      ctx.quadraticCurveTo(x - radius - 7, crest, x - radius, crest);
      ctx.quadraticCurveTo(x, crest - 2, x + radius, crest);
      ctx.quadraticCurveTo(x + radius + 7, crest, x + radius + 18, this.height);
      ctx.fill();
    }
    const flakes = still ? [] : this.flakes;
    let index = 0;
    for (const item of this.scenery) {
      while (index < flakes.length && flakes[index].depth < item.depth) this.paintFlake(flakes[index++]);
      if (item.kind === 'house') this.drawCottage(item);
      else this.drawTree(item, still);
    }
    this.drawGround();
    while (index < flakes.length) this.paintFlake(flakes[index++]);
  }
}

// The same module runs in a dedicated worker and in browsers using the local fallback.
if (typeof document === 'undefined') {
  let scene;
  self.onmessage = ({data}) => {
    if (data.canvas) scene = new SnowScene(data.canvas, data.balcony, data.defaultTreeSeed);
    scene.update(data);
  };
} else if (!customElements.get('dashboard-christmas-snow')) {
  // The editor may recreate a preview while browsing. Keep its original unseeded pines for this page visit.
  const defaultTreeSeeds = new Map();
  class DashboardChristmasSnow extends HTMLElement {
    static observedAttributes = ['data-light-level', 'data-trees', 'data-houses', 'data-seed', 'data-wind', 'data-house-position', 'data-house-size', 'data-house-clustering', 'data-always-night', 'data-always-snowing', 'data-always-windy'];

    constructor() {
      super();
      this.attachShadow({mode: 'open'});
      this.width = this.height = 0;
      this.motion = matchMedia('(prefers-reduced-motion: reduce)');
      this.sync = this.sync.bind(this);
      this.viewport = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.sync();
      });
      this.resize = new ResizeObserver(([entry]) => {
        this.width = entry.contentRect.width;
        this.height = entry.contentRect.height;
        this.sync();
      });
    }

    bindNightControls() {
      const box = this.parentElement;
      if (!box) return;
      const root = this.getRootNode();
      if (root instanceof ShadowRoot && !root.getElementById('christmas-night-style')) {
        const style = document.createElement('style');
        style.id = 'christmas-night-style';
        style.textContent = `
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-controls="tinted"]) {
            --christmas-control-alpha: .78;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow:is([data-controls="tinted"], [data-controls="solid"])) {
            --christmas-control-bg: rgb(from var(--christmas-control-surface, var(--card-background-color, #252b33)) r g b / var(--christmas-control-alpha, 1));
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow:is([data-controls="tinted"], [data-controls="solid"]))
            :is(.bubble-icon-container, .bubble-sub-button-1) {
            z-index: 3 !important;
            background: var(--christmas-control-bg) !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow:is([data-controls="tinted"], [data-controls="solid"])) .bubble-sub-button-1 {
            color: var(--christmas-badge-text, var(--primary-text-color)) !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]) {
            --christmas-control-surface: #263140;
            --christmas-badge-text: #f3f6fb;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]:not([data-adjusting])) {
            background: #202735 !important;
            color: #f3f6fb;
            --primary-text-color: #f3f6fb;
            --secondary-text-color: #ccd4de;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]:not([data-adjusting]))
            :is(.bubble-button-background, .bubble-range-fill, .bubble-range-value) { opacity: 0 !important; }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]:not([data-adjusting])) .bubble-sub-button-1 {
            background: var(--christmas-control-bg, #304056) !important; color: #f3f6fb !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]) .bubble-icon-container {
            background: var(--christmas-control-bg, #263140) !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]) .bubble-icon {
            color: #aab4c0 !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"][data-on]) .bubble-icon {
            color: #ffd480 !important;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]) .bubble-sub-button-1[data-drag-percent] .bubble-sub-button-name-container {
            display: none;
          }
          .bubble-button-card-container:has(> dashboard-christmas-snow[data-always-night="true"]) .bubble-sub-button-1[data-drag-percent]::after {
            content: attr(data-drag-percent) !important;
          }`;
        root.append(style);
      }
      if (this.dataset.place !== 'balcony') return;
      this.interactions = new AbortController();
      const options = {signal: this.interactions.signal, capture: true, passive: true};
      const hoverOptions = {signal: this.interactions.signal, passive: true};
      box.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' && !event.buttons) this.showAdjustment();
      }, hoverOptions);
      box.addEventListener('pointerleave', () => {
        if (this.dragPointer == null) this.endAdjustment();
      }, hoverOptions);
      box.addEventListener('pointerdown', event => {
        if (this.dataset.alwaysNight !== 'true' || !event.isPrimary || event.button !== 0
          || event.target.closest?.('.bubble-icon-container,.bubble-sub-button-container')) return;
        this.dragPointer = event.pointerId;
        this.showAdjustment();
        const fill = box.querySelector('.bubble-range-fill');
        const badge = box.querySelector('.bubble-sub-button-1');
        if (!fill || !badge) return;
        const readLevel = () => {
          const match = /^translateX\(([-.\d]+)%\)$/.exec(fill.style.transform);
          if (match) badge.dataset.dragPercent = Math.round(Math.max(0, Math.min(100, Number(match[1])))) + '%';
        };
        this.dragObserver?.disconnect();
        this.dragObserver = new MutationObserver(readLevel);
        this.dragObserver.observe(fill, {attributes: true, attributeFilter: ['style']});
        readLevel();
      }, options);
      const released = event => {
        if (event.pointerId === this.dragPointer) this.endAdjustment();
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, released, options);
      window.addEventListener('blur', () => this.endAdjustment(), options);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.endAdjustment();
      }, options);
    }

    showAdjustment() {
      if (this.dataset.alwaysNight !== 'true' || this.hasAttribute('data-adjusting')) return;
      this.setAttribute('data-adjusting', '');
      this.sync();
    }

    endAdjustment() {
      this.dragPointer = undefined;
      this.dragObserver?.disconnect();
      this.parentElement?.querySelector('.bubble-sub-button-1[data-drag-percent]')?.removeAttribute('data-drag-percent');
      if (this.hasAttribute('data-adjusting')) {
        this.removeAttribute('data-adjusting');
        if (this.isConnected) this.sync();
      }
    }

    createCanvas() {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:100%';
      this.shadowRoot.replaceChildren(canvas);
      return canvas;
    }

    connectedCallback() {
      this.bindNightControls();
      this.balcony = this.dataset.place === 'balcony';
      const cardKey = this.getRootNode().host?.config?.entity ?? this.dataset.place;
      if (!defaultTreeSeeds.has(cardKey)) defaultTreeSeeds.set(cardKey, Math.floor(Math.random() * 0x100000000));
      this.defaultTreeSeed = defaultTreeSeeds.get(cardKey);
      const canvas = this.createCanvas();
      if (typeof Worker !== 'undefined' && canvas.transferControlToOffscreen) {
        try {
          const worker = new Worker(import.meta.url, {type: 'module', name: 'christmas-snow'});
          this.worker = worker;
          worker.onerror = () => {
            if (this.worker === worker) this.useLocalCanvas();
          };
          const offscreen = canvas.transferControlToOffscreen();
          worker.postMessage({...this.state(), balcony: this.balcony, defaultTreeSeed: this.defaultTreeSeed, canvas: offscreen}, [offscreen]);
        } catch {
          this.useLocalCanvas();
        }
      } else {
        this.scene = new SnowScene(canvas, this.balcony, this.defaultTreeSeed);
      }
      this.viewport.observe(this);
      this.resize.observe(this);
      this.motion.addEventListener('change', this.sync);
      document.addEventListener('visibilitychange', this.sync);
      this.sync();
    }

    useLocalCanvas() {
      this.worker?.terminate();
      this.worker = undefined;
      this.scene = new SnowScene(this.createCanvas(), this.balcony, this.defaultTreeSeed);
      this.sync();
    }

    state() {
      const value = Number.parseFloat(this.dataset.lightLevel);
      return {width: this.width, height: this.height, scale: Math.min(devicePixelRatio || 1, 2),
        visible: Boolean(this.isConnected && this.visible && !document.hidden),
        treeCount: this.dataset.trees, houseCount: this.dataset.houses, seed: this.dataset.seed, wind: this.dataset.wind,
        housePosition: this.dataset.housePosition, houseSize: this.dataset.houseSize, houseClustering: this.dataset.houseClustering,
        alwaysSnowing: this.dataset.alwaysSnowing === 'true', alwaysWindy: this.dataset.alwaysWindy === 'true',
        alwaysNight: this.dataset.alwaysNight === 'true', adjusting: this.hasAttribute('data-adjusting'),
        reduced: this.motion.matches, level: Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null};
    }

    sync() {
      const state = this.state();
      if (this.worker) this.worker.postMessage(state);
      else this.scene?.update(state);
    }

    attributeChangedCallback(name) {
      if (name === 'data-always-night' && this.dataset.alwaysNight !== 'true') this.endAdjustment();
      if (this.isConnected) this.sync();
    }

    disconnectedCallback() {
      this.interactions?.abort();
      this.endAdjustment();
      this.viewport.disconnect();
      this.resize.disconnect();
      this.motion.removeEventListener('change', this.sync);
      document.removeEventListener('visibilitychange', this.sync);
      this.visible = false;
      this.worker?.terminate();
      this.worker = undefined;
      this.scene?.update(this.state());
      this.scene = undefined;
    }
  }
  customElements.define('dashboard-christmas-snow', DashboardChristmasSnow);
}

// Keep the native Bubble Card editor and its normal HA draft/save lifecycle.
if (typeof document !== 'undefined') {
  customElements.whenDefined('bubble-card').then(() => {
    const bubble = customElements.get('bubble-card');
    const nativeEditor = bubble.getConfigElement;
    if (!nativeEditor || nativeEditor.christmasScenery) return;
    function getConfigElement(...args) {
      const editor = nativeEditor.apply(this, args);
      const updated = editor.updated;
      editor.updated = function(changes) {
        updated?.call(this, changes);
        syncChristmasEditor(this);
      };
      return editor;
    }
    getConfigElement.christmasScenery = true;
    bubble.getConfigElement = getConfigElement;
  });
}

const windOptions = [
  {value: 'inherit', label: 'Use dashboard wind setting'},
  {value: 'shared', label: 'Shared direction'},
  {value: 'left', label: 'Blow left'},
  {value: 'right', label: 'Blow right'},
  {value: 'independent', label: 'Independent direction'},
];
const numberField = (name, label, min, max) => ({name, label, selector: {number: {min, max, step: 1, mode: 'box'}}});
const treeField = numberField('christmas_trees', 'Number of trees', 0, 36);
const houseField = numberField('christmas_houses', 'Number of chalets', 0, village.length);
const choices = (name, label, options) => ({name, label, selector: {select: {mode: 'dropdown',
  options: options.map(([value, label]) => ({value, label}))}}});
const positionField = choices('christmas_house_position', 'Chalet placement',
  [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['spread', 'Spread within the village']]);
const clusteringField = choices('christmas_house_clustering', 'Chalet clustering',
  [['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose']]);
const sizeField = choices('christmas_house_size', 'Chalet size',
  [['smaller', 'Smaller'], ['normal', 'Normal'], ['bigger', 'Bigger']]);
const controlsField = choices('christmas_controls', 'Icon and badge appearance',
  [['default', 'Default'], ['tinted', 'Tinted foreground'], ['solid', 'Solid foreground']]);
const toggle = (name, label) => ({name, label, selector: {boolean: {}}});
const nightField = toggle('christmas_always_night', 'Always night');
const snowField = toggle('christmas_always_snowing', 'Always snowing');
const windyField = toggle('christmas_always_windy', 'Always windy');
const windField = {name: 'christmas_wind', label: 'Wind direction', selector: {select: {options: windOptions, mode: 'dropdown'}}};
const twilightField = numberField('twilightWidth', 'Twilight edge width', 0, 10);
const helperField = {name: 'twilightHelper', label: 'Twilight number helper (optional)', selector: {entity: {domain: 'input_number'}}};
const seedField = numberField('christmas_seed', 'Layout seed (optional)', 1, 2147483647);

function updateChristmasDraft(editor, edits) {
  const config = {...editor._config};
  for (const [key, value] of Object.entries(edits)) {
    if (value == null || value === '' || value === 'inherit') delete config[key];
    else config[key] = value;
  }
  editor.setConfig(config);
  editor.dispatchEvent(new CustomEvent('config-changed', {detail: {config}, bubbles: true, composed: true}));
}

function christmasEditorData(config) {
  const slider = config.button_type === 'slider';
  const helper = typeof config.christmas_twilight === 'string' && config.christmas_twilight.startsWith('input_number.');
  const data = {christmas_trees: config.christmas_trees ?? (slider ? 4 : 7), christmas_houses: config.christmas_houses ?? 1,
    christmas_house_position: config.christmas_house_position || 'center', christmas_house_size: config.christmas_house_size || 'normal',
    christmas_controls: config.christmas_controls || 'default',
    christmas_house_clustering: config.christmas_house_clustering || 'normal',
    christmas_always_night: String(config.christmas_always_night) === 'true',
    christmas_always_snowing: String(config.christmas_always_snowing) === 'true',
    christmas_always_windy: String(config.christmas_always_windy) === 'true',
    christmas_wind: config.christmas_wind || 'inherit', christmas_seed: config.christmas_seed};
  if (slider) {
    if (!helper) data.twilightWidth = config.christmas_twilight ?? 6;
    data.twilightHelper = helper ? config.christmas_twilight : undefined;
  }
  return data;
}

const sceneryVersion = 'v1.0.2';

function layoutHistory(editor) {
  const seed = editor._config.christmas_seed;
  let history = editor.christmasLayoutHistory;
  // A seed entered manually starts a new browsing session at that layout.
  if (!history || history.seeds[history.index] !== seed) {
    history = editor.christmasLayoutHistory = {seeds: [seed], index: 0};
  }
  return history;
}

function createChristmasPanel(editor) {
  const panel = document.createElement('ha-expansion-panel');
  panel.id = 'christmas-scenery-settings';
  panel.setAttribute('outlined', '');
  panel.innerHTML = `
    <h4 slot="header"><ha-icon icon="mdi:pine-tree"></ha-icon> Christmas scenery</h4>
    <div class="content" style="display:grid;gap:12px">
      <ha-form></ha-form>
      <div style="display:grid;grid-template-columns:40px auto 40px;align-items:center;gap:4px;justify-self:start">
        <button type="button" data-previous aria-label="Previous layout" title="Previous layout" hidden
          style="grid-column:1;background:transparent;color:var(--primary-text-color);border:0;min-height:40px;cursor:pointer">
          <ha-icon icon="mdi:chevron-left" aria-hidden="true"></ha-icon>
        </button>
        <ha-button data-shuffle style="grid-column:2"><ha-icon slot="icon" icon="mdi:shuffle-variant"></ha-icon>Shuffle layout</ha-button>
        <button type="button" data-next aria-label="Next layout" title="Next layout" hidden
          style="grid-column:3;background:transparent;color:var(--primary-text-color);border:0;min-height:40px;cursor:pointer">
          <ha-icon icon="mdi:chevron-right" aria-hidden="true"></ha-icon>
        </button>
      </div>
      <small>Shuffle to try another layout. Use the arrows to revisit layouts from this editing session. Select Save to keep the one in the preview.</small>
      <details>
        <summary style="display:flex;align-items:center;gap:8px;min-height:36px;cursor:pointer">
          <ha-icon icon="mdi:help-circle-outline" aria-hidden="true"></ha-icon>
          About Christmas Bubble Cards
          <span style="margin-inline-start:auto;padding:2px 9px;border-radius:12px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:0.85em;white-space:nowrap">${sceneryVersion}</span>
        </summary>
        <ha-alert alert-type="info">
          Visit <a href="https://github.com/bassie661/christmas-bubble" target="_blank" rel="noopener noreferrer">Christmas Bubble Cards on GitHub</a> for setup instructions, examples and releases.
        </ha-alert>
      </details>
      <details><summary style="cursor:pointer">Scenery settings help</summary>
        <p>Choose 0–36 trees and 0–8 chalets. Zero hides that group. Pines form groves beside the village, with smaller trees in front of chalet corners. Foreground trees count toward your total. Left, Center and Right move the whole village. Left and Right keep every roof in the selected outer third. Smaller chalets sit uphill between the nearer roofs. Spread gives the chalets a little more space within the village. Chalet clustering controls the gap between neighbors. Tight overlaps the roofs more, Normal keeps the usual spacing and Loose leaves more room within the selected area. Smaller reduces chalet size by 22% and Bigger increases it by up to 10%, as space allows.</p>
        <p>Use the dashboard wind setting to follow the animation resource. Shared wind turns with the other cards. Left and right fix the direction. Independent wind follows this button’s own gusts.</p>
        <p>Icon and badge appearance affects the main icon and the percentage badge when present. Default uses the usual card styling. Tinted foreground shows some scenery through the backgrounds. Solid foreground hides the scenery behind them.</p>
        <p>Always night keeps the sky dark while the icon shows whether the device is on or off.</p>
        <p>Always snowing keeps flakes falling between snowstorms. Always windy keeps the trees, smoke and drifting snow moving in the selected wind direction between gusts. You can use either setting on its own or both together.</p>
        <p data-twilight-help>In Always night mode, hovering over the dimmer or dragging it reveals the slider and daylight. Releasing the slider restores the night sky. The percentage badge stays visible. The twilight edge blends the slider fill into the sky. Choose 0 for a sharp edge or 10 for the widest blend. A Number helper can control the width. Clear the helper to use a fixed width.</p>
        <p>Shuffle layout keeps your counts and picks new tree positions and chalet arrangements. The seed identifies the arrangement. Use the same seed, counts and button type to reproduce it.</p>
      </details>
    </div>`;
  const form = panel.querySelector('ha-form');
  form.computeLabel = field => field.label;
  form.addEventListener('value-changed', event => {
    event.stopPropagation();
    const next = event.detail.value;
    const previous = christmasEditorData(editor._config);
    const edits = {};
    for (const {name} of form.schema) {
      const value = next[name];
      if (value === previous[name]) continue;
      if (name === 'twilightHelper') edits.christmas_twilight = value || 6;
      else if (name === 'twilightWidth') edits.christmas_twilight = value;
      else edits[name] = value;
    }
    if (Object.keys(edits).length) updateChristmasDraft(editor, edits);
  });
  function selectLayout(history, index) {
    history.index = index;
    updateChristmasDraft(editor, {christmas_seed: history.seeds[index]});
  }
  panel.querySelector('[data-shuffle]').addEventListener('click', () => {
    const history = layoutHistory(editor);
    let seed = 1 + Math.floor(Math.random() * 2147483647);
    while (history.seeds.some(value => Number(value) === seed)) seed = seed % 2147483647 + 1;
    history.seeds.push(seed);
    selectLayout(history, history.seeds.length - 1);
  });
  for (const [selector, step] of [['[data-previous]', -1], ['[data-next]', 1]]) {
    panel.querySelector(selector).addEventListener('click', () => {
      const history = layoutHistory(editor);
      const index = history.index + step;
      if (index >= 0 && index < history.seeds.length) selectLayout(history, index);
    });
  }
  return panel;
}

function syncChristmasEditor(editor) {
  const root = editor.shadowRoot;
  const config = editor._config;
  if (!root) return;
  let panel = root.getElementById('christmas-scenery-settings');
  if (config?.card_type !== 'button' || !config.styles?.includes?.('dashboard-christmas-snow')) {
    panel?.remove();
    return;
  }
  const anchor = root.querySelector('ha-expansion-panel:not(#christmas-scenery-settings)');
  if (!anchor) return;
  if (!panel) {
    panel = createChristmasPanel(editor);
    anchor.after(panel);
  }
  const slider = config.button_type === 'slider';
  const history = layoutHistory(editor);
  panel.querySelector('[data-previous]').hidden = history.index === 0;
  panel.querySelector('[data-next]').hidden = history.index === history.seeds.length - 1;
  const data = christmasEditorData(config);
  const form = panel.querySelector('ha-form');
  const schema = [treeField, houseField, positionField, clusteringField, sizeField, windField, nightField, snowField, windyField, controlsField];
  if (slider) {
    if (!data.twilightHelper) schema.push(twilightField);
    schema.push(helperField);
  }
  schema.push(seedField);
  if (!form.schema || schema.length !== form.schema.length || schema.some((field, i) => field !== form.schema[i])) form.schema = schema;
  form.hass = editor.hass;
  if (!form.data || schema.some(({name}) => form.data[name] !== data[name])) form.data = data;
  panel.querySelector('[data-twilight-help]').hidden = !slider;
}
