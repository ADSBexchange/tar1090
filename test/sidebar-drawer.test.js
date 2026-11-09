"use strict";

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    sidebarWidthAt,
    stretchedSidebarWidthAt,
    sidebarReleaseAction,
    shouldSuppressClick,
    SIDEBAR_SLIDE_MS,
} = require('../html/sidebar-drawer.js');

const VIEWPORT_WIDTH = 1000;

test('a pointer near the right edge keeps the sidebar at its 150 px minimum', () => {
    assert.equal(sidebarWidthAt(990, VIEWPORT_WIDTH), 150);
});

test('a pointer mid-screen sets the sidebar to the distance from the right edge', () => {
    assert.equal(sidebarWidthAt(500, VIEWPORT_WIDTH), 500);
});

test('a pointer far left caps the sidebar at 80% of the viewport', () => {
    assert.equal(sidebarWidthAt(100, VIEWPORT_WIDTH), 800);
});

test('dragging past the 80% cap stretches with 0.3 resistance', () => {
    assert.equal(stretchedSidebarWidthAt(100, VIEWPORT_WIDTH), 830);
});

test('letting go at or left of 10% of the viewport snaps to the full table', () => {
    assert.equal(sidebarReleaseAction(100, VIEWPORT_WIDTH, true, true), 'full');
});

test('letting go stretched just right of 10% springs back to the cap', () => {
    assert.equal(sidebarReleaseAction(101, VIEWPORT_WIDTH, true, true), 'spring');
});

test('letting go unstretched mid-screen leaves the width alone', () => {
    assert.equal(sidebarReleaseAction(500, VIEWPORT_WIDTH, false, true), 'none');
});

test('a cancelled drag left of 10% never snaps to the full table', () => {
    assert.equal(sidebarReleaseAction(100, VIEWPORT_WIDTH, true, false), 'spring');
    assert.equal(sidebarReleaseAction(100, VIEWPORT_WIDTH, false, false), 'none');
});

test('a pointer click on the handle after a drag is suppressed', () => {
    assert.equal(shouldSuppressClick(true, 1, true), true);
});

test('a keyboard click on the handle after a drag is not suppressed', () => {
    assert.equal(shouldSuppressClick(true, 0, true), false);
});

test('a click with no drag pending is not suppressed', () => {
    assert.equal(shouldSuppressClick(false, 1, true), false);
});

test('a click off the handle is not suppressed', () => {
    assert.equal(shouldSuppressClick(true, 1, false), false);
});

test('the slide duration is exported for the timing check', () => {
    assert.equal(typeof SIDEBAR_SLIDE_MS, 'number');
});
