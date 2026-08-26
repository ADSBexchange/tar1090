"use strict";

// Watches one container's visibility and emits a debounced panel:open / panel:close event on each
// genuine transition. Because it reads the *settled* visibility (after a defer), a hidden->shown->hidden
// flip within one tick — which is what an aircraft switch does to the detail panel — nets no change and
// emits nothing. tar1090's own code is untouched; this only observes.
//
// Pure core: createPanelWatcher(name, readVisible, emit, defer). The browser wiring below hooks it to a
// MutationObserver and a setTimeout(0) defer (fires regardless of tab visibility).

function createPanelWatcher(name, readVisible, emit, defer) {
  var lastVisible = false; // panels start hidden; a visible-at-init panel emits open on the first settle
  var scheduled = false;

  function settle() {
    scheduled = false;
    var visible = !!readVisible();
    if (visible === lastVisible) return; // transient flip coalesced away, or no real change
    lastVisible = visible;
    emit(name, visible ? "open" : "close");
  }

  function notifyChanged() {
    if (scheduled) return; // coalesce a burst of mutations into one settle
    scheduled = true;
    defer(settle);
  }

  return { notifyChanged: notifyChanged, settle: settle };
}

// Browser wiring: observe each container and drive its watcher.
if (typeof window !== "undefined") {
  window.createPanelWatcher = createPanelWatcher;
  // setTimeout(0), not requestAnimationFrame: rAF is throttled/paused in background or non-painting
  // tabs (all browsers), which would stall the watcher whenever the globe isn't the foreground tab.
  // setTimeout fires regardless of tab visibility and still coalesces the synchronous mutation burst
  // — jQuery sets `display` at the start of a slide animation, so visibility is already correct next tick.
  var settleDefer = function (cb) { setTimeout(cb, 0); };

  // Attach a watcher to a container element; emits via jQuery custom events on the given bus.
  window.watchPanel = function (containerId, panelName, bus) {
    var el = document.getElementById(containerId);
    if (!el || typeof MutationObserver === "undefined") return null;
    var watcher = createPanelWatcher(
      panelName,
      function () { return el.offsetParent !== null; },
      function (name, type) { jQuery(bus).trigger("panel:" + type, [name]); },
      settleDefer
    );
    new MutationObserver(function () { watcher.notifyChanged(); })
      .observe(el, { attributes: true, attributeFilter: ["style", "class"] });
    watcher.notifyChanged(); // capture initial state (visible-at-load panels emit open)
    return watcher;
  };
}

// Node: exported for unit testing (inert in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createPanelWatcher: createPanelWatcher };
}
