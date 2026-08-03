import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampCapo,
  scrollSpeedForDuration,
  chordPopoverPlacement,
  shouldHoldWakeLock,
} from "../viewutils.mjs";

test("clampCapo clamps and flags bad values", () => {
  assert.deepEqual(clampCapo("2"), { capo: 2, bad: false });
  assert.deepEqual(clampCapo(undefined), { capo: 0, bad: false });
  assert.deepEqual(clampCapo("32"), { capo: 11, bad: true }); // demo's bad value
  assert.deepEqual(clampCapo("-3"), { capo: 0, bad: true });
  assert.deepEqual(clampCapo("nope"), { capo: 0, bad: true });
});

test("scrollSpeedForDuration derives px/s, guards zero", () => {
  assert.equal(scrollSpeedForDuration(2100, 210), 10);
  assert.equal(scrollSpeedForDuration(2100, 0), 0);
});

test("chordPopoverPlacement keeps a popover inside horizontal viewport margins", () => {
  const viewport = { width: 320, height: 640 };
  const popover = { width: 84, height: 90 };

  assert.deepEqual(
    chordPopoverPlacement(
      { left: 0, top: 200, right: 20, bottom: 220 },
      popover,
      viewport
    ),
    { shiftX: 40, below: false }
  );
  assert.deepEqual(
    chordPopoverPlacement(
      { left: 300, top: 200, right: 320, bottom: 220 },
      popover,
      viewport
    ),
    { shiftX: -40, below: false }
  );
});

test("chordPopoverPlacement moves below when there is not enough room above", () => {
  assert.deepEqual(
    chordPopoverPlacement(
      { left: 140, top: 20, right: 180, bottom: 40 },
      { width: 84, height: 90 },
      { width: 320, height: 640 }
    ),
    { shiftX: 0, below: true }
  );
});

test("shouldHoldWakeLock requires performance mode, visibility, and support", () => {
  assert.equal(shouldHoldWakeLock(true, "visible", true), true);
  assert.equal(shouldHoldWakeLock(false, "visible", true), false);
  assert.equal(shouldHoldWakeLock(true, "hidden", true), false);
  assert.equal(shouldHoldWakeLock(true, "visible", false), false);
});
