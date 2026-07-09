import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCapo, scrollSpeedForDuration } from "../viewutils.mjs";

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
