/* Every person in the film is made here, so a new rv human model (v0.3.0 rv-human-natural) swaps in at one place. */
(function () {
  const RIDER = {height: 1.7, color: 0x2a3644, site: "office"};
  const PASSER = {height: 1.7, color: 0x3d4a45, site: "office"};
  function rider(parent) {
    return KIT.fx.human(parent, RIDER.height, RIDER.color, {site: RIDER.site});
  }
  function passer(scene) {
    return KIT.fx.human(scene, PASSER.height, PASSER.color, {site: PASSER.site});
  }
  window.PM_PEOPLE = {rider, passer};
})();
