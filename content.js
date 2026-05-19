(() => {
  const ROOT_ID = "cgpt-outline";
  const STORAGE_KEY = "cgpt-outline-collapsed";
  const ID_ATTR = "data-outline-id";
  const REBUILD_DEBOUNCE_MS = 250;

  let idCounter = 0;
  let rebuildTimer = null;
  let lastHref = location.href;
  let root, listEl, bodyEl, toggleBtn;

  function ensureSidebar() {
    if (document.getElementById(ROOT_ID)) return;

    root = document.createElement("div");
    root.id = ROOT_ID;

    const header = document.createElement("div");
    header.className = "cgpt-header";

    const title = document.createElement("span");
    title.className = "cgpt-title";
    title.textContent = "ThreadNav";

    toggleBtn = document.createElement("button");
    toggleBtn.className = "cgpt-toggle";
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-label", "Toggle outline");
    toggleBtn.textContent = "›";
    toggleBtn.addEventListener("click", toggleCollapsed);

    header.appendChild(title);
    header.appendChild(toggleBtn);

    bodyEl = document.createElement("div");
    bodyEl.className = "cgpt-body";

    listEl = document.createElement("ol");
    listEl.className = "cgpt-list";
    listEl.addEventListener("click", onListClick);

    bodyEl.appendChild(listEl);

    root.appendChild(header);
    root.appendChild(bodyEl);

    document.body.appendChild(root);

    applyCollapsed(loadCollapsed());
    applyTheme();
  }

  function loadCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function saveCollapsed(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
  }

  function applyCollapsed(collapsed) {
    if (!root) return;
    root.classList.toggle("collapsed", collapsed);
    toggleBtn.textContent = collapsed ? "‹" : "›";
  }

  function toggleCollapsed() {
    const next = !root.classList.contains("collapsed");
    applyCollapsed(next);
    saveCollapsed(next);
  }

  function isDarkTheme() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) return true;
    if (html.classList.contains("light")) return false;
    const themeAttr = html.getAttribute("data-theme") || html.getAttribute("data-color-scheme");
    if (themeAttr === "dark") return true;
    if (themeAttr === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme() {
    if (!root) return;
    const dark = isDarkTheme();
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
  }

  function truncate(s, n) {
    s = (s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trimEnd() + "…";
  }

  function ensureId(el) {
    let id = el.getAttribute(ID_ATTR);
    if (!id) {
      id = "o-" + ++idCounter;
      el.setAttribute(ID_ATTR, id);
    }
    return id;
  }

  function collectItems() {
    const items = [];
    const turns = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );

    turns.forEach((turn) => {
      const role = turn.getAttribute("data-message-author-role");
      if (role === "user") {
        const id = ensureId(turn);
        const label = truncate(turn.innerText, 70);
        if (label) items.push({ id, label, depth: "q" });
      } else if (role === "assistant") {
        const headings = turn.querySelectorAll(":scope h1, :scope h2, :scope h3");
        headings.forEach((h) => {
          const id = ensureId(h);
          const label = truncate(h.innerText, 70);
          if (!label) return;
          items.push({ id, label, depth: h.tagName.toLowerCase() });
        });
      }
    });

    return items;
  }

  function render(items) {
    if (!listEl) return;

    if (items.length === 0) {
      listEl.innerHTML = "";
      if (!bodyEl.querySelector(".cgpt-empty")) {
        const empty = document.createElement("div");
        empty.className = "cgpt-empty";
        empty.textContent = "No questions yet.";
        bodyEl.appendChild(empty);
      }
      return;
    }

    const empty = bodyEl.querySelector(".cgpt-empty");
    if (empty) empty.remove();

    const frag = document.createDocumentFragment();
    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "cgpt-item " + it.depth;
      li.dataset.target = it.id;
      li.textContent = it.label;
      li.title = it.label;
      frag.appendChild(li);
    });

    listEl.replaceChildren(frag);
  }

  function findScrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function scrollToTarget(target) {
    const beforeY = window.scrollY;
    target.scrollIntoView({ behavior: "smooth", block: "start" });

    setTimeout(() => {
      if (Math.abs(window.scrollY - beforeY) < 2) {
        const scroller = findScrollableAncestor(target);
        if (scroller) {
          const targetRect = target.getBoundingClientRect();
          const scrollerRect = scroller.getBoundingClientRect();
          const delta = targetRect.top - scrollerRect.top;
          scroller.scrollTo({ top: scroller.scrollTop + delta - 12, behavior: "smooth" });
        }
      }
    }, 120);
  }

  function onListClick(e) {
    const li = e.target.closest(".cgpt-item");
    if (!li) return;
    const id = li.dataset.target;
    const target = document.querySelector(`[${ID_ATTR}="${CSS.escape(id)}"]`);
    if (target) scrollToTarget(target);
  }

  function scheduleRebuild() {
    if (rebuildTimer) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      render(collectItems());
    }, REBUILD_DEBOUNCE_MS);
  }

  function observeConversation() {
    const target = document.querySelector("main") || document.body;
    const mo = new MutationObserver(scheduleRebuild);
    mo.observe(target, { subtree: true, childList: true, characterData: true });
  }

  function observeTheme() {
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-color-scheme"],
    });
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    }
  }

  function watchRoute() {
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        scheduleRebuild();
      }
    }, 500);
  }

  function boot() {
    ensureSidebar();
    scheduleRebuild();
    observeConversation();
    observeTheme();
    watchRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
