/* Every person in the film is made here, so a new rv human model (v0.3.0 rv-human-natural) swaps in at one place. */
(function () {
  const HERO = {height: 1.75, color: 0x0b0c0e, site: "office"};
  function hero(scene) {
    return KIT.fx.human(scene, HERO.height, HERO.color, {site: HERO.site});
  }
  window.PM_PEOPLE = {hero};
})();
