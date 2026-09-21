"use strict";

const FS_STICKY_FOOTER_ID = "fs-sticky-footer";
const STICKY_FOOTER_HEIGHT_PROPERTY = "--STICKY-FOOTER-H";
const STICKY_FOOTER_ZERO_HEIGHT = "0px";
const STICKY_FOOTER_BODY_CLASS = "has-sticky-footer";

function createStickyFooterWatcher(findFooter, measureHeight, setHeightProperty) {
  function sync() {
    const footer = findFooter();
    setHeightProperty(footer ? measureHeight(footer) + "px" : STICKY_FOOTER_ZERO_HEIGHT);
    return footer;
  }
  return { sync };
}

if (typeof window !== "undefined") {
  const rootStyle = document.documentElement.style;
  const watcher = createStickyFooterWatcher(
    function () { return document.getElementById(FS_STICKY_FOOTER_ID); },
    function (el) { return el.getBoundingClientRect().height; },
    function (value) {
      rootStyle.setProperty(STICKY_FOOTER_HEIGHT_PROPERTY, value);
      document.body.classList.toggle(STICKY_FOOTER_BODY_CLASS, value !== STICKY_FOOTER_ZERO_HEIGHT);
      if (typeof OLMap !== "undefined" && OLMap) { OLMap.updateSize(); }
    }
  );

  let resizeObserver = null;
  let currentFooter = null;

  function watchResize(el) {
    if (typeof ResizeObserver === "undefined") return;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(function () { watcher.sync(); });
    resizeObserver.observe(el);
  }

  function refresh() {
    const footer = watcher.sync();
    if (footer !== currentFooter) {
      if (footer) {
        watchResize(footer);
      } else if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      currentFooter = footer;
    }
  }

  refresh();
  new MutationObserver(refresh).observe(document.body, { childList: true });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createStickyFooterWatcher,
    FS_STICKY_FOOTER_ID,
    STICKY_FOOTER_HEIGHT_PROPERTY,
    STICKY_FOOTER_ZERO_HEIGHT,
    STICKY_FOOTER_BODY_CLASS,
  };
}
