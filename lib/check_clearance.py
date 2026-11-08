"""센서·팔이 기계 부품(축·몸체·베어링·받침)에 파묻히는지 프레임마다 검사. 장면이 window.CLEAR 를 적어야 한다
(기계 리그의 RIG.pose 가 자동으로 적음: min_mm = 가장 가까운 부품의 부호 있는 거리, tips = 로봇별 센서 끝 간극, holding = 붙잡는 중).

    uv run -q --no-project --with playwright --with pillow python lib/check_clearance.py <video.html> [--mutate gap] [--from A --to B]

FAIL: 어느 프레임이든 부품 간극 < 0 mm (파묻힘) · 센서 끝 < 4.9 mm · 붙잡는 중인데 5.00 ± 0.1 mm 밖.
--mutate gap: 목표 간극을 −5 mm 로 바꾼 사본(센서가 축 안으로) → FAIL 이어야 정상.
"""
import argparse, asyncio, json, math, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture import CHROME, CHROME_ARGS  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402
from human_detection import LEGACY_HUMAN, PERSON_NAME  # noqa: E402


# No BVH dependency: broad-phase boxes only reject pairs; the narrow phase uses
# world-space triangles, surface samples, and signed point-to-triangle distances.
# Vertices + edge midpoints + face centres catch small probes as well as large
# crossing plates. Interior overlap samples catch containment/crossing with no
# vertices inside. This is a sampled penetration estimate, not an AABB verdict.
MESH_CHECK = "() => {\n" + LEGACY_HUMAN + "\nconst PERSON_NAME=" + PERSON_NAME + ";\n" + r"""
  const scenes = new Set(), cameras = new Map(), cache = new WeakMap(), pairs = new WeakMap();
  const seenApart = new Set(), seenKey = new Set();   // 기계 짝이 떨어져 보인 것을 이 페이지에서 처음 한 번만 알림(처음 깊이는 machine_findings 가 프레임 순서로 정함)
  // 짝을 처음 본 때 장면 안 자리(자식 번호 길)와 이름을 함께 보냄: 페이지마다 같은 키가 같은 물체인지 keys_agree 가 확인
  const place = o => { const p = []; for (let x = o; x.parent; x = x.parent) p.push(x.parent.children.indexOf(x)); return p.reverse().join('.'); };
  const sigOf = (key, A, B, head) => { if (seenKey.has(key)) return undefined; seenKey.add(key); return place(A.top) + '|' + place(B.top) + '|' + head; };
  let frameHumans = null;
  const previous = THREE.Scene.prototype.onBeforeRender;
  THREE.Scene.prototype.onBeforeRender = function(...args) {
    scenes.add(this);
    if(!cameras.has(this))cameras.set(this,new Set());
    cameras.get(this).add(args[2]);
    if (previous) previous.apply(this, args);
  };
  const V = () => new THREE.Vector3();
  const visible = o => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    return !o.isMesh || ms.some(m => m && m.visible && (!m.transparent || m.opacity > 0));
  };
  const humanOf = o => { for (let p = o; p; p = p.parent) if (humans().includes(p)) return p; return null; };
  const meshes = root => { const out = []; if (root) root.traverse(o => {
    if (o.isMesh && o.geometry.attributes.position && visible(o)) out.push(o);
  }); return out; };
  function shape(o, instance = -1) {
    o.updateWorldMatrix(true, false);
    const matrix = o.matrixWorld.clone();
    if (instance >= 0) { const m = new THREE.Matrix4(); o.getMatrixAt(instance, m); matrix.multiply(m); }
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const key = o.geometry.id + ':' + matrix.elements.join(',') + ':' + pos.version + ':' + (idx ? idx.version : 0) + ':' + instance;
    let records = cache.get(o); if (!records) { records = new Map(); cache.set(o, records); }
    const old = records.get(instance); if (old && old.key === key) return old;
    const vertices = Array.from({length: pos.count}, (_, i) => V().fromBufferAttribute(pos, i).applyMatrix4(matrix));
    const triangles = [], samples = new Map();
    const sample = p => samples.set(p.toArray().map(x => x.toFixed(8)).join(','), p);
    vertices.forEach(sample);
    for (let i = 0; i < (idx ? idx.count : pos.count); i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => vertices[idx ? idx.getX(i + j) : i + j]);
      const tri = new THREE.Triangle(a, b, c);
      if (tri.getArea() < 1e-14) continue;
      tri.box = new THREE.Box3().setFromPoints([a,b,c]);
      triangles.push(tri); sample(tri.getMidpoint(V()));
      for (const [p, q] of [[a,b], [b,c], [c,a]]) sample(p.clone().add(q).multiplyScalar(.5));
    }
    const result = {key, triangles, samples: [...samples.values()], box: new THREE.Box3().setFromPoints(vertices)};
    records.set(instance, result); return result;
  }
  function shapes(root) {
    return meshes(root).flatMap(o => o.isInstancedMesh ?
      Array.from({length: o.count}, (_, i) => shape(o, i)) : [shape(o)])
      .filter(s=>s.triangles.length);
  }
  const direction = new THREE.Vector3(1, .371390676, .694746591).normalize();
  // Open meshes: a point counts as inside only when rays along all six axis directions agree (an opening on any side lets one out).
  const DIRECTIONS = [direction, ...[[1, .13, .07], [-1, -.11, .09], [.08, 1, -.12], [-.1, -1, .06], [.09, -.07, 1], [-.12, .1, -1]].map(v => new THREE.Vector3(...v).normalize())];
  // Uniform grid over a shape's triangles: the same triangles, distances and ray hits as the full loop, found without
  // visiting every triangle (a scene with 38 machine pairs took 57 s per frame). window.__rvClearanceNoGrid = full loop.
  function grid(s) {
    if (s.grid !== undefined) return s.grid;
    const T = s.triangles; if (T.length < 64 || window.__rvClearanceNoGrid) return s.grid = null;
    const n = Math.max(2, Math.min(64, Math.round(Math.cbrt(T.length / 4)))), lo = s.box.min, size = s.box.getSize(V());
    const cs = [size.x / n || 1, size.y / n || 1, size.z / n || 1], cells = new Map();
    const idx = (v, k) => Math.min(n - 1, Math.max(0, Math.floor((v - lo.getComponent(k)) / cs[k])));
    for (const tri of T) {
      const a = [0, 1, 2].map(k => idx(tri.box.min.getComponent(k), k)), b = [0, 1, 2].map(k => idx(tri.box.max.getComponent(k), k));
      for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) {
        const key = (x * n + y) * n + z; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(tri);
      }
    }
    return s.grid = {n, lo, cs, cells, idx};
  }
  function nearest(p, s) {
    const g = grid(s), q = V(); let dist = Infinity;
    if (!g) { for (const tri of s.triangles) if (tri.box.distanceToPoint(p) < dist) { tri.closestPointToPoint(p, q); dist = Math.min(dist, p.distanceTo(q)); } return dist; }
    const {n, lo, cs, cells, idx} = g, c = [0, 1, 2].map(k => idx(p.getComponent(k), k)), seen = new Set();
    for (let r = 0; r <= n; r++) {
      const inner = new THREE.Box3(new THREE.Vector3(...[0, 1, 2].map(k => lo.getComponent(k) + (c[k] - r + 1) * cs[k])),
        new THREE.Vector3(...[0, 1, 2].map(k => lo.getComponent(k) + (c[k] + r) * cs[k])));
      if (r > 0 && inner.containsPoint(p) && dist <= Math.min(p.x - inner.min.x, inner.max.x - p.x, p.y - inner.min.y,
        inner.max.y - p.y, p.z - inner.min.z, inner.max.z - p.z)) break;
      for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++) {
        if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r || x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) continue;
        for (const tri of cells.get((x * n + y) * n + z) || []) {
          if (seen.has(tri)) continue; seen.add(tri);
          if (tri.box.distanceToPoint(p) < dist) { tri.closestPointToPoint(p, q); dist = Math.min(dist, p.distanceTo(q)); }
        }
      }
    }
    return dist;
  }
  function odd(p, s, direction = DIRECTIONS[0]) {
    const g = grid(s), ray = new THREE.Ray(p, direction), q = V(), hits = [];
    const test = tri => { if (ray.intersectsBox(tri.box) && ray.intersectTriangle(tri.a, tri.b, tri.c, false, q)) { const t = q.clone().sub(p).dot(direction); if (t > 1e-8) hits.push(t); } };
    if (!g) s.triangles.forEach(test);
    else {
      // 3D DDA: every cell the ray passes through, boundary cells included by inclusive insertion.
      const {n, lo, cs, cells, idx} = g, c = [0, 1, 2].map(k => idx(p.getComponent(k), k)), seen = new Set();
      const d = [direction.x, direction.y, direction.z], step = d.map(v => v < 0 ? -1 : 1);
      const tMax = [0, 1, 2].map(k => d[k] === 0 ? Infinity : (lo.getComponent(k) + (c[k] + (d[k] > 0 ? 1 : 0)) * cs[k] - p.getComponent(k)) / d[k]);
      const tDelta = [0, 1, 2].map(k => d[k] === 0 ? Infinity : cs[k] / Math.abs(d[k])), inside = e => e.every(v => v >= 0 && v < n);
      while (inside(c)) {
        for (const tri of cells.get((c[0] * n + c[1]) * n + c[2]) || []) if (!seen.has(tri)) { seen.add(tri); test(tri); }
        const k = tMax[0] <= tMax[1] ? (tMax[0] <= tMax[2] ? 0 : 2) : (tMax[1] <= tMax[2] ? 1 : 2);
        for (const j of [0, 1, 2]) if (j !== k && Math.abs(tMax[j] - tMax[k]) < 1e-12) {
          const e = c.slice(); e[j] += step[j]; if (inside(e)) for (const tri of cells.get((e[0] * n + e[1]) * n + e[2]) || []) if (!seen.has(tri)) { seen.add(tri); test(tri); }
        }
        c[k] += step[k]; tMax[k] += tDelta[k];
      }
    }
    hits.sort((a, b) => a - b);
    return hits.filter((t, i) => !i || t - hits[i - 1] > 1e-7).length % 2 === 1;
  }
  const insideDepth = (p, s) => { if (!s.box.containsPoint(p) || !odd(p, s)) return 0; const d = nearest(p, s); return d < 1e-8 ? 0 : d; };
  function signed(p, s) {
    if (grid(s)) { const d = nearest(p, s); return d < 1e-8 || !s.box.containsPoint(p) ? d : odd(p, s) ? -d : d; }
    let dist = Infinity; const q = V(), ray = new THREE.Ray(p, direction), hits = [];
    for (const tri of s.triangles) {
      if (tri.box.distanceToPoint(p) < dist) {
        tri.closestPointToPoint(p, q); dist = Math.min(dist, p.distanceTo(q));
      }
      if (ray.intersectsBox(tri.box) && ray.intersectTriangle(tri.a, tri.b, tri.c, false, q)) {
        const t = q.clone().sub(p).dot(direction); if (t > 1e-8) hits.push(t);
      }
    }
    if (dist < 1e-8 || !s.box.containsPoint(p)) return dist;
    hits.sort((a,b) => a-b);
    const unique = hits.filter((t,i) => !i || t - hits[i-1] > 1e-7);
    return unique.length % 2 ? -dist : dist;
  }
  const boxGap = (a,b) => Math.hypot(
    Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),
    Math.max(0,a.min.y-b.max.y,b.min.y-a.max.y),
    Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z));
  function segmentGap(p,q,r,s) {
    const u=q.clone().sub(p),v=s.clone().sub(r),w=p.clone().sub(r);
    const a=u.dot(u),b=u.dot(v),c=v.dot(v),d=u.dot(w),e=v.dot(w),den=a*c-b*b;
    let x=den>1e-20?THREE.MathUtils.clamp((b*e-c*d)/den,0,1):0;
    let y=c>1e-20?(b*x+e)/c:0;
    if(y<0){y=0;x=a>1e-20?THREE.MathUtils.clamp(-d/a,0,1):0;}
    else if(y>1){y=1;x=a>1e-20?THREE.MathUtils.clamp((b-d)/a,0,1):0;}
    return w.addScaledVector(u,x).addScaledVector(v,-y).length();
  }
  function surfaceGap(a,b) {
    let gap=Infinity; const closest=V();
    for(const x of a.triangles) for(const y of b.triangles) {
      if(boxGap(x.box,y.box)>gap) continue;
      const xv=[x.a,x.b,x.c],yv=[y.a,y.b,y.c];
      for(const [vertices,tri] of [[xv,y],[yv,x]]) for(const p of vertices) {
        tri.closestPointToPoint(p,closest);gap=Math.min(gap,p.distanceTo(closest));
        if(gap<=.005+1e-8)return gap;
      }
      for(const [vertices,tri] of [[xv,y],[yv,x]]) for(let i=0;i<3;i++) {
        const p=vertices[i],q=vertices[(i+1)%3],direction=q.clone().sub(p),length=direction.length();
        const ray=new THREE.Ray(p,direction.divideScalar(length));
        if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,closest) && p.distanceTo(closest)<=length+1e-8)return 0;
      }
      for(let i=0;i<3;i++)for(let j=0;j<3;j++){
        gap=Math.min(gap,segmentGap(xv[i],xv[(i+1)%3],yv[j],yv[(j+1)%3]));
        if(gap<=.005+1e-8)return gap;
      }
    }
    return gap;
  }
  function distance(a, b, penetrationOnly, contactOnly = false) {
    // Floating means no surface contact: being inside a hollow chamber is not
    // contact. Use triangle intersections/edge distances, never ray-parity volume.
    if(contactOnly)return surfaceGap(a,b);
    let gap = Infinity, depth = 0;
    if (penetrationOnly) {
      for (const [s,t] of [[a,b], [b,a]]) for (const p of s.samples) depth = Math.max(depth, insideDepth(p, t));
      const overlap = a.box.clone().intersect(b.box);
      if (!overlap.isEmpty()) {
        const size = overlap.getSize(V());
        for (const x of [.25,.5,.75]) for (const y of [.25,.5,.75]) for (const z of [.25,.5,.75]) {
          const p = overlap.min.clone().add(new THREE.Vector3(size.x*x,size.y*y,size.z*z)), da = insideDepth(p, a);
          if (da) depth = Math.max(depth, 2 * Math.min(da, insideDepth(p, b)));
        }
      }
      return depth > 1e-7 ? -depth : 0;
    }
    for (const [s,t] of [[a,b], [b,a]]) for (const p of s.samples) {
      const d = signed(p,t); gap = Math.min(gap, Math.abs(d)); depth = Math.max(depth, -d);
    }
    // A thin plate may cross another mesh without containing any surface vertex.
    const overlap = a.box.clone().intersect(b.box);
    if (!overlap.isEmpty()) {
      const size = overlap.getSize(V());
      for (const x of [.25,.5,.75]) for (const y of [.25,.5,.75]) for (const z of [.25,.5,.75]) {
        const p = overlap.min.clone().add(new THREE.Vector3(size.x*x,size.y*y,size.z*z));
        depth = Math.max(depth, 2 * Math.min(-signed(p,a), -signed(p,b)));
      }
    }
    return depth > 1e-7 ? -depth : penetrationOnly ? 0 : gap;
  }
  const closedByGeometry = new Map();
  function closed(s) {
    if (s.closed !== undefined) return s.closed;
    const gid = s.key.split(':')[0];
    if (closedByGeometry.has(gid)) return s.closed = closedByGeometry.get(gid);
    return s.closed = closedByGeometry.set(gid, closedOnce(s)).get(gid);
  }
  function closedOnce(s) {
    const k = p => p.x.toFixed(5) + ',' + p.y.toFixed(5) + ',' + p.z.toFixed(5), edges = new Map();
    for (const t of s.triangles) {
      const v = [k(t.a), k(t.b), k(t.c)];
      for (let i = 0; i < 3; i++) { const p = v[i], q = v[(i + 1) % 3]; if (p === q) continue; const e = p < q ? p + '|' + q : q + '|' + p; edges.set(e, (edges.get(e) || 0) + 1); }
    }
    for (const n of edges.values()) if (n % 2) return false;
    return true;
  }
  function crosses(a, b, eps) {
    const plane = new THREE.Plane(), r = V();
    const xs = a.triangles.filter(t => t.box.intersectsBox(b.box)), ys = b.triangles.filter(t => t.box.intersectsBox(a.box));
    for (const x of xs) for (const y of ys) {
      if (!x.box.intersectsBox(y.box)) continue;
      for (const [s, t] of [[x, y], [y, x]]) {
        t.getPlane(plane);
        for (const [p, q] of [[s.a, s.b], [s.b, s.c], [s.c, s.a]]) {
          const dp = plane.distanceToPoint(p), dq = plane.distanceToPoint(q);
          if (dp * dq >= 0 || Math.abs(dp) <= eps || Math.abs(dq) <= eps) continue;
          r.copy(p).lerp(q, dp / (dp - dq));
          if (t.containsPoint(r)) return true;
        }
      }
    }
    return false;
  }
  function machineDepth(a, b) {
    let byA = pairs.get(a); if (!byA) { byA = new WeakMap(); pairs.set(a, byA); }
    if (!byA.has(b)) byA.set(b, {});
    const record = byA.get(b);
    if (!('machine' in record)) record.machine = machineDepthOnce(a, b);
    return record.machine;
  }
  function machineDepthOnce(a, b) {
    if (closed(a) && closed(b)) return {depth: -pair(a, b, true), cross: false};
    let depth = 0;
    for (const [s, t] of [[a, b], [b, a]]) for (const p of s.samples) {
      const d = insideDepth(p, t);
      if (d > depth && (closed(t) || DIRECTIONS.slice(1).every(r => odd(p, t, r)))) depth = d;
    }
    return {depth, cross: crosses(a, b, .02)};
  }
  function pair(a,b,penetrationOnly = false,contactOnly = false) {
    // Shape identity matters: different geometries can have equal matrices/counts.
    let byA = pairs.get(a); if (!byA) { byA = new WeakMap(); pairs.set(a, byA); }
    if (!byA.has(b)) byA.set(b, {});
    const record = byA.get(b), key = penetrationOnly ? 'depth' : contactOnly ? 'contact' : 'gap';
    if (!(key in record)) record[key] = distance(a,b,penetrationOnly,contactOnly);
    return record[key];
  }
  const point = o => o.getWorldPosition(V());
  const label = o => o.name || o.userData.rvPart || o.type;
  const owner = o => { for (let p = o; p && !p.isScene; p = p.parent) { const n = p.name || p.userData.rvPart; if (n) return n; } return o.type; };
  function pointGap(p, root) { return Math.min(...shapes(root).map(s => Math.abs(signed(p,s)))); }
  function topAt(p, root, up) {
    let top = -Infinity;
    for (const s of shapes(root)) {
      const origin = p.clone().addScaledVector(up, s.box.getSize(V()).length() + p.distanceTo(s.box.getCenter(V())) + 1);
      const ray = new THREE.Ray(origin, up.clone().negate()), q = V();
      for (const t of s.triangles) if (ray.intersectTriangle(t.a,t.b,t.c,false,q)) top = Math.max(top, q.dot(up));
    }
    return top;
  }
  function humans() {
    if(frameHumans)return frameHumans;
    const out = new Set();
    const named=PERSON_NAME;
    for (const scene of scenes) scene.traverse(o => {
      if(visible(o) && (o.userData.rvHuman || named.test(o.name) || isLegacyHuman(o)))out.add(o);
    });
    frameHumans=[...out].filter(o=>{
      for(let p=o.parent;p;p=p.parent)if(out.has(p))return false;
      return true;
    });
    return frameHumans;
  }
  const solid = o => visible(o) && (Array.isArray(o.material) ? o.material : [o.material])
    .some(m => m && m.visible && !m.wireframe && !m.isShadowMaterial &&
      // Existing project convention: unlit, non-depth-writing transparent rings
      // are explanatory graphics, not physical supports or floating parts.
      !(m.isMeshBasicMaterial && m.transparent && !m.depthWrite) &&
      (!m.transparent || m.opacity > 0));
  const belongs = (o, root) => { for (let p=o; p; p=p.parent) if (p===root) return true; return false; };
  let frameTargets = null;
  const boundCache = new WeakMap();
  const bounds = o => {
    if(!o.isMesh) {
      const box=new THREE.Box3();o.traverse(p=>{if(p.isMesh&&solid(p))box.union(bounds(p));});return box;
    }
    o.updateWorldMatrix(true,false);
    const pos=o.geometry.attributes.position, key=o.geometry.id+':'+pos.version+':'+
      o.matrixWorld.elements.join(',')+':'+(o.isInstancedMesh?o.instanceMatrix.version:0);
    const old=boundCache.get(o);if(old&&old.key===key)return old.box;
    // Transforming a local cylinder AABB inflates its radial bounds while it
    // spins and changes which mesh a legacy label resolves to. Bound vertices.
    const box=new THREE.Box3(), matrix=o.matrixWorld.clone(), p=V(), instance=new THREE.Matrix4();
    for(let i=0;i<(o.isInstancedMesh?o.count:1);i++){
      if(o.isInstancedMesh){o.getMatrixAt(i,instance);matrix.copy(o.matrixWorld).multiply(instance);}
      // Zero-scale instances are not drawn. Their dormant positions must not
      // expand a label target's bounds or become empty "floating" targets.
      if([0,1,2,4,5,6,8,9,10].every(k=>Math.abs(matrix.elements[k])<1e-12))continue;
      for(let j=0;j<pos.count;j++)box.expandByPoint(p.fromBufferAttribute(pos,j).applyMatrix4(matrix));
    }
    boundCache.set(o,{key,box});
    return box;
  };
  function autoTargets() {
    if (frameTargets) return frameTargets;
    const out = new Map();
    let candidates;
    for (const entry of window.__KIT_LABELS || []) {
      if (!entry.camera) continue;
      let shown = true, opacity = 1;
      for (let e=entry.box; e; e=e.parentElement) {
        const s = getComputedStyle(e); opacity *= +s.opacity;
        if (s.display==='none' || s.visibility!=='visible') shown=false;
      }
      if (!shown || opacity<=.05 || entry.box.getBoundingClientRect().width<=0) continue;
      if (!candidates) {
        candidates=[];
        for (const scene of scenes) {
          scene.updateMatrixWorld(true);
          for (const o of meshes(scene)) if (solid(o) && !bounds(o).isEmpty()) candidates.push(o);
        }
      }
      let target=entry.target;
      if (!target) {
        // Same legacy world-point resolution as check_layout.OCCLUSION.
        const near=candidates.map(o=>({o,b:bounds(o)}))
          .filter(({b})=>b.clone().expandByScalar(.025).containsPoint(entry.world));
        near.sort((a,b)=>a.b.getSize(V()).lengthSq()-b.b.getSize(V()).lengthSq());
        target=near[0]?.o;
      }
      if (!target || !visible(target) || !candidates.some(o=>belongs(o,target))) continue;
      if (!out.has(target)) out.set(target,{target,text:entry.box.textContent,candidates});
    }
    frameTargets=[...out.values()]; return frameTargets;
  }
  function autoGap({target,candidates}) {
    const parts=meshes(target).filter(solid), boxes=parts.map(bounds);
    const others=candidates.filter(o=>!belongs(o,target) && !belongs(target,o));
    const nearby=others.map(o=>({o,box:bounds(o)})).map(d=>({...d,lower:Math.min(...boxes.map(b=>boxGap(b,d.box)))}))
      .sort((a,b)=>a.lower-b.lower || a.box.getSize(V()).lengthSq()-b.box.getSize(V()).lengthSq());
    let gap=Infinity;
    for (const {o,lower} of nearby) {
      if (lower>gap) break;
      for (const p of parts) for (const a of shapes(p)) for (const b of shapes(o)) {
        if (boxGap(a.box,b.box)>gap || !b.triangles.some(t=>boxGap(a.box,t.box)<=gap)) continue;
        gap=Math.min(gap,Math.max(0,pair(a,b,false,true)));
        if (gap<=.005+1e-8) return gap;
      }
    }
    return gap;
  }
  const declarations = () => (window.KIT && KIT.fx && KIT.fx.clearance) || {attachments:[],seats:[]};
  function penetrationSolid(o, thinOk = false) {
    if(!solid(o))return false;
    const materials=Array.isArray(o.material)?o.material:[o.material], p=o.geometry.parameters||{};
    const sphere=o.geometry.type.startsWith('Sphere');
    if(materials.some(m=>m.visible&&m.side!==THREE.FrontSide) || p.openEnded ||
      (p.thetaLength!==undefined&&p.thetaLength<(sphere?Math.PI:Math.PI*2)-1e-8) ||
      (sphere&&p.thetaStart>1e-8) ||
      (p.phiLength!==undefined&&p.phiLength<Math.PI*2-1e-8) ||
      (p.arc!==undefined&&p.arc<Math.PI*2-1e-8))return false;
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
    const size=o.geometry.boundingBox.getSize(V()).multiply(o.getWorldScale(V()));
    const dimensions=[Math.abs(size.x),Math.abs(size.y),Math.abs(size.z)];
    return Math.min(...dimensions)>=(thinOk ? .005 : .02*Math.max(...dimensions));
  }
  function enclosesEnvironment(s,humanBounds,viewpoints) {
    // A camera inside a volume, or a volume surrounding the whole person, is
    // an environment shell, not a penetrated machine component. AABB overlap
    // alone is insufficient: cabin walls and booms must remain colliders.
    if(viewpoints.some(p=>s.box.containsPoint(p)&&signed(p,s)<-1e-7))return true;
    if(!s.box.containsBox(humanBounds))return false;
    for(const x of [humanBounds.min.x,humanBounds.max.x])
      for(const y of [humanBounds.min.y,humanBounds.max.y])
        for(const z of [humanBounds.min.z,humanBounds.max.z])
          if(signed(new THREE.Vector3(x,y,z),s)>=-1e-7)return false;
    return true;
  }
  function move(o, up, amount) {
    o.updateWorldMatrix(true,false);
    const p = point(o).addScaledVector(up,amount);
    o.position.copy(o.parent ? o.parent.worldToLocal(p) : p); o.updateWorldMatrix(false,true);
  }
  window.__rvClearance = {
    begin() { scenes.clear(); cameras.clear(); frameTargets=null; frameHumans=null; },
    drawn() { return scenes.size; },
    mutate(kind) {
      if (kind === 'detach') {
        const d = declarations().attachments.find(d => visible(d.part) && visible(d.support));
        if (d) { move(d.part,new THREE.Vector3(0,1,0),.02); return d.part; }
        const targets=autoTargets().sort((a,b)=>bounds(a.target).getSize(V()).lengthSq()-bounds(b.target).getSize(V()).lengthSq());
        for(const entry of targets) {
          move(entry.target,new THREE.Vector3(0,1,0),.02);
          if(autoGap(entry)>.005+1e-8)return entry.target;
          move(entry.target,new THREE.Vector3(0,1,0),-.02);
        }
      }
      if (kind === 'sink') {
        const d = declarations().seats.find(d => visible(d.human));
        if (d) { move(d.human,new THREE.Vector3(...d.up).normalize(),-.1); return d.human; }
      }
      return null;
    },
    check() {
      const findings = [], measurements = [], machines = [], targets = {attach:0,human:0,seat:0,auto:0,machine:0}; let count = 0;
      const add = (rule, name, mm, tolerance, target_id = null) => {
        const row={rule,name,mm,target_id}; measurements.push(row);
        if (!Number.isFinite(mm) || mm > tolerance + 1e-5) findings.push(row);
      };
      for (const entry of autoTargets()) {
        count++; targets.auto++;
        add('auto floating',entry.text+' ['+label(entry.target)+']',autoGap(entry)*1000,5,entry.target.uuid);
      }
      for (const d of declarations().attachments) {
        if (!visible(d.part) || !visible(d.support)) continue;
        count++; targets.attach++;
        let gap = Infinity, depth = 0;
        for (const a of shapes(d.part)) for (const b of shapes(d.support)) {
          const v = pair(a,b); gap = Math.min(gap,Math.max(0,v)); depth = Math.max(depth,-v);
        }
        add(depth > d.tol_mm/1000 ? 'attach penetration' : 'attach gap',
          label(d.part)+' / '+label(d.support), (depth > d.tol_mm/1000 ? depth : gap)*1000,d.tol_mm,d.part.uuid);
      }
      for (const h of humans()) {
        count++; targets.human++;
        const body = meshes(h).filter(o => h.userData.rvHuman ? o.userData.rvPart : solid(o));
        let scene = h; while (scene.parent) scene = scene.parent;
        const humanBounds=bounds(h), viewpoints=[...(cameras.get(scene)||[])].map(point);
        const machine = meshes(scene).filter(o => !humanOf(o)&&penetrationSolid(o)&&bounds(o).intersectsBox(humanBounds))
          .map(o=>({o,shapes:shapes(o).filter(s=>!enclosesEnvironment(s,humanBounds,viewpoints))}))
          .filter(d=>d.shapes.length);
        for (const part of body) for (const {o:other,shapes:otherShapes} of machine) {
          // Reject distant terrain/high-detail assemblies before expanding triangles.
          if (!other.isInstancedMesh &&
              !new THREE.Box3().setFromObject(part).intersectsBox(new THREE.Box3().setFromObject(other))) continue;
          let depth = 0;
          for (const a of shapes(part)) for (const b of otherShapes) {
            if (!a.box.intersectsBox(b.box)) continue;
            depth = Math.max(depth,-pair(a,b,true));
          }
          if (depth > .01 + 1e-8) add('human penetration',
            (h.userData.rvHuman?'':(h.name||'legacy human')+' / ')+label(part)+' / '+label(other),depth*1000,10,h.uuid);
        }
      }
      for (const d of declarations().seats) {
        if (!visible(d.human) || d.human.userData.pose !== 'sit') continue;
        count++; targets.seat++; const c = d.human.userData.contacts || {}, up = new THREE.Vector3(...d.up).normalize();
        if (!c.seat || !d.seat || !d.floor || !c.feet || !c.hands) {
          add('seat declaration','missing contacts/seat/floor',Infinity,20); continue;
        }
        const pelvis = point(c.seat), top = topAt(pelvis,d.seat,up);
        add('seat contact',label(d.human),Math.abs(pelvis.dot(up)-top)*1000,20,d.human.uuid);
        for (const foot of c.feet) {
          const p = point(foot), floor = topAt(p,d.floor,up);
          add('foot below floor',label(d.human), Number.isFinite(floor) ? (floor-p.dot(up))*1000 : Infinity,0);
        }
        for (const hand of c.hands) if (d.levers.length) {
          add('hand lever',label(d.human),Math.min(...d.levers.map(l => pointGap(point(hand),l)))*1000,d.hand_mm);
        }
      }
      // 기계↔기계: 위 규칙들은 사람·부착·좌석만 봐서
      // 기계 팔이 다른 기계의 적재함을 뚫어도 아무 규칙에 안 걸렸음. 장면 바로 아래 몸체(보이는 단단한 메시 3개 이상, 15 m 이하 = 땅·챔버 껍데기 아님,
      // 사람 아님)끼리 20 mm 넘게 파고들면 FAIL. 흙·짐 알갱이(이름 soil·load·grain·dirt·흙)는 몸체 부품에서 뺌(적재함에 쏟는 흙은 닿는 게 정상).
      const LOOSE = /soil|load|grain|dirt|흙|모래/i;
      const shapeCache = new Map(), shapeOf = o => { if (!shapeCache.has(o)) shapeCache.set(o, shapes(o)); return shapeCache.get(o); };
      for (const scene of window.__rvClearanceNoMachine ? [] : scenes) {
        const bodies = [];
        for (const top of scene.children) {
          if (!visible(top) || humanOf(top)) continue;
          const parts = meshes(top).filter(o => penetrationSolid(o, true) && !humanOf(o) && ![o, o.parent].some(x => x && LOOSE.test(x.name || '')));
          if (parts.length < 3) continue;
          const b = bounds(top), size = b.getSize(new THREE.Vector3());
          // 기계 = 가장 긴 변 0.8 m 이상(운반 장비·로봇 몸체). 센서 헤드·공구처럼 작은 것은 붙잡혀 들려 다니며 집게와 겹치는 게 정상 — 부착·떠 있음 규칙이 봄
          if (b.isEmpty() || size.length() > 15 || Math.max(size.x, size.y, size.z) < 0.8) continue;
          bodies.push({top, parts, b});
        }
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const A = bodies[i], B = bodies[j], key = A.top.id + '|' + B.top.id;   // Object3D.id counts creation order, the same in every page (uuid is random per page)
          if (!A.b.intersectsBox(B.b)) { if (!seenApart.has(key)) { seenApart.add(key);
            machines.push({key, apart: true, sig: sigOf(key, A, B, (A.top.name || label(A.top)) + ' <-> ' + (B.top.name || label(B.top)))}); } continue; }   // 떨어져서 처음 보인 짝은 처음 깊이 0
          count++; targets.machine++; let depth = 0, worst = '', cross = '';
          const overlap = A.b.clone().intersect(B.b), near = list => list.filter(o => bounds(o).intersectsBox(overlap));
          const nearB = near(B.parts);
          for (const pa of near(A.parts)) for (const pb of nearB) {
            if (!bounds(pa).intersectsBox(bounds(pb))) continue;
            for (const a of shapeOf(pa)) for (const c of shapeOf(pb)) {
              if (!a.box.intersectsBox(c.box)) continue;
              const m = machineDepth(a, c), at = label(pa) + ' / ' + label(pb) + ' [' + owner(pa) + ' / ' + owner(pb) + ']';
              if (m.depth > depth) { depth = m.depth; worst = at; }
              if (m.cross && !cross) cross = at;
            }
          }
          // 새로 파고든 깊이만 셈: 처음부터 겹친 것(기계 받침에 꽂힌 헤드 30 mm)은 의도, 움직여 들어간 것(팔이 적재함 벽을 뚫음)은 FAIL
          // (처음 깊이 빼기·면 교차 판정은 machine_findings 가 프레임 순서로 함 — 페이지 여럿이 프레임을 나눠 재도 같은 줄)
          const head = (A.top.name || label(A.top)) + ' <-> ' + (B.top.name || label(B.top));
          machines.push({key, head, worst, cross, depth, depth_text: (depth * 1000).toFixed(0), uuid: A.top.uuid, sig: sigOf(key, A, B, head)});
        }
      }
      return {count,findings,measurements,targets,machines};
    }
  };
}"""


def moved_caught(mutate, rows):
    """A detach/sink mutation is caught when a finding names the part it moved in that frame."""
    return any(
        ext["mutated"] and any(
            f.get("target_id") == ext["moved_id"] and (
                f["rule"].startswith("attach" if mutate == "detach" else "human")
                or (mutate == "detach" and f["rule"] == "auto floating")
                or (mutate == "sink" and f["rule"] == "seat contact"))
            for f in ext["findings"])
        for _, _, ext in rows)


def machine_findings(rows):
    """Machine pairs count only the depth added since the pair was first seen (its first measured depth, or 0 when
    first seen apart). Pages measure interleaved frame batches, so the first sighting is resolved here in frame order."""
    first = {}
    for _, _, ext in rows:
        for m in ext.pop("machines", ()):
            base, base_text, base_cross = first.setdefault(
                m["key"], (m.get("depth", 0), m.get("depth_text", "0"), bool(m.get("cross"))))
            if m.get("apart"):
                continue
            depth, cross = m["depth"], m["cross"]
            if cross and not base_cross and depth - base <= .02:
                row = {"rule": "machine penetration", "name": f"{m['head']} : {cross} (면 교차: 열린 껍데기 메시라 깊이 못 잼)",
                       "mm": None, "target_id": m["uuid"]}
            else:
                row = {"rule": "machine penetration",
                       "name": m["head"] + (" : " + m["worst"] if m["worst"] else "")
                       + f" (depth {m['depth_text']} mm, first {base_text} mm)",
                       "mm": (depth - base) * 1000 if math.isnan(depth - base) else max(0.0, depth - base) * 1000,
                       "target_id": m["uuid"]}
            ext["measurements"].append(row)
            if row["mm"] is None or not math.isfinite(row["mm"]) or row["mm"] > 20 + 1e-5:
                ext["findings"].append(row)


def keys_agree(parts):
    """Machine pairs are keyed by Object3D.id, which only names the same object in every page when the pages built
    their objects in the same order. Each page reports, at a pair's first sighting, where the two bodies sit in the
    scene graph and their names; the keys agree when every key has one such signature and every signature one key."""
    by_key, by_sig = {}, {}
    for rows, *_ in parts:
        for _, _, ext in rows:
            for m in ext.get("machines", ()):
                if m.get("sig") is None:
                    continue
                if by_key.setdefault(m["key"], m["sig"]) != m["sig"] or by_sig.setdefault(m["sig"], m["key"]) != m["key"]:
                    return False
    return True


async def measure(pw, html, a, batches):
    """One browser measures its frame batches; returns rows, page errors, WebGL lost, canvas count."""
    b = await pw.chromium.launch(executable_path=CHROME, headless=True, args=CHROME_ARGS)
    p = await b.new_page(viewport={"width": 1920, "height": 1080})
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    await p.goto(html.as_uri(), wait_until="load")
    await p.evaluate("Promise.resolve(window.renderReady).then(() => 0)")
    await p.evaluate(MESH_CHECK)
    if a.mutate in ("detach", "sink"):
        await p.evaluate("window.__rvClearanceNoMachine = true")
    if a.mutate == "gap":
        await p.evaluate("window.RIG && (RIG.P.GAP = -0.005)")
    rows = []
    for f0, f1 in batches:
          batch = await p.evaluate("""async ([a, b, mutation, rules]) => { const out = [];
          for (let i = a; i < b; i++) {
            window.CLEAR = null; __rvClearance.begin(); await window.renderAt(i / 30);
            const moved = __rvClearance.mutate(mutation);
            const ext = rules === 'legacy' ? {count:0,findings:[],targets:{attach:0,human:0,seat:0,auto:0,machine:0}} : __rvClearance.check();
            ext.mutated = !!moved; ext.moved_id = moved && moved.uuid; ext.drawn = __rvClearance.drawn();
            // Restore the injected displacement even when a scene does not rewrite its transform.
            if (moved) { const d = mutation === 'detach' ? .02 : -.1;
              const decl = mutation === 'sink' ? KIT.fx.clearance.seats.find(x => x.human === moved) : null;
              const up = mutation === 'detach' ? new THREE.Vector3(0,1,0) : new THREE.Vector3(...decl.up).normalize();
              const world = moved.getWorldPosition(new THREE.Vector3()).addScaledVector(up,-d);
              moved.position.copy(moved.parent ? moved.parent.worldToLocal(world) : world); moved.updateWorldMatrix(false,true); }
            out.push([i, rules === 'mesh' ? null : window.CLEAR, ext]); }
          return out; }""", [f0, f1, a.mutate, a.rules])
          rows += batch
          if a.mutate in ("detach", "sink") and moved_caught(a.mutate, batch):
            break
    lost, canvases = await p.evaluate("""() => { const cs = [...document.querySelectorAll('canvas')];
      return [cs.some(c => { const g = c.getContext('webgl2') || c.getContext('webgl'); return !!g && g.isContextLost(); }), cs.length]; }""")
    await b.close()
    return rows, errs, lost, canvases


async def main(a):
    html = Path(a.html).resolve()
    line = next(l for l in html.read_text(encoding="utf-8").split("\n") if l.startswith("window.DATA="))
    total = json.loads(line[len("window.DATA="):-1])["timeline"]["total_s"]
    t0, t1 = a.a, a.b if a.b is not None else total
    # Frames go out in batches of 30. The real check deals the batches round-robin to --shards browsers so a heavy
    # stretch (a fleet of machines) is shared; a mutation stays on one page and stops at the batch that catches it.
    last = math.floor(t1 * 30 + .5)
    batches = [(f, min(f + 30, last)) for f in range(math.floor(t0 * 30 + .5), last, 30)]
    n = 1 if a.mutate else max(1, min(a.shards, len(batches)))
    async with async_playwright() as pw:
        parts = await asyncio.gather(*(measure(pw, html, a, batches[k::n]) for k in range(n)))
        if n > 1 and not keys_agree(parts):   # objects built in a different order per page: measure on one page instead
            print("CLEARANCE_SHARDS machine pair keys differ between pages; measured again on one page")
            parts = [await measure(pw, html, a, batches)]
    rows = sorted((row for part in parts for row in part[0]), key=lambda row: row[0])
    errs = [e for part in parts for e in part[1]]
    lost, canvases = any(part[2] for part in parts), max(part[3] for part in parts)
    machine_findings(rows)
    if lost:
        errs.append("WebGL context lost: scenes were never drawn, nothing was measured")
    elif rows and canvases and not any(ext.get("drawn") for _, _, ext in rows):
        errs.append("no THREE scene was drawn in any frame (onBeforeRender never ran), nothing was measured")
    bad, n, ext_n, worst = [], 0, 0, (1e9, None, "")
    for i, c, ext in rows:
        if ext["count"]:
            ext_n += 1
        for finding in ext["findings"]:
            value = finding["mm"]
            bad.append((i, value if value is not None else float("inf"),
                        f"{finding['rule']} {finding['name']}"))
        if not c:
            continue
        n += 1
        if c["min_mm"] < worst[0]:
            worst = (c["min_mm"], i, c["part"])
        why, val = [], 1e9
        if c["min_mm"] < 0:
            why.append(f"파묻힘 {c['part']}"); val = min(val, c["min_mm"])
        for k, (tip, hold) in enumerate(zip(c["tips"], c["holding"])):
            if tip is None:
                continue
            if tip < 4.9:
                why.append(f"로봇{'AB'[k]} 센서 끝 < 4.9 mm"); val = min(val, tip)
            if hold and abs(tip - 5.0) > 0.1:
                why.append(f"로봇{'AB'[k]} 붙잡는 중 5.00±0.1 밖"); val = min(val, tip)
        if why:
            bad.append((i, val, why[0]))
    name = f"변이 {a.mutate}" if a.mutate else "실제"
    print(f"CLEARANCE_CHECK {name} · 잰 프레임 {n} · 가장 가까운 {worst[0]:.2f} mm (프레임 {worst[1]}, {(worst[1] or 0) / 30:.2f} s, {worst[2]}) · 페이지 오류 {len(errs)}")
    print(f"CLEARANCE_CHECK mesh · 잰 프레임 {ext_n}")
    targets = {key: sum(ext["targets"].get(key, 0) for _, _, ext in rows) for key in ("attach", "human", "seat", "auto", "machine")}
    print("CLEARANCE_TARGETS " + " ".join(f"{key}={value}" for key, value in targets.items()))
    metrics = {}
    for _, _, ext in rows:
        for measurement in ext.get("measurements", []):
            value = measurement["mm"] if measurement["mm"] is not None else float("inf")
            metrics[measurement["rule"]] = max(metrics.get(measurement["rule"], -float("inf")), value)
    for rule, value in metrics.items():
        print(f"CLEARANCE_MEASURE {rule} max={value:.2f} mm")
    auto_metrics = {}
    for _, _, ext in rows:
        for measurement in ext.get("measurements", []):
            if measurement["rule"] != "auto floating":
                continue
            value = measurement["mm"] if measurement["mm"] is not None else float("inf")
            name_ = measurement["name"]
            frames, worst_ = auto_metrics.get(name_, (0, -float("inf")))
            auto_metrics[name_] = (frames + 1, max(worst_, value))
    for name_, (frames, value) in auto_metrics.items():
        print(f"CLEARANCE_AUTO target={name_!r} frames={frames} max_gap={value:.2f} mm")
    auto_runs = {}
    for i, _, ext in rows:
        for finding in ext["findings"]:
            if finding["rule"] != "auto floating":
                continue
            value = finding["mm"] if finding["mm"] is not None else float("inf")
            ranges = auto_runs.setdefault(finding["name"], [])
            if ranges and ranges[-1][1] == i - 1:
                ranges[-1][1] = i
                ranges[-1][2] = min(ranges[-1][2], value)
                ranges[-1][3] = max(ranges[-1][3], value)
            else:
                ranges.append([i, i, value, value])
    # Uncapped per-target ranges remain complete even with simultaneous failures.
    for name_, ranges in auto_runs.items():
        for first, last, min_gap, max_gap in ranges:
            print("CLEARANCE_AUTO_FAIL " + json.dumps({
                "target": name_, "start_s": round(first / 30, 4),
                "end_s": round((last + 1) / 30, 4),
                "min_gap_mm": min_gap if min_gap != float("inf") else None,
                "max_gap_mm": max_gap if max_gap != float("inf") else None,
            }, ensure_ascii=False))
    for err in errs:
        print(f"  PAGE_ERROR {err}")
    runs = []
    for i, val, w in bad:
        if runs and i == runs[-1][1] + 1 and w == runs[-1][3]:
            runs[-1][1] = i; runs[-1][2] = min(runs[-1][2], val)
        else:
            runs.append([i, i, val, w])
    for s_, e_, v_, w in runs[:40]:
        print(f"  {s_ / 30:7.2f} ~ {e_ / 30:7.2f} s (프레임 {s_}~{e_}) {w} · 측정 {v_:.1f} mm")
    if n == 0 and ext_n == 0 and not errs:
        print(f"CLEARANCE_CHECK {name} SKIP (장면이 window.CLEAR 를 적지 않음)")
        sys.exit(0)
    ok = not bad and not errs
    caught = (a.mutate == "gap" and bad) or moved_caught(a.mutate, rows)
    if a.mutate and caught:
        print("MUTATION_CAUGHT")
    print(f"CLEARANCE_CHECK {name} " + ("PASS" if ok else f"FAIL ({len({i for i, _, _ in bad})} 프레임)"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--mutate", choices=["gap", "detach", "sink"])
    ap.add_argument("--rules", choices=["all", "legacy", "mesh"], default="all",
                    help="legacy keeps the existing mandatory rotor verdict; mesh is strict-mode opt-in")
    ap.add_argument("--from", dest="a", type=float, default=0.0)
    ap.add_argument("--to", dest="b", type=float, default=None)
    ap.add_argument("--shards", type=int, default=int(os.environ.get("RV_CHECK_SHARDS", "4")),
                    help="browsers that share the real check's frames (env RV_CHECK_SHARDS, default 4); mutations use one")
    asyncio.run(main(ap.parse_args()))
