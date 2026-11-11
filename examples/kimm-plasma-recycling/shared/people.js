/* Every person in the film is made here, so a new rv human model (v0.3.0 rv-human-natural) swaps in at one place. */
(function () {
  const WORKER = {height: 1.74, color: 0x2e3a44, site: "construction"};
  function worker(parent) {
    return KIT.fx.human(parent, WORKER.height, WORKER.color, {site: WORKER.site});
  }
  window.PM_PEOPLE = {worker};
})();
