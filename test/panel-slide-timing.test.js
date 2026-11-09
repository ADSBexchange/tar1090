"use strict";

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML_DIR = path.join(__dirname, '..', 'html');

test('the slide timer in script.js lasts as long as the CSS slide', () => {
    const css = fs.readFileSync(path.join(HTML_DIR, 'style.css'), 'utf8');
    const script = fs.readFileSync(path.join(HTML_DIR, 'script.js'), 'utf8');
    const cssMs = css.match(/--panel-slide-ms:\s*(\d+)ms;/);
    const scriptMs = script.match(/const SIDEBAR_SLIDE_MS = (\d+);/);
    assert.ok(cssMs, '--panel-slide-ms is set on :root');
    assert.ok(scriptMs, 'SIDEBAR_SLIDE_MS is declared');
    assert.equal(Number(scriptMs[1]), Number(cssMs[1]));
});

test('every panel slide in style.css uses the one timing', () => {
    const css = fs.readFileSync(path.join(HTML_DIR, 'style.css'), 'utf8');
    assert.doesNotMatch(css, /\d+ms cubic-bezier\(\.2, 0, 0, 1\)/);
});
