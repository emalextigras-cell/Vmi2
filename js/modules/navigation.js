(() => {
  /** @type {HTMLDetailsElement | null} */
  const settings = /** @type {HTMLDetailsElement | null} */ (document.querySelector('details#reglages'));
  const nav = document.querySelector('.main-nav');
  /** @type {HTMLAnchorElement[]} */
  const links = Array.from(nav?.querySelectorAll('a[href^="#"]') ?? []);
  /** @type {HTMLElement[]} */
  const sections = links
    .map(link => document.getElementById(link.hash.slice(1)))
    .filter((section) => section !== null);

  const setActive = id => {
    links.forEach(link => {
      if (link.hash === '#' + id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const openSettingsFromHash = () => {
    if (window.location.hash === '#reglages' && settings) settings.open = true;
    if (sections.some(section => '#' + section.id === window.location.hash)) setActive(window.location.hash.slice(1));
  };
  links.forEach(link => link.addEventListener('click', () => {
    const id = link.hash.slice(1);
    if (id === 'reglages' && settings) settings.open = true;
    setActive(id);
  }));
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.15, 0.4, 0.7] });
    sections.forEach(section => observer.observe(section));
  } else {
    window.addEventListener('scroll', () => {
      const current = sections.filter(section => section.getBoundingClientRect().top <= window.innerHeight * 0.35)
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
      if (current) setActive(current.id);
    }, { passive: true });
  }
  window.addEventListener('hashchange', openSettingsFromHash);
  setActive('accueil');
  openSettingsFromHash();
})();
