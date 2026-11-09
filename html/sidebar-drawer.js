"use strict";

const SIDEBAR_SLIDE_MS = 240;
const SIDEBAR_SLIDING_CLASS = 'sidebar-sliding';
const SIDEBAR_OFFSCREEN_CLASS = 'sidebar-offscreen';
const SIDEBAR_RIDING_CLASS = 'panel-sliding';
const SIDEBAR_DRAGGING_CLASS = 'dragging';
const SIDEBAR_SLIDE_SHIFT_VAR = '--panel-slide-shift';
const SIDEBAR_DRAG_THRESHOLD_PX = 4;
const SIDEBAR_HOLD_MS = 300;
const NON_POINTER_CLICK_DETAIL = 0;
const SIDEBAR_MIN_WIDTH_PX = 150;
const SIDEBAR_MAX_WIDTH_SHARE = 0.8;
const SIDEBAR_STRETCH_RESISTANCE = 0.3;
const SIDEBAR_FULL_RELEASE_SHARE = 0.1;
const SIDEBAR_RELEASE_FULL = 'full';
const SIDEBAR_RELEASE_SPRING = 'spring';
const SIDEBAR_RELEASE_NONE = 'none';
const SIDEBAR_GLIDING_CLASS = 'sidebar-gliding';
const SIDEBAR_FULL_CLASS = 'sidebar-full';
const SIDEBAR_EDGE_ID = 'sidebar_edge';
const LAYOUT_CONTAINER_SELECTOR = '#layout_container';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MAP_CONTAINER_ID = 'map_container';
const SIDEBAR_CONTAINER_ID = 'sidebar_container';
const SIDEBAR_SELECTOR = '#' + SIDEBAR_CONTAINER_ID;
let sidebarSlideTimer = null;
let sidebarSlideFinish = null;
let sidebarDragging = false;

function sidebarCanSlide() {
    return loadFinished && !sidebarDragging
        && !(typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches);
}

function resizeMapKeepingContent() {
    if (!OLMap) return;
    const before = OLMap.getSize();
    const anchorPixel = before ? [0, before[1] / 2] : null;
    const anchor = anchorPixel ? OLMap.getCoordinateFromPixel(anchorPixel) : null;
    OLMap.updateSize();
    const after = OLMap.getSize();
    if (!anchor || !after || before[0] === after[0]) return;
    OLMap.getView().centerOn(anchor, after, anchorPixel);
}

function sidebarRidingContainers() {
    return [MAP_CONTAINER_ID, SIDEBAR_EDGE_ID].map(function (id) { return document.getElementById(id); });
}

function slideRightControls(fromPx, toPx) {
    sidebarRidingContainers().forEach(function (container) {
        container.classList.remove(SIDEBAR_RIDING_CLASS);
        container.style.setProperty(SIDEBAR_SLIDE_SHIFT_VAR, fromPx + 'px');
        container.getBoundingClientRect();
        container.classList.add(SIDEBAR_RIDING_CLASS);
        container.style.setProperty(SIDEBAR_SLIDE_SHIFT_VAR, toPx + 'px');
    });
}

function settleRightControls() {
    sidebarRidingContainers().forEach(function (container) {
        container.classList.remove(SIDEBAR_RIDING_CLASS);
        container.style.removeProperty(SIDEBAR_SLIDE_SHIFT_VAR);
    });
}

function showSidebar(show) {
    const panel = jQuery(SIDEBAR_SELECTOR);
    clearTimeout(sidebarSlideTimer);
    sidebarSlideFinish = null;
    panel.removeClass(SIDEBAR_SLIDING_CLASS + ' ' + SIDEBAR_OFFSCREEN_CLASS + ' ' + SIDEBAR_GLIDING_CLASS);
    settleRightControls();
    if (!sidebarCanSlide()) {
        panel.toggle(show);
        return;
    }
    startSidebarSlide(panel, show);
}

function startSidebarSlide(panel, show) {
    panel.addClass(SIDEBAR_SLIDING_CLASS).toggleClass(SIDEBAR_OFFSCREEN_CLASS, show).show();
    const width = panel.outerWidth();
    if (!show) resizeMapKeepingContent();
    panel[0].getBoundingClientRect();
    panel.toggleClass(SIDEBAR_OFFSCREEN_CLASS, !show);
    if (show) slideRightControls(0, -width);
    else slideRightControls(-width, 0);
    sidebarSlideFinish = function () { endSidebarSlide(panel, show); };
    sidebarSlideTimer = setTimeout(finishSidebarSlide, SIDEBAR_SLIDE_MS);
}

function endSidebarSlide(panel, show) {
    cancelTransitions(panel[0]);
    panel.removeClass(SIDEBAR_SLIDING_CLASS + ' ' + SIDEBAR_OFFSCREEN_CLASS);
    panel.toggle(show);
    settleRightControls();
    if (show) resizeMapKeepingContent();
}

function cancelTransitions(element) {
    if (typeof element.getAnimations !== 'function') return;
    element.getAnimations().forEach(function (animation) { animation.cancel(); });
}

function finishSidebarSlide() {
    clearTimeout(sidebarSlideTimer);
    const finish = sidebarSlideFinish;
    sidebarSlideFinish = null;
    if (finish) finish();
}

function finishSidebarGlide() {
    if (jQuery(SIDEBAR_SELECTOR).hasClass(SIDEBAR_GLIDING_CLASS)) finishSidebarSlide();
}

function sidebarWidthAt(clientX, viewportWidth) {
    return Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(viewportWidth - clientX, viewportWidth * SIDEBAR_MAX_WIDTH_SHARE));
}

function sidebarMaxWidth(viewportWidth) {
    return viewportWidth * SIDEBAR_MAX_WIDTH_SHARE;
}

function stretchedSidebarWidthAt(clientX, viewportWidth) {
    const overshoot = viewportWidth - clientX - sidebarMaxWidth(viewportWidth);
    if (overshoot <= 0) return sidebarWidthAt(clientX, viewportWidth);
    return sidebarMaxWidth(viewportWidth) + overshoot * SIDEBAR_STRETCH_RESISTANCE;
}

function sidebarReleaseAction(lastX, viewportWidth, stretched, letGo) {
    if (letGo && lastX <= viewportWidth * SIDEBAR_FULL_RELEASE_SHARE) return SIDEBAR_RELEASE_FULL;
    if (stretched) return SIDEBAR_RELEASE_SPRING;
    return SIDEBAR_RELEASE_NONE;
}

function shouldSuppressClick(suppressPending, clickDetail, onHandle) {
    return suppressPending && clickDetail !== NON_POINTER_CLICK_DETAIL && onHandle;
}

function setSidebarWidthAt(clientX) {
    jQuery(SIDEBAR_SELECTOR).width(stretchedSidebarWidthAt(clientX, window.innerWidth)).trigger('resize');
}

function sidebarStretched() {
    return jQuery(SIDEBAR_SELECTOR).width() > sidebarMaxWidth(window.innerWidth);
}

function glideSidebarWidth(width, done) {
    const panel = jQuery(SIDEBAR_SELECTOR);
    finishSidebarSlide();
    if (!sidebarCanSlide()) {
        panel.width(width);
        done();
        return;
    }
    panel[0].getBoundingClientRect();
    panel.addClass(SIDEBAR_GLIDING_CLASS);
    panel.width(width);
    sidebarSlideFinish = function () {
        cancelTransitions(panel[0]);
        panel.removeClass(SIDEBAR_GLIDING_CLASS);
        done();
    };
    sidebarSlideTimer = setTimeout(finishSidebarSlide, SIDEBAR_SLIDE_MS);
}

function glideToFullTable(restoreWidth) {
    glideSidebarWidth(jQuery(LAYOUT_CONTAINER_SELECTOR).width(), function () {
        loStore['sidebar_width'] = restoreWidth;
        expandSidebar();
    });
}

function springBackToMaxWidth() {
    glideSidebarWidth(sidebarMaxWidth(window.innerWidth), function () {
        jQuery(SIDEBAR_SELECTOR).trigger('resize');
        updateMapSize();
    });
}

function returnToMapFromFullTable() {
    const panel = jQuery(SIDEBAR_SELECTOR);
    const fullWidth = panel.width();
    const restoreWidth = loStore['sidebar_width'];
    showMap();
    panel.width(fullWidth);
    glideSidebarWidth(restoreWidth, updateMapSize);
}

function sidebarEdgeX() {
    if (!toggles['sidebar_visible'].state) return window.innerWidth;
    return document.getElementById(SIDEBAR_CONTAINER_ID).getBoundingClientRect().left;
}

function attachSidebarDrag(handle) {
    const press = { startX: null, lastX: null, grabOffset: 0, restoreWidth: null, holdTimer: null, suppressClick: false };
    handle.addEventListener('pointerdown', function (e) { pressSidebarHandle(handle, press, e); });
    handle.addEventListener('pointermove', function (e) { moveSidebarHandle(handle, press, e); });
    handle.addEventListener('pointerup', function () { releaseSidebarHandle(handle, press, true); });
    handle.addEventListener('pointercancel', function () { releaseSidebarHandle(handle, press, false); });
    handle.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('click', function (e) { suppressClickAfterDrag(handle, press, e); }, true);
}

function pressSidebarHandle(handle, press, e) {
    if (e.button !== 0) return;
    finishSidebarSlide();
    press.startX = e.clientX;
    press.lastX = e.clientX;
    press.grabOffset = sidebarEdgeX() - e.clientX;
    press.restoreWidth = loStore['sidebar_width'];
    press.suppressClick = false;
    handle.setPointerCapture(e.pointerId);
    press.holdTimer = setTimeout(function () { beginSidebarDrag(handle, press); }, SIDEBAR_HOLD_MS);
}

function beginSidebarDrag(handle, press) {
    if (sidebarDragging) return;
    sidebarDragging = true;
    handle.classList.add(SIDEBAR_DRAGGING_CLASS);
    if (toggles['sidebar_visible'].state) return;
    setSidebarWidthAt(press.lastX + press.grabOffset);
    toggles['sidebar_visible'].toggle(true);
}

function moveSidebarHandle(handle, press, e) {
    if (press.startX === null) return;
    press.lastX = e.clientX;
    if (!sidebarDragging && Math.abs(e.clientX - press.startX) < SIDEBAR_DRAG_THRESHOLD_PX) return;
    beginSidebarDrag(handle, press);
    if (!mapIsVisible && e.clientX <= press.startX) return;
    if (!mapIsVisible) showMap();
    setSidebarWidthAt(e.clientX + press.grabOffset);
}

function releaseSidebarHandle(handle, press, letGo) {
    clearTimeout(press.holdTimer);
    const pressed = press.startX !== null;
    press.startX = null;
    if (!sidebarDragging) {
        if (letGo && pressed) tapSidebarHandle(handle, press);
        return;
    }
    sidebarDragging = false;
    press.suppressClick = true;
    handle.classList.remove(SIDEBAR_DRAGGING_CLASS);
    updateMapSize();
    settleSidebarDrag(press, letGo);
}

function settleSidebarDrag(press, letGo) {
    if (!mapIsVisible) return;
    const action = sidebarReleaseAction(press.lastX, window.innerWidth, sidebarStretched(), letGo);
    if (action === SIDEBAR_RELEASE_FULL) glideToFullTable(press.restoreWidth);
    else if (action === SIDEBAR_RELEASE_SPRING) springBackToMaxWidth();
}

function tapSidebarHandle(handle, press) {
    handle.click();
    press.suppressClick = true;
}

function suppressClickAfterDrag(handle, press, e) {
    if (!shouldSuppressClick(press.suppressClick, e.detail, handle.contains(e.target))) return;
    press.suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
}

function initSidebarDrag() {
    attachSidebarDrag(document.getElementById('toggle_sidebar_button'));
    attachSidebarDrag(document.getElementById('splitter'));
}

function resetSidebarWidth() {
    const panel = jQuery(SIDEBAR_SELECTOR);
    jQuery('#legend').hide();
    panel.width('auto');
    updateMapSize();
    loStore['sidebar_width'] = panel.width();
    panel.width(loStore['sidebar_width']);
    jQuery('#legend').show();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { sidebarWidthAt, stretchedSidebarWidthAt, sidebarReleaseAction, shouldSuppressClick, SIDEBAR_SLIDE_MS };
}
