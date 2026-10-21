(() => {
  const root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Sticky header, using a sentinel rather than a scroll listener.
  const header = $("#site-header");
  const sentinel = $(".scroll-sentinel");
  if (sentinel) new IntersectionObserver(([entry]) => header.classList.toggle("scrolled", !entry.isIntersecting)).observe(sentinel);

  // Mobile menu.
  const menuButton = $("#menu-button");
  const menu = $("#mobile-menu");
  const menuControls = $$("a, button", menu);
  let menuOpen = false;
  const setMenu = (open, returnFocus = false) => {
    menuOpen = open;
    menuButton.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    header.classList.toggle("menu-open", open);
    if (open) {
      const first = $("a, button", menu);
      if (first) first.focus();
    } else if (returnFocus) menuButton.focus();
  };
  menuButton.addEventListener("click", () => setMenu(!menuOpen));
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false, true);
      return;
    }
    if (event.key !== "Tab") return;
    const first = menuControls[0];
    const last = menuControls[menuControls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (menuOpen && !menu.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menuOpen) return;
    event.preventDefault();
    setMenu(false, true);
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
    if (event.matches && menuOpen) setMenu(false);
  });

  // Product tour tabs.
  const tablist = $(".tour-tabs");
  if (tablist) {
    const tabs = $$(".tour-tab");
    const selectTab = (tab) => {
      tabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute("aria-selected", String(selected));
        candidate.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(candidate.getAttribute("aria-controls"));
        if (panel) {
          panel.classList.toggle("is-active", selected);
          panel.setAttribute("aria-hidden", String(!selected));
        }
      });
      tab.focus();
    };
    tabs.forEach((tab) => {
      const panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.setAttribute("aria-hidden", String(tab.getAttribute("aria-selected") !== "true"));
      tab.addEventListener("click", () => selectTab(tab));
    });
    tablist.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next]);
    });
  }

  // One FAQ item open at a time.
  const faqs = $$(".faq-item");
  faqs.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) faqs.forEach((other) => { if (other !== item) other.open = false; });
    });
  });

  // Copy buttons.
  const live = $("#live-region");
  const announce = (message) => {
    if (!live) return;
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 20);
  };
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-target]");
    if (!button) return;
    const source = document.getElementById(button.dataset.copyTarget);
    if (!source) return;
    const text = source.innerText.replace(/^\s*\$\s?/gm, "").trim();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(source);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const label = $(".copy-label", button);
    if (label) label.textContent = copied ? "Copied" : "Selected";
    else button.classList.add("is-copied");
    announce(copied ? "Copied to clipboard" : "Command selected. Press copy.");
    window.setTimeout(() => {
      if (label) label.textContent = "Copy";
      else button.classList.remove("is-copied");
    }, 1500);
  });

  // GitHub stars and latest release, cached for one hour.
  const API = "https://api.github.com/repos/itchyparrot53/tuesday.";
  const CACHE_KEY = "tuesday-github-v1";
  const formatStars = (value) => {
    if (value < 1000) return String(value);
    const short = value / 1000;
    return `${short < 10 ? short.toFixed(1).replace(/\.0$/, "") : Math.round(short)}k`;
  };
  const fill = (data) => {
    if (data.stars > 0) {
      $$("[data-stars]").forEach((element) => {
        element.textContent = formatStars(data.stars);
        element.hidden = false;
      });
    }
    if (data.release) $$("[data-release], [data-version]").forEach((element) => { element.textContent = data.release; });
  };
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { cached = null; }
  if (cached && cached.at && Date.now() - cached.at < 60 * 60 * 1000) {
    fill(cached);
  } else {
    Promise.allSettled([
      fetch(API, { headers: { Accept: "application/vnd.github+json" } }).then((response) => {
        if (!response.ok) throw new Error("stars");
        return response.json();
      }),
      fetch(`${API}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } }).then((response) => {
        if (!response.ok) throw new Error("release");
        return response.json();
      })
    ]).then(([stars, release]) => {
      const data = {
        at: Date.now(),
        stars: stars.status === "fulfilled" ? Number(stars.value.stargazers_count) || 0 : 0,
        release: release.status === "fulfilled" ? release.value.tag_name || "" : ""
      };
      if (!data.stars && !data.release) return;
      fill(data);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* unavailable */ }
    });
  }

  // Entrance motion, only when it is welcome.
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    $$(".reveal").forEach((element) => observer.observe(element));
  } else {
    $$(".reveal").forEach((element) => element.classList.add("in"));
  }
})();
