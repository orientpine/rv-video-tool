#!/bin/bash
# Synthetic sleeve: sliding along its arm is not detachment.
set -euo pipefail
TOOL="$(cd "$(dirname "$0")/.." && pwd)"
export TMPDIR="${TMPDIR:-$(mktemp -d)}"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
python3 - "$TOOL" "$W" <<'PY'
from pathlib import Path
import sys

tool, work = map(Path, sys.argv[1:])
three = (tool / "vendor/three-0.147.0.min.js").read_text()
kit = (tool / "kit/scene_kit.js").read_text()
fixture = r"""
const mode = MODE;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .01, 10);
camera.position.set(0, .1, 1); camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer(); renderer.setSize(320, 320);
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));
const parent = new THREE.Group(); scene.add(parent);
if (mode === 'parent') { parent.rotation.z = .7; parent.scale.set(1.3, .8, 1); }
const arm = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .6, 16),
  new THREE.MeshStandardMaterial({color: 0x888888}));
arm.name = 'arm'; parent.add(arm);
const tube = new THREE.LatheGeometry([[.061,-.09],[.063,-.09],[.063,.09],[.061,.09],[.061,-.09]]
  .map(([r,y]) => new THREE.Vector2(r,y)), 16);
const sleeve = new THREE.Mesh(tube,
  new THREE.MeshStandardMaterial({color: 0xcc7722, side: THREE.DoubleSide}));
sleeve.name = 'sleeve'; parent.add(sleeve);
if (mode === 'slide') sleeve.position.y = .02;
if (mode === 'gap') sleeve.position.x = .25;
if (['box', 'auto-box', 'sink', 'sunk'].includes(mode)) {
  arm.geometry = new THREE.BoxGeometry(.2, .1, .2);
  sleeve.geometry = new THREE.BoxGeometry(.04, .08, .04);
  sleeve.position.y = .09;
}
if (mode === 'none') { arm.visible = false; sleeve.visible = false; }
if (mode === 'sunk') sleeve.position.y = .03;   // seated 4 cm into its seat: a real finding, and no attachment to detach
const start = sleeve.position.clone();
if (mode === 'sink' || mode === 'sunk') {
  const contact = new THREE.Object3D(); contact.position.y = -.04; sleeve.add(contact);
  sleeve.userData.pose = 'sit';
  sleeve.userData.contacts = {seat: contact, feet: [], hands: []};
}
const overlay = document.createElement('div'); document.body.append(overlay);
const label = mode.startsWith('auto') ? KIT.label(overlay, 'sleeve', {target: sleeve}) : null;
window.renderReady = Promise.resolve();
window.renderAt = async t => {
  if (sleeve.position.distanceTo(start) > 1e-10) throw new Error('mutation was not restored');
  KIT.fx.reset();
  if (label) label.place(camera, sleeve.getWorldPosition(new THREE.Vector3()), 60, -40, 1);
  else if (mode === 'sink' || mode === 'sunk') KIT.fx.seat(sleeve, {seat: arm, floor: arm});
  else if (mode !== 'none') KIT.fx.attach(sleeve, arm, {tol_mm: 2});
  renderer.render(scene, camera);
};
"""
for mode in ["sleeve", "slide", "gap", "parent", "box", "none", "auto", "auto-box", "sink", "sunk"]:
    html = '<html><body><script>' + three + '</script><script>\n'
    html += 'window.DATA={"timeline":{"total_s":0.1}};\n' + kit
    html += fixture.replace("MODE", repr(mode)) + '</script></body></html>'
    (work / (mode + ".html")).write_text(html)
PY
run() {
  local mode="$1" expected="$2"; shift 2
  local status=0
  uv run -q --no-project --with playwright --with pillow python "$TOOL/lib/check_clearance.py" \
    "$W/$mode.html" --rules mesh "$@" >"$W/result.log" 2>&1 || status=$?
  echo "CASE $mode $* exit=$status expected=$expected"
  cat "$W/result.log"
  [ "$status" = "$expected" ] || { echo "FAIL $mode exit $status expected $expected"; exit 1; }
  ! grep -q 'PAGE_ERROR' "$W/result.log"
}
# Controls distinguish a harmless axial slide from an actual surface gap.
run sleeve 0
run slide 0
run gap 1; grep -q 'attach gap' "$W/result.log"
# A sleeve must not make the self-test depend on attachment declaration order.
run sleeve 1 --mutate detach; grep -qx MUTATION_CAUGHT "$W/result.log"
run parent 1 --mutate detach; grep -qx MUTATION_CAUGHT "$W/result.log"
run box 1 --mutate detach; grep -qx MUTATION_CAUGHT "$W/result.log"
run auto-box 1 --mutate detach; grep -qx MUTATION_CAUGHT "$W/result.log"
run auto 0 --mutate detach; grep -qx MUTATION_SKIP "$W/result.log"
run none 0 --mutate detach; grep -qx MUTATION_SKIP "$W/result.log"
# Nothing to detach is a SKIP even when the scene already fails for another reason (that FAIL is the real run's).
run sunk 1
run sunk 0 --mutate detach; grep -qx MUTATION_SKIP "$W/result.log"
# The shared transform restoration also preserves the existing sink mutation.
run sink 0
run sink 1 --mutate sink; grep -qx MUTATION_CAUGHT "$W/result.log"
echo "DETACH_TESTS PASS"
