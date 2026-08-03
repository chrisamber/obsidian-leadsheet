# Mobile Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a phone or tablet a dependable music stand by keeping Leadsheet controls touchable, chord popovers visible, and the screen awake during performance mode.

**Architecture:** Keep the current Markdown renderer and settings schema. Add two small pure helpers to `viewutils.ts`, use one plugin-level coordinator for open chord popovers, apply responsive behavior with a single CSS breakpoint, and wrap the native Screen Wake Lock API in the existing plugin lifecycle with a silent unsupported fallback.

**Tech Stack:** TypeScript, Obsidian Plugin API, DOM/CSS, Screen Wake Lock API, Node.js built-in test runner, esbuild.

## Global Constraints

- Do not start implementation until 0.6.0 is merged to `main` and publicly released; do not add 0.7 scope to `release/0.6.0`.
- Run every package-manager and build command from `.obsidian/plugins/leadsheet`.
- Keep `minAppVersion` at `1.0.0`; unsupported Screen Wake Lock implementations must remain a no-op.
- Add no dependencies, settings, gestures, menus, telemetry, accounts, or note-content migrations.
- Reading view remains the mobile performance path; do not redesign Live Preview or source editing.
- At viewport widths of `600px` or less, interactive toolbar and setlist navigation targets must be at least `44px × 44px`.
- Keep chord popovers at least `8px` inside the viewport and preserve hover, tap, focus, blur, and Escape behavior.
- Hold a screen wake lock only while performance mode is active and the document is visible; release it when performance mode ends, visibility is lost, or the plugin unloads.
- Preserve the existing desktop layout above `600px`.
- Do not publish 0.7.0 until physical-device smoke tests pass on iPhone, iPad, and Android.

---

## File Structure

- Modify `src/viewutils.ts`: keep the viewport-placement and wake-lock eligibility decisions pure and DOM-independent.
- Modify `test/viewutils.test.mjs`: cover edge placement and wake-lock eligibility with the existing Node test runner.
- Modify `src/main.ts`: coordinate one open chord popover and own the Screen Wake Lock lifecycle.
- Modify `styles.css`: add popover placement hooks and one narrow-screen responsive layout.
- Modify `README.md`: document mobile performance mode and the progressive wake-lock behavior.
- Modify `CHANGELOG.md`: record the unreleased user-visible behavior.
- Create no new production source modules; `main.ts` already owns DOM behavior and `viewutils.ts` already owns small pure view decisions.

### Task 1: Viewport-safe chord popover placement

**Files:**
- Modify: `src/viewutils.ts:1-11`
- Test: `test/viewutils.test.mjs:1-16`

**Interfaces:**
- Consumes: rectangle-like `{ left, top, right, bottom }` values from `getBoundingClientRect()` and `{ width, height }` values for the popover and viewport.
- Produces: `chordPopoverPlacement(trigger, popover, viewport, margin?, gap?): { shiftX: number; below: boolean }` for Task 2.

- [ ] **Step 1: Write the failing placement tests**

Replace the import at the top of `test/viewutils.test.mjs` with:

```js
import {
  clampCapo,
  scrollSpeedForDuration,
  chordPopoverPlacement,
} from "../viewutils.mjs";
```

Append these tests:

```js
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run build && node --test test/viewutils.test.mjs
```

Expected: FAIL because `viewutils.mjs` does not export `chordPopoverPlacement`.

- [ ] **Step 3: Add the minimal pure placement helper**

Append this code to `src/viewutils.ts`:

```ts
interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

export function chordPopoverPlacement(
  trigger: Bounds,
  popover: Size,
  viewport: Size,
  margin = 8,
  gap = 9
): { shiftX: number; below: boolean } {
  const idealLeft = (trigger.left + trigger.right - popover.width) / 2;
  const maxLeft = viewport.width - margin - popover.width;
  const left = maxLeft < margin
    ? margin
    : Math.min(Math.max(idealLeft, margin), maxLeft);
  const above = trigger.top - margin;
  const below = viewport.height - trigger.bottom - margin;
  return {
    shiftX: left - idealLeft,
    below: above < popover.height + gap && below > above,
  };
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npm run build && node --test test/viewutils.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the independently tested helper**

```bash
git add src/viewutils.ts test/viewutils.test.mjs
git commit -m "test: define mobile chord popover placement"
```

### Task 2: One coordinated, viewport-safe chord popover

**Files:**
- Modify: `src/main.ts:1-606`
- Modify: `styles.css:151-179`
- Test: `test/viewutils.test.mjs`

**Interfaces:**
- Consumes: `chordPopoverPlacement(trigger, popover, viewport)` from Task 1.
- Produces: `LeadsheetPlugin.toggleChordPopover(trigger): boolean` and `LeadsheetPlugin.closeChordPopover(suppressHover?): void`; all rendered chords route through this single coordinator.

- [ ] **Step 1: Import the placement helper and add plugin-level popover state**

Replace the `viewutils` import in `src/main.ts` with:

```ts
import {
  clampCapo,
  scrollSpeedForDuration,
  chordPopoverPlacement,
} from "./viewutils";
```

Add this field immediately after `private liveSpeed = 0`:

```ts
  private openChordTrigger: HTMLButtonElement | null = null;
```

- [ ] **Step 2: Register one outside-tap and resize coordinator**

In `onload()`, after the two body style/class initialization lines and before registering Markdown processors, add:

```ts
    this.registerDomEvent(activeDocument, "pointerdown", (event) => {
      const target = event.target as Node | null;
      if (target && !this.openChordTrigger?.contains(target)) this.closeChordPopover();
    });
    this.registerDomEvent(activeWindow, "resize", () => {
      if (this.openChordTrigger) this.positionChordPopover(this.openChordTrigger);
    });
```

At the beginning of `onunload()`, add:

```ts
    this.closeChordPopover();
```

- [ ] **Step 3: Add the coordinator methods to `LeadsheetPlugin`**

Insert these methods before `isScrolling()`:

```ts
  toggleChordPopover(trigger: HTMLButtonElement): boolean {
    if (this.openChordTrigger === trigger) {
      this.closeChordPopover(true);
      return false;
    }
    this.closeChordPopover();
    this.openChordTrigger = trigger;
    trigger.addClass("ls-popover-open");
    this.positionChordPopover(trigger);
    return true;
  }

  closeChordPopover(suppressHover = false) {
    const trigger = this.openChordTrigger;
    if (!trigger) return;
    trigger.removeClass("ls-popover-open");
    trigger.toggleClass("ls-popover-dismissed", suppressHover);
    this.openChordTrigger = null;
  }

  private positionChordPopover(trigger: HTMLButtonElement) {
    const popover = trigger.querySelector<HTMLElement>(".ls-chord-popover");
    const win = trigger.ownerDocument.defaultView;
    if (!popover || !win) return;

    popover.style.removeProperty("--ls-popover-shift-x");
    popover.removeClass("ls-popover-below");
    const popoverRect = popover.getBoundingClientRect();
    const placement = chordPopoverPlacement(
      trigger.getBoundingClientRect(),
      { width: popoverRect.width, height: popoverRect.height },
      { width: win.innerWidth, height: win.innerHeight }
    );
    popover.style.setProperty("--ls-popover-shift-x", `${placement.shiftX}px`);
    popover.toggleClass("ls-popover-below", placement.below);
  }
```

- [ ] **Step 4: Route every rendered chord through the coordinator**

At the beginning of `redraw()`, add:

```ts
    plugin.closeChordPopover();
```

This clears any trigger removed by `body.empty()` so the plugin never retains a detached open popover.

In `redraw()`, replace:

```ts
    for (const line of song.lines) renderLine(body, line, displayOffset, useFlats);
```

with:

```ts
    for (const line of song.lines) renderLine(plugin, body, line, displayOffset, useFlats);
```

Replace the `renderLine` signature with:

```ts
function renderLine(
  plugin: LeadsheetPlugin,
  parent: HTMLElement,
  line: SongLine,
  offset: number,
  useFlats: boolean
) {
```

Within `renderLine`, replace both calls shaped like:

```ts
renderChord(div, seg.chord, offset, useFlats)
```

with:

```ts
renderChord(plugin, div, seg.chord, offset, useFlats)
```

Replace the call shaped like:

```ts
renderChord(span, seg.chord, offset, useFlats)
```

with:

```ts
renderChord(plugin, span, seg.chord, offset, useFlats)
```

Replace the `renderChord` signature with:

```ts
function renderChord(
  plugin: LeadsheetPlugin,
  parent: HTMLElement,
  chord: string,
  offset: number,
  useFlats: boolean
) {
```

Replace the existing `click`, `blur`, and `keydown` listeners at the bottom of `renderChord` with:

```ts
  trigger.addEventListener("click", () => {
    if (!plugin.toggleChordPopover(trigger)) trigger.blur();
  });
  trigger.addEventListener("blur", () => plugin.closeChordPopover());
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    plugin.closeChordPopover(true);
    trigger.blur();
  });
```

Keep the existing `pointerenter` and `pointerleave` listeners unchanged so desktop hover dismissal still resets at the next pointer boundary.

- [ ] **Step 5: Add CSS hooks for horizontal shift and below-trigger placement**

In `.leadsheet .ls-chord-popover`, replace:

```css
  transform: translateX(-50%);
```

with:

```css
  transform: translateX(calc(-50% + var(--ls-popover-shift-x, 0px)));
```

Immediately after that rule, add:

```css
.leadsheet .ls-chord-popover.ls-popover-below {
  top: calc(100% + 0.55em);
  bottom: auto;
}
```

- [ ] **Step 6: Run automated verification**

Run:

```bash
npm test
```

Expected: TypeScript succeeds and every Node test passes.

- [ ] **Step 7: Perform the focused Obsidian smoke check**

In Obsidian Reading view, open `Leadsheet Demo.md`, narrow the content area to `320px`, and verify:

1. Tap the first chord near the left edge: the diagram remains at least `8px` inside the viewport.
2. Tap a chord near the right edge: the diagram remains at least `8px` inside the viewport.
3. Scroll a chord near the top edge and tap it: the diagram opens below the chord.
4. Tap another chord: only the new diagram remains open.
5. Tap lyrics outside the diagram: the diagram closes.
6. Focus a chord with the keyboard and press Escape: the diagram closes and does not reopen until pointer leave/enter.

Expected: all six checks pass without a console error.

- [ ] **Step 8: Commit the coordinated popover behavior**

```bash
git add src/main.ts styles.css
git commit -m "fix: keep chord popovers inside mobile viewports"
```

### Task 3: Responsive mobile controls and sticky performance access

**Files:**
- Modify: `styles.css:1-260`
- Test: manual Obsidian viewport matrix

**Interfaces:**
- Consumes: existing `.ls-toolbar`, `.ls-controls`, `.ls-mode`, `.ls-speed`, `.ls-setlist-nav`, `.leadsheet-perf`, and `.leadsheet-setlist` classes.
- Produces: responsive behavior only at viewport widths of `600px` or less; no JavaScript API or settings change.

- [ ] **Step 1: Add the narrow-screen CSS**

Append this block to `styles.css`:

```css
@media (max-width: 600px) {
  .leadsheet .ls-toolbar {
    align-items: stretch;
    gap: 0.4em;
  }

  .leadsheet .ls-titlebox {
    flex-basis: 100%;
    min-width: 0;
  }

  .leadsheet .ls-controls {
    flex-wrap: wrap;
    max-width: 100%;
  }

  .leadsheet .ls-controls button,
  .leadsheet button.ls-mode,
  .leadsheet-setlist .ls-setlist-nav button {
    min-width: 44px;
    min-height: 44px;
    padding: 8px;
  }

  .leadsheet .ls-speed {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
  }

  body.leadsheet-perf .leadsheet .ls-toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--background-primary);
  }

  .leadsheet-setlist .ls-setlist-nav {
    z-index: 3;
  }

  body.leadsheet-perf .leadsheet-setlist .leadsheet .ls-toolbar {
    top: 52px;
  }
}
```

- [ ] **Step 2: Run the build and existing regression suite**

Run:

```bash
npm test
```

Expected: every test passes and TypeScript emits no errors.

- [ ] **Step 3: Verify the responsive matrix in real Obsidian**

For `Leadsheet Demo.md`, verify widths `320px`, `390px`, `768px`, and desktop `>600px` in both light and dark themes:

1. No page-level horizontal scrollbar appears.
2. Every toolbar button is reachable and visibly focused with keyboard navigation.
3. At widths `≤600px`, measured button boxes are at least `44px × 44px`.
4. At widths `>600px`, the toolbar matches the pre-change desktop layout.
5. In performance mode at `320px`, controls remain sticky while lyrics scroll and do not cover the active lyric line after normal scrolling.

Then open a setlist at `320px` and verify Prev/Next remain visible above the sticky song toolbar, with both button boxes at least `44px` high.

Expected: all checks pass in both themes.

- [ ] **Step 4: Commit the responsive controls**

```bash
git add styles.css
git commit -m "feat: make performance controls mobile friendly"
```

### Task 4: Progressive Screen Wake Lock lifecycle

**Files:**
- Modify: `src/viewutils.ts`
- Modify: `test/viewutils.test.mjs`
- Modify: `src/main.ts:1-150`

**Interfaces:**
- Consumes: performance-mode boolean, `Document.visibilityState`, and native API availability.
- Produces: `shouldHoldWakeLock(performanceMode, visibilityState, supported): boolean`; `LeadsheetPlugin` acquires and releases one `WakeLockSentinel` from that decision.

- [ ] **Step 1: Write the failing wake-lock eligibility test**

Add `shouldHoldWakeLock` to the import in `test/viewutils.test.mjs`:

```js
import {
  clampCapo,
  scrollSpeedForDuration,
  chordPopoverPlacement,
  shouldHoldWakeLock,
} from "../viewutils.mjs";
```

Append:

```js
test("shouldHoldWakeLock requires performance mode, visibility, and support", () => {
  assert.equal(shouldHoldWakeLock(true, "visible", true), true);
  assert.equal(shouldHoldWakeLock(false, "visible", true), false);
  assert.equal(shouldHoldWakeLock(true, "hidden", true), false);
  assert.equal(shouldHoldWakeLock(true, "visible", false), false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run build && node --test test/viewutils.test.mjs
```

Expected: FAIL because `viewutils.mjs` does not export `shouldHoldWakeLock`.

- [ ] **Step 3: Add the minimal eligibility helper**

Append to `src/viewutils.ts`:

```ts
export function shouldHoldWakeLock(
  performanceMode: boolean,
  visibilityState: DocumentVisibilityState,
  supported: boolean
): boolean {
  return performanceMode && visibilityState === "visible" && supported;
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npm run build && node --test test/viewutils.test.mjs
```

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Integrate the native wake-lock lifecycle**

Add `shouldHoldWakeLock` to the `viewutils` import in `src/main.ts`:

```ts
import {
  clampCapo,
  scrollSpeedForDuration,
  chordPopoverPlacement,
  shouldHoldWakeLock,
} from "./viewutils";
```

Add these fields after `private openChordTrigger`:

```ts
  private performanceMode = false;
  private wakeLock: WakeLockSentinel | null = null;
  private wakeLockRequest: Promise<void> | null = null;
```

In `onload()`, after the `resize` registration from Task 2, add:

```ts
    this.registerDomEvent(activeDocument, "visibilitychange", () => this.syncWakeLock());
```

Replace the `toggle-performance` command callback with:

```ts
      callback: () => this.setPerformanceMode(!this.performanceMode),
```

At the beginning of `onunload()`, before removing body classes, add:

```ts
    this.performanceMode = false;
    void this.releaseWakeLock();
```

Insert these methods before `toggleChordPopover()`:

```ts
  private setPerformanceMode(active: boolean) {
    this.performanceMode = active;
    activeDocument.body.classList.toggle("leadsheet-perf", active);
    this.syncWakeLock();
  }

  private syncWakeLock() {
    const supported = "wakeLock" in activeWindow.navigator;
    if (!shouldHoldWakeLock(
      this.performanceMode,
      activeDocument.visibilityState,
      supported
    )) {
      void this.releaseWakeLock();
      return;
    }
    if (this.wakeLock || this.wakeLockRequest) return;
    this.wakeLockRequest = this.requestWakeLock().finally(() => {
      this.wakeLockRequest = null;
    });
  }

  private async requestWakeLock() {
    try {
      const sentinel = await activeWindow.navigator.wakeLock.request("screen");
      if (!shouldHoldWakeLock(
        this.performanceMode,
        activeDocument.visibilityState,
        true
      )) {
        await sentinel.release();
        return;
      }
      this.wakeLock = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.wakeLock === sentinel) this.wakeLock = null;
      }, { once: true });
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock() {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      // Native wake-lock loss and unsupported implementations are safe no-ops.
    }
  }
```

- [ ] **Step 6: Run automated verification**

Run:

```bash
npm test
```

Expected: TypeScript succeeds and every Node test passes.

- [ ] **Step 7: Verify wake-lock behavior on supported and unsupported paths**

On a device/browser that exposes `navigator.wakeLock`:

1. Enter performance mode and confirm a `screen` sentinel is acquired in the developer console.
2. Background the app and confirm the sentinel is released.
3. Return to the visible app and confirm a new sentinel is acquired.
4. Exit performance mode and confirm the sentinel is released.
5. Enter performance mode, disable the plugin, and confirm the sentinel is released and the body class is removed.

Then temporarily evaluate `delete navigator.wakeLock` in a disposable test harness or use a platform without Wake Lock, enter and exit performance mode, and confirm there is no thrown error and performance mode still hides app chrome.

Expected: supported lifecycle follows all five transitions; unsupported behavior is a silent no-op.

- [ ] **Step 8: Commit wake-lock support**

```bash
git add src/viewutils.ts test/viewutils.test.mjs src/main.ts
git commit -m "feat: keep the screen awake in performance mode"
```

### Task 5: Documentation and release-gate verification

**Files:**
- Modify: `README.md:40-70`
- Modify: `CHANGELOG.md:1-5`
- Verify: `ROADMAP.md:38-52`

**Interfaces:**
- Consumes: completed user-visible behavior from Tasks 2–4.
- Produces: accurate public documentation and evidence that the existing 0.7 exit gate is met; no manifest or package version change.

- [ ] **Step 1: Document the performance-mode behavior**

In the README toolbar description, replace the sentence ending with performance mode with:

```markdown
- **A− / A+** — grow/shrink the leadsheet font (global). *Leadsheet: Toggle
  performance mode* hides the app chrome, keeps essential controls reachable
  on mobile, and keeps the screen awake when the platform supports Screen Wake
  Lock.
```

- [ ] **Step 2: Add an unreleased changelog entry**

Immediately after `# Changelog`, add:

```markdown
## Unreleased

### Added

- Performance mode keeps the screen awake on supported platforms and safely
  falls back when Screen Wake Lock is unavailable.

### Changed

- Mobile toolbar and setlist navigation controls now use touch-sized targets
  and remain reachable during performance.
- Chord diagram popovers stay inside the viewport and close on outside tap.
```

- [ ] **Step 3: Verify from a fresh dependency state**

From `.obsidian/plugins/leadsheet`, run sequentially:

```bash
npm ci
npm test
git diff --check
git status --short
```

Expected:

- `npm ci` completes without changing `package-lock.json`.
- `npm test` reports every test passing.
- `git diff --check` prints nothing.
- `git status --short` lists only `README.md` and `CHANGELOG.md` before the documentation commit.

- [ ] **Step 4: Run the physical-device release matrix sequentially**

Use a clean Community Plugins installation of the built plugin on the latest Obsidian and repeat this exact flow on iPhone, iPad, and Android:

1. Open the starter song in Reading view.
2. Enter performance mode.
3. Transpose down, reset, and transpose up.
4. Open left-edge, center, and right-edge chord diagrams; close each with outside tap.
5. Start autoscroll, adjust speed down and up, then pause by tapping the sheet.
6. Confirm the toolbar remains reachable with no horizontal overflow.
7. Leave the device untouched longer than its normal screen timeout and confirm the screen remains awake when Wake Lock is supported.
8. Exit performance mode and confirm normal screen timeout behavior returns.
9. Open a setlist and use Prev/Next through three songs; confirm navigation remains reachable and no toolbar overlays it.

Expected: all nine checks pass on each device. Record any failure as `Bug N/M`, fix one at a time, rerun the affected device flow, and report `Bug N/M fixed.` If one failure needs more than two fix attempts, append its resolution to `FRICTION.md` before continuing.

- [ ] **Step 5: Commit documentation after the release gate passes**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document mobile rehearsal behavior"
```

- [ ] **Step 6: Confirm the feature branch is ready for review**

Run:

```bash
git status --short
git log --oneline main..HEAD
```

Expected: `git status --short` prints nothing, and the log shows the four scoped implementation commits plus the documentation commit. Do not push, merge, bump to 0.7.0, or publish without explicit authorization.
