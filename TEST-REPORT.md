# Test report

Current status: **PASS** — the latest `npm run test:all` exited 0: 11 Node tests passed, the build passed, and all 74 browser entries passed (0 FAIL, 0 NOT TESTED).
Latest full run: **2026-11-07 06:20:27 UTC** (2026-11-07T06-20-27-184Z; evidence written at 08:21 local time).
During recovery, `data/stories.json` and files under `uploads/` were checked by size and modified time only. Their current metadata is recorded below; the earlier report asserted a match but did not preserve numeric baseline values for comparison.

## Stage 1 hardening recovery

The Stage 1 implementation was present in the working tree and had no matching Stage 1 commit. This recovery kept the existing work, isolated the hardening tests into a unique `.test-data` directory so their setup would not erase prior test outputs, and updated this report and `PLAN.md`.

| Requirement | State | Code and evidence |
|---|---|---|
| Fail-closed story store, validation, atomic writes, rotating backups | Complete | `server/index.js`; backup, corruption, missing-store, and atomic-write checks in `test/hardening.test.js` |
| Per-IP write limit, per-owner cap, total upload cap, streamed disk uploads | Complete | `server/index.js`; upload uses Multer disk storage with a per-file limit and disk total cap; exercised in `test/hardening.test.js` |
| Proxy trust off by default | Complete | `STORY_TRUST_PROXY` is opt-in; default and enabled configurations are tested |
| Security headers and CSP checked with recorder and playback | Complete | Header assertions in the browser run; recorder preview and synthetic playback passed without CSP violations |
| Generic client errors and self-reported checked label | Complete | Safe error tests and the checked-label browser assertion passed |
| Tests and 390/1280 px screenshots of changed text | Complete | 11 Node tests and 74 browser entries passed; checked-label screenshots were opened and visually inspected at both widths |

Final full run: build **PASS**; Node **11 passed, 0 failed, 0 skipped**; browser **74 PASS, 0 FAIL, 0 NOT TESTED**. Evidence: [results.json](test-evidence/2026-11-07T06-20-27-184Z/results.json). The checked-label screenshots are [390 px](test-evidence/2026-11-07T06-20-27-184Z/review-checked-self-reported-390-bottom.png) and [1280 px](test-evidence/2026-11-07T06-20-27-184Z/review-checked-self-reported-1280.png). They are fresh relative to the last source edits and were visually inspected.

Real-data metadata at recovery close: `data/stories.json` is 3,549 bytes, modified 2026-11-07 05:49:20 local. Three upload files have sizes/times 465,908 bytes at 02:37:01, 156,788 bytes at 05:44:38, and 156,788 bytes at 05:49:20 local. Their contents were not opened or changed. No earlier numeric baseline was available to make an exact comparison.

Limitations: write-rate counters are in memory and per process; the upload disk-cap check is not a cross-process reservation; browser playback verified decode and timeline progress, not audible output. This proof of concept is not production-ready. A subsequent standalone test invocation was blocked before tests started by sandbox `spawn EPERM`; the complete test suite had already passed in the final full run.

## Correctness follow-up

### 1. Review keeps unsaved edits

Approve and Save as draft now send pending original text and translation edits in the same update request. The existing per-field save buttons remain available and save all pending Review edits; a changed translation still invalidates its checked label. A simulated server error left the story in Review, displayed the error, and left the draft unchanged; retry saved and published exactly the text and translation shown. **PASS.**

### 2. Withdrawn state and re-approval

My stories now labels withdrawn entries as Withdrawn and requires an inline confirmation before withdrawal. Cancel keeps public access; confirming withdrawal removes story and audio access for B. For a withdrawn story, public visibility shows Publish again and says the story will become public again; Only me shows Approve for only me and says approval will keep it private. Re-approval restores public access only when the selected visibility is public. The confirmation explains that the story remains in My stories and downloaded copies are not deleted. **PASS.**

### 3. Seed safety

Before this change, scripts/seed.js unconditionally replaced stories.json with two placeholder stories; it already honored STORY_DATA_DIR. It now prints the resolved target and refuses to overwrite a non-empty, invalid, or unreadable target without --force. The guard and explicit overwrite were exercised only against a synthetic directory under .test-data; the real data directory was never targeted. **PASS.**

### 4. Production start

package.json now has start and Node 24.x engines entries, mirrored in package-lock.json without dependency changes. npm start runs server/start.js, which sets production mode inside Node and loads the existing server. In production mode the existing server serves dist/ and its assets. Default host remains 127.0.0.1 and default port is 3000; HOST and PORT change them. I left the loopback default unchanged because it suits a local default and no hosting setup was requested. The isolated server test started on port 4348 and fetched the built index and an asset. **PASS.**

### 5. Test results

| Check | Result | Evidence |
|---|---|---|
| npm test | **PASS** — 6 passed, 0 failed, 0 skipped | [_tmp test log](_tmp/test-all-correctness-b35d31d620644802a5c9a797335a0ab3.log) |
| Browser suite | **PASS** — 71 PASS, 0 FAIL, 0 NOT TESTED | [results.json](test-evidence/2026-11-07T04-14-52-696Z/results.json) |
| npm run build | **PASS** | [_tmp test log](_tmp/test-all-correctness-b35d31d620644802a5c9a797335a0ab3.log) |
| npm run test:all | **PASS** — exit code 0 | [results.json](test-evidence/2026-11-07T04-14-52-696Z/results.json) |

The browser run used isolated owner/visitor contexts and data/uploads under .test-data, with ports 4347/4348. It covered draft edits, approval edits, failed-save retention and retry, public API/UI values, withdrawal confirmation and cancellation, Withdrawn status, visibility-specific re-approval wording, and public restoration. The seed test used only its synthetic .test-data directory. No dependencies were installed. The already-running app servers on 5173/3000 remained up; isolated test servers were stopped after tests.

### Visual review

I opened and inspected the 390 px and 1280 px screenshots. The withdrawal message wraps clearly and both confirmation controls are reachable. The public re-approval explanation and Publish again action are visible and reachable at both widths. I observed no overlap or clipping in these changed states.

| State | 390 px | 1280 px |
|---|---|---|
| Withdraw confirmation | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/withdraw-confirm-390.png) | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/withdraw-confirm-1280.png) |
| Re-approval wording and visibility | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/republish-review-390-bottom.png) | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/republish-review-1280.png) |
| Publish again action reachable | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/republish-action-390.png) | [screenshot](test-evidence/2026-11-07T04-14-52-696Z/republish-action-1280.png) |

### Real-data metadata check

Before tests I recorded only file size and last-modified time for the real story file and the three existing uploads. After the full suite, the story file metadata matched and all 3/3 upload metadata records matched; filenames, contents, and owner tokens were not printed. Tests and seed execution wrote only to isolated .test-data paths.

### Files touched

- src/App.jsx — save pending Review edits with approve/draft; withdrawn status, visibility-aware re-approval, and withdrawal confirmation.
- scripts/run-browser-tests.js — browser tests for unsaved Review edits, failed-save retry, withdrawal/re-approval, and screenshots.
- scripts/seed.js — target reporting and overwrite guard.
- test/server.test.js — isolated seed-guard and production-start tests.
- server/start.js — cross-platform production-mode entry point.
- package.json and package-lock.json — start script and Node 24.x engine.
- TEST-REPORT.md — this report.

I did not change README attribution, the logo, server host defaults, real data, or uploads. I did not add dependencies, features, deployment setup, accounts, or hosting configuration. The compact approved logo still looks small at 390 px; it was left unchanged per scope.

### Rerun

From the project root, run this single PowerShell command:

    $buildId=[guid]::NewGuid().ToString('N'); $env:TEMP=Join-Path (Get-Location) '_tmp'; $env:TMP=Join-Path (Get-Location) '_tmp'; $env:npm_config_cache=Join-Path (Get-Location) '_npm-cache'; $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path (Get-Location) '.test-data\playwright-browsers'; $env:TEST_API_PORT='4348'; $env:TEST_WEB_PORT='4347'; $env:RECORDER_PREVIEW_ONLY='0'; $env:STORY_BRIDGE_BUILD_DIR=Join-Path (Get-Location) ('.test-data\correctness-build-' + $buildId); npm run test:all

## History
### Recorder-preview and logo follow-ups from earlier tasks
Historical status of the recorder-preview follow-up: **PASS** as of 2026-11-07 03:21:55 UTC; superseded by the correctness follow-up above.
Earlier latest full run: **2026-11-07 03:21:55 UTC** (2026-11-07T03-21-55-747Z).
That earlier report status has since been superseded.

#### Recorder-preview diagnosis from the prior follow-up

**Diagnosis: (b) the playback test was racy for headless Chromium.** The old test called play(), waited exactly 250 ms, then sampled currentTime once. The two historical failures reported the assertion “Chromium advertised support for the captured recording but playback did not advance (no progress).” Their results.json files do not store currentTime before/after, duration, readyState, paused, ended, media error, or play-promise status; the failure screenshots show the control at 0:00 / 0:01, so those missing historical values cannot be reconstructed. This is not evidence that the logo affected playback.

| Focused run | Capture | Result and observed playback |
|---|---:|---|
| 2026-11-07T03-12-06-607Z | 1-second fake capture | PASS: currentTime 0 → 0.017577 s; duration 1.56 s; readyState 4 → 4; paused true → false during play → true after cleanup; ended false throughout; no media error; play() resolved. |
| 2026-11-07T03-12-19-556Z | 1-second fake capture | PASS: 0 → 0.028699 s; duration 1.56 s; readyState 4 → 4; paused true → false → true; ended false; no media error; play() resolved. |
| 2026-11-07T03-12-30-649Z | 1-second fake capture | PASS: 0 → 0.049557 s; duration 1.50 s; readyState 4 → 4; paused true → false → true; ended false; no media error; play() resolved. |
| 2026-11-07T03-13-13-644Z | 3-second fake capture | PASS: 0 → 0.033730 s; duration 3.54 s; readyState 4 → 4; paused true → false → true; ended false; no media error; play() resolved. |
| 2026-11-07T03-15-34-271Z | 1-second fake capture after fix | PASS: 0 → 0.006624 s; duration 1.56 s; readyState 4; paused true → false → true; ended false; no media error; play() resolved; progress observed after 208 ms. |
| 2026-11-07T03-15-45-740Z | 1-second fake capture after fix | PASS: 0 → 0.002389 s; duration 1.50 s; readyState 4; paused true → false → true; ended false; no media error; play() resolved; progress observed after 186 ms. |
| 2026-11-07T03-15-56-729Z | 1-second fake capture after fix | PASS: 0 → 0.004636 s; duration 1.50 s; readyState 4; paused true → false → true; ended false; no media error; play() resolved; progress observed after 188 ms. |

The longer clip did not change the result: it also passed the original single 250 ms sample. All three pre-fix short-clip reruns also passed, showing the failure was intermittent rather than a consistent broken preview. The current full run further confirmed a valid blob URL and successful fetch, canPlayType: maybe, play() resolved, currentTime 0 → 0.018964 s, duration 1.62 s, readyState 4 → 4, paused true → false → true, ended false, no media error, and progress after 303 ms. Together, the intermittent 250 ms failures and later progress beyond 250 ms support a headless playback-start timing race, not a revoked URL or remounted preview. The logo/header only changes page chrome; no evidence connected it to the audio element, so category (c) is unsupported.

#### Fix

Only scripts/run-browser-tests.js changed for the playback fix. It now polls every 25 ms for up to 2 seconds, stopping early on playback progress, end-of-media, or media error, and still requires currentTime to advance. This gives headless Chromium time to start its media clock; a rejected play, media error, invalid metadata/blob, or timeline that never advances still fails, so the change does not mask an unplayable preview. The app playback implementation was not changed.

#### Latest full-suite results

| Test | Result | Evidence |
|---|---|---|
| npm test | PASS — 4 passed, 0 failed | [full-run log](_tmp/npm-test-all-recorder-fix-final-20261107-052151019.log) |
| Browser suite | PASS — 63 passed, 0 failed, 0 NOT TESTED | [results.json](test-evidence/2026-11-07T03-21-55-747Z/results.json) |
| npm run build | PASS | [full-run log](_tmp/npm-test-all-recorder-fix-final-20261107-052151019.log) |
| npm run test:all | PASS — exit code 0 | [results.json](test-evidence/2026-11-07T03-21-55-747Z/results.json) |

The test servers used separate ports 4347/4348; the existing application servers on 5173/3000 remained listening.

#### Visual review

I inspected the captured-unsaved preview (including duration and file size), saved state, and header at both viewport widths. No content, text, or controls overlap, and none are clipped in the normal view; the saved confirmation is visible at both sizes. The 390 px compact approved logo appears as a small mark because its square SVG canvas contains substantial empty space; it does not overlap or clip page content, and no logo asset or styling was changed in this playback-only follow-up.

| View | 390 px | 1280 px |
|---|---|---|
| Captured-unsaved preview, top | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-captured-unsaved-390.png) | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-captured-unsaved-1280.png) |
| Captured-unsaved duration and size | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-captured-unsaved-390-bottom.png) | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-captured-unsaved-1280-bottom.png) |
| Saved with story | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-saved-with-story-390.png) | [screenshot](test-evidence/2026-11-07T03-21-55-747Z/record-saved-with-story-1280.png) |
| Header logo | [Listen screenshot](test-evidence/2026-11-07T03-21-55-747Z/listen-public-390.png) | [Listen screenshot](test-evidence/2026-11-07T03-21-55-747Z/listen-public-1280.png) |

#### Protected real-data verification

The real story metadata and existing uploads were compared by SHA-256 against both saved pre-test baselines after the latest run. Each baseline recorded two protected files; both matched, with zero changed or missing files. Hashes, filenames, story contents, and owner tokens are not reproduced here.

#### Files changed in this follow-up

- scripts/run-browser-tests.js — bounded playback-progress polling and non-secret diagnostic fields for the preview assertion; capture length and focused-check controls support repeatable diagnosis.
- TEST-REPORT.md — current result, diagnosis, evidence, and historical-run labeling.
- Screenshots and isolated test data were written under test-evidence/ and .test-data/ respectively; they are ignored local test artifacts, not staged project files.

#### Remaining manual checks

- Real microphone and operating-system permission behavior for the revised experience: **NOT TESTED**. The project owner previously reported a real laptop recording played audibly; this agent did not independently verify that or the revised feedback.
- Physical phone and device compatibility: **NOT TESTED**.
- Audible output on hardware during this follow-up: **NOT TESTED**.
- Favicon in actual browser chrome: **NOT TESTED**; screenshots show page content and the logo, not browser chrome.

#### Rerun

From the project root, run this single PowerShell command:

    $buildId=[guid]::NewGuid().ToString('N'); $env:TEMP=Join-Path (Get-Location) '_tmp'; $env:TMP=Join-Path (Get-Location) '_tmp'; $env:npm_config_cache=Join-Path (Get-Location) '_npm-cache'; $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path (Get-Location) '.test-data\playwright-browsers'; $env:TEST_API_PORT='4348'; $env:TEST_WEB_PORT='4347'; $env:STORY_BRIDGE_BUILD_DIR=Join-Path (Get-Location) ('.test-data\build-' + $buildId); npm run test:all

#### Older run details from the preceding report
#### Recorder run — 2026-11-07 01:27 UTC (historical; no longer current)

Historical result: **PASS** — recorder run 2026-11-07 01:27 UTC; no longer current. `npm run test:all` exited successfully: 4 Node tests passed, all 63 browser result entries passed, and the Vite production build completed.

Playwright used separate isolated browser contexts for owner A, unrelated visitor B, a fake-microphone owner, and a browser without MediaRecorder. Its test API and Vite servers used ports 4318 and 4317. This run's database, uploads, fixtures, and screenshots are under `.test-data/runs/2026-11-07T01-27-16-766Z/` and `test-evidence/2026-11-07T01-27-16-766Z/`. Unit tests used `.test-data/unit-test-data/`. They did not seed or write to the real `data/` or `uploads/` folders.

All test commands used `_tmp`, `_npm-cache`, and `.test-data/playwright-browsers` inside the project. No deployment, paid service, account, runtime third-party API, personal browser profile, or extension was used. Playwright 1.65.0 and Chromium revision 1254 were already installed locally from the preceding test setup; nothing was installed for this recording-feedback follow-up.

#### Results from the 01:27 recorder run

| Test | Result | Evidence or notes |
|---|---|---|
| Listen, Share, and My stories render at 1280px and 390px | PASS | Screenshots for Listen, Share, and My stories are in the run directory; automated layout checks covered each viewport. |
| Layout clipping, overlap, small text, and hidden controls | PASS | All screenshot checks reported no horizontal overflow, clipped controls, text under 12px, or overlap between main content and bottom navigation. I visually inspected recording, error, save-failure, and saved states at both widths; the lower-scroll images show duration, file size, retake/remove, and save controls. |
| Ready, waiting, recording timer, stopping, and captured-unsaved states | PASS | Accessible status text was checked. Timer updates are separate from the polite live status; elapsed time advanced without changing the status text. Save and upload controls were disabled while waiting, recording, and stopping. |
| Captured preview, duration, size, and playback | PASS | Fake-mic audio produced non-empty metadata with a duration, file size, and a playable preview whose Chromium media timeline advanced. A 0.5-second fixture displayed `0:00.5`. |
| Actual MediaRecorder MIME and server acceptance | PASS | Chromium reported `audio/webm;codecs=opus`; the app submitted the accepted `audio/webm` container type and the isolated server saved and served it. A simulated incompatible `video/webm` recorder result was rejected with a clear error. The server MIME rule was not broadened. |
| Denied permission, unavailable device, unsupported recorder | PASS | Permission denial and missing device were simulated with browser API errors; MediaRecorder absence and incompatible format were also exercised. These are simulations, not operating-system permission or hardware checks. |
| Empty and failed recordings; track cleanup | PASS | A test recorder emitted no data and another raised a synthetic microphone-read error; neither was reported as captured audio. Tracks stopped after stop, error, and component unmount during navigation. |
| Retake, cancellation, replacement, removal, and object URLs | PASS | Cancel preserved the current preview; denial/unavailable-device errors preserved it; successful retake replaced it only after completion. Remove required confirmation. Old blob URLs stopped resolving only after replacement/removal. |
| Save failure and retry | PASS | A simulated HTTP 500 kept the captured preview available and did not show “Saved with your story.” Retry succeeded against the isolated server; the saved status appeared only after its successful response. Saved review exposed no recording delete/replacement controls. |
| Navigation warnings and cleanup | PASS | In-app navigation warnings were checked for active and captured unsaved audio; cancel retained the preview. The beforeunload handler's cancellation signal was exercised. |
| Invalid and oversized uploads | PASS | Client rejected a text file and an audio file over 10 MB. Existing API tests also rejected non-audio MIME and uploads over 10 MB. |
| Draft privacy and owner editing | PASS | A created a draft; B could not list or read it directly; A reopened and edited it. Only-me visibility remained private, and B's direct read/edit/check/publish/withdraw requests were denied. |
| Public visibility, hidden author, and withdrawal | PASS | B saw an approved public story/audio. Hidden author name was absent from non-owner JSON and UI. Withdrawal removed it from lists and denied story/audio requests. Previously downloaded copies are not erased. |
| Original text, manual translation, review label | PASS | Text and translation persisted. The unchecked label was honest; editing a checked translation invalidated its prior checked state. Script-like story text remained inert. |
| Empty and excessive text; reload/restart persistence | PASS | Empty language and 12,001-character text were rejected. Isolated owner A's test story survived page reload and isolated API restart. The fake-microphone owner C's save was verified through API/audio access but was not separately restarted. |
| Owner token leakage | PASS | Generated owner tokens were absent from recorded URLs, responses, logs, screenshots, and visible UI. |
| `npm test` | PASS | 4 tests passed, 0 failed. |
| `npm run build` | PASS | Vite production build completed. |

#### Recording screenshots

Each state has top and lower-scroll screenshots at 390px and 1280px. The per-run `results.json` contains all outcomes and measured layout metrics.

| State | 390px | 1280px |
|---|---|---|
| Ready | [top](test-evidence/2026-11-07T01-27-16-766Z/record-ready-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-ready-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-ready-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-ready-1280-bottom.png) |
| Waiting for permission | [top](test-evidence/2026-11-07T01-27-16-766Z/record-waiting-permission-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-waiting-permission-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-waiting-permission-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-waiting-permission-1280-bottom.png) |
| Recording | [top](test-evidence/2026-11-07T01-27-16-766Z/record-active-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-active-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-active-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-active-1280-bottom.png) |
| Stopping | [top](test-evidence/2026-11-07T01-27-16-766Z/record-stopping-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-stopping-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-stopping-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-stopping-1280-bottom.png) |
| Captured, unsaved | [top](test-evidence/2026-11-07T01-27-16-766Z/record-captured-unsaved-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-captured-unsaved-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-captured-unsaved-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-captured-unsaved-1280-bottom.png) |
| Permission denied | [top](test-evidence/2026-11-07T01-27-16-766Z/record-permission-denied-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-permission-denied-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-permission-denied-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-permission-denied-1280-bottom.png) |
| Unsupported format | [top](test-evidence/2026-11-07T01-27-16-766Z/record-unsupported-format-390.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-unsupported-format-390-bottom.png) | [top](test-evidence/2026-11-07T01-27-16-766Z/record-unsupported-format-1280.png) · [lower](test-evidence/2026-11-07T01-27-16-766Z/record-unsupported-format-1280-bottom.png) |
| Save failed / saved | [failed](test-evidence/2026-11-07T01-27-16-766Z/record-save-failed-390.png) · [saved](test-evidence/2026-11-07T01-27-16-766Z/record-saved-with-story-390.png) | [failed](test-evidence/2026-11-07T01-27-16-766Z/record-save-failed-1280.png) · [saved](test-evidence/2026-11-07T01-27-16-766Z/record-saved-with-story-1280.png) |

Additional evidence covers empty/failed recordings, unavailable device, unsupported browser, invalid file, oversized file, and successful retake. See [results.json](test-evidence/2026-11-07T01-27-16-766Z/results.json).

#### Real-data hash comparison

Hashes were recorded before the isolated tests and recomputed afterward. Names and contents were not read into the report.

| Protected data | Comparison | Result |
|---|---|---|
| Story metadata store | Before/after SHA-256 matched; exact digest retained only in ignored local scratch data. | Unchanged |
| Existing uploaded recording(s) | Before/after SHA-256 matched; filenames and exact digests are omitted from project documentation. | Unchanged |

#### Failures and fixes during this follow-up

The first browser iteration preserved `failure-19.png` under `test-evidence/2026-11-07T01-00-47-586Z/`. The app surfaced the expected simulated microphone-read error, but the test harness timed out waiting for a transient “Recording” state before the error. I changed the test to wait for the failure state and reran it. At the time of the recording-work report, its final run had no FAIL or NOT TESTED browser entries; the later logo follow-up test results below supersede that status.

#### Files changed

- `src/RecordingCapture.jsx`: accessible states/timer, MIME validation, preview metadata, retry/retake/remove confirmation, size checks, track/timer/object-URL cleanup.
- `src/App.jsx`, `src/main.jsx`, `src/recording.css`: save success/failure messaging, action locking, navigation warnings, and recording panel styles.
- `scripts/run-browser-tests.js`: fake-microphone, unsupported/error modes, save retry, upload limits, cleanup, MIME, viewport screenshots, and evidence checks.
- `README.md`, `PLAN.md`, `REVIEW.md`, and `TEST-REPORT.md`: workflow, limitations, and results.
- The build regenerated ignored `dist/` output. No server upload or privacy rules were changed.

#### Remaining manual checks

- The project owner confirmed a real laptop recording played audibly. Codex did not witness the recording or playback; repeatability with the revised feedback remains **NOT TESTED**. Operating-system permission denial and unavailable-device behavior were simulated only.
- Physical phone microphone, secure-context behavior, and on-device layout: **NOT TESTED**; 390px checks were desktop Chromium emulation.
- The project owner confirmed their real laptop recording played audibly. Codex did not witness that manual check; output through other devices/headphones was not separately confirmed.
- The browser's native beforeunload dialog appearance and wording were not manually inspected; the cancellation event and in-app confirmation behavior were tested.
- A long real recording reaching the 10 MB recording-size cap was not made; synthetic oversized uploads and server/client file-size enforcement were tested.

#### Rerun

Run this single PowerShell command from the project root:

    $buildId=[guid]::NewGuid().ToString('N'); $env:TEMP=Join-Path (Get-Location) '_tmp'; $env:TMP=Join-Path (Get-Location) '_tmp'; $env:npm_config_cache=Join-Path (Get-Location) '_npm-cache'; $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path (Get-Location) '.test-data\playwright-browsers'; $env:STORY_BRIDGE_BUILD_DIR=Join-Path (Get-Location) ('.test-data\build-' + $buildId); npm run test:all

The existing app remains running locally at `http://127.0.0.1:5173` with its API on port 3000. Isolated test servers on 4317/4318 were stopped after the suite.

#### Logo integration follow-up — historical

The six supplied SVG sections were copied verbatim to `public/assets/logo/`, the Vite-served public directory. Before wiring the favicon, a separate Vite server returned `/assets/logo/story-bridge-icon.svg` with HTTP 200 and `Content-Type: image/svg+xml`. The shared `index.html` head now references that path. The existing app header uses the horizontal reverse lockup on green, swaps to the reverse mark at 390px, keeps `alt="Story Bridge"` and an accessible header label, and preserves navigation order. The `<img>` box is 40px high; no CSS recoloring is applied.

No dependencies or browser binaries were installed for this follow-up; visual checks used the project-local Playwright setup already present in the workspace.

##### Logo visual review

**PASS — 12/12 visual checks.** Listen, Share, Review, My stories, and story detail were opened in isolated Chromium contexts at 1280px and 390px; the SVG favicon was also loaded and previewed at both viewport widths. Compact mode selected `story-bridge-mark-reverse.svg` at 390px, and wide mode selected `story-bridge-lockup-horizontal-reverse.svg` at 1280px. All screenshots and measured checks report matching document/viewport widths, no clipped controls, no tiny text, the original navigation order, the green header, and the expected 40px image height. I inspected the page and icon screenshots for text legibility, contrast, clipping, and overlap; none was observed. The favicon screenshots are page previews of the SVG; browser chrome itself is outside the captured viewport.

| View | 1280px evidence | 390px evidence |
|---|---|---|
| Listen | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-listen-1280.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-listen-390.png) |
| Share | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-share-1280.png) · [lower form](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-share-1280-bottom.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-share-390.png) · [lower form](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-share-390-bottom.png) |
| Review | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-review-1280.png) · [lower form](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-review-1280-bottom.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-review-390.png) · [lower form](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-review-390-bottom.png) |
| My stories | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-my-stories-1280.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-my-stories-390.png) |
| Story detail | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-detail-1280.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/logo-detail-390.png) |
| Favicon SVG preview | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/favicon-preview-1280.png) | [screenshot](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/favicon-preview-390.png) |

Machine-readable visual results: [results.json](test-evidence/logo-integration/2026-11-07T02-31-48-223Z/results.json). The fixture story and uploads were confined to `.test-data/logo-visual/2026-11-07T02-31-48-223Z/`; those runs did not write to real stories or uploads.

##### Test results after logo integration

| Check | Result | Evidence / notes |
|---|---|---|
| `npm run test:all` — `2026-11-07T02-25-23-614Z` | **FAIL** | 38 browser checks passed, 1 failed, 2 were not tested; Node unit tests passed. The fake-media recording test failed because Chromium advertised recording support but the captured preview playback timeline did not advance. Dependent retake/error and save-retry checks were marked NOT TESTED. |
| `npm run test:all` — `2026-11-07T02-26-22-141Z` | **FAIL** | Same result and assertion on an unchanged rerun. Logs/screenshots and isolated data are under [first run](test-evidence/2026-11-07T02-25-23-614Z/results.json) and [second run](test-evidence/2026-11-07T02-26-22-141Z/results.json). Independent privacy, API, and persistence checks continued and passed. No tests were weakened or edited, and no snapshots were updated. |
| `npm run test:all` — `2026-11-07T02-50-23-084Z` | **FAIL** | Commit-preparation rerun: 4 Node tests passed; 38 browser checks passed, 1 failed, and 2 were not tested. The same fake-preview playback assertion recurred; independent API/privacy/persistence checks passed. Evidence: [results.json](test-evidence/2026-11-07T02-50-23-084Z/results.json). |
| `npm run build` | **PASS** | Vite build completed independently after the suite stopped at its browser failure; output went to a unique ignored `.test-data` directory to preserve existing `dist/` files. |

##### Files changed in the logo follow-up

- `index.html` — SVG favicon link.
- `src/App.jsx` — responsive existing header logo and accessible label.
- `src/styles.css` — logo sizing and width constraints.
- `public/assets/logo/story-bridge-icon.svg`, `story-bridge-mark.svg`, `story-bridge-mark-reverse.svg`, `story-bridge-lockup.svg`, `story-bridge-lockup-horizontal.svg`, and `story-bridge-lockup-horizontal-reverse.svg` — approved assets copied verbatim.
- `TEST-REPORT.md` and `test-evidence/logo-integration/2026-11-07T02-31-48-223Z/` — requested report and visual evidence. No test source, API, privacy code, stories, uploads, or snapshots were changed. The Vite build refreshed ignored `dist/` output.

##### Final real-data hash comparison

The hashes recorded before this logo follow-up match the final content hashes after the test runs and visual review. File names and content are recorded here without exposing story contents or owner tokens.

| Protected data | Comparison | Result |
|---|---|---|
| Story metadata store and existing uploaded recording(s) | Before/after content hashes matched; exact digests and filenames are retained locally, not published in project documentation. | Unchanged |

##### Remaining manual checks

- Verify the favicon in actual browser chrome; screenshots capture the loaded favicon asset in the page viewport, not browser chrome.
- The project owner confirmed an earlier real laptop recording played audibly; this was not independently witnessed. Confirmation of the revised recording-feedback experience, OS permission behavior, device-specific formats, and physical-phone behavior remains outstanding.
- The recording browser suite has one reproducible fake-media playback failure, so its dependent retake, permission/device error, and save-failure/retry scenarios remain **NOT TESTED** in these three follow-up runs.

##### Rerun

From the project root, run:

    $buildId=[guid]::NewGuid().ToString('N'); $env:TEMP=Join-Path (Get-Location) '_tmp'; $env:TMP=Join-Path (Get-Location) '_tmp'; $env:npm_config_cache=Join-Path (Get-Location) '_npm-cache'; $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path (Get-Location) '.test-data\playwright-browsers'; $env:STORY_BRIDGE_BUILD_DIR=Join-Path (Get-Location) ('.test-data\build-' + $buildId); npm run test:all

The isolated logo visual server on ports 4330/4331 was stopped after capture. The existing app remains running locally on ports 5173 and 3000.

#### Local Git preparation audit

This project had no Git repository, commits, remotes, or staged changes before preparation. A new repository was initialized at this project root on branch `main`; no global or local commit identity values were changed. The configured identity was present. Because no remote existed, `origin` was set locally to the owner's stated intended URL. No network operation was performed.

The expanded ignore rules were verified with `git check-ignore` for story data, uploaded recordings, `.test-data`, `test-evidence`, dependencies, build output, temporary/cache folders, browser downloads, environment files, secrets, and logs. The proposed tracked files had no findings for machine-specific absolute paths, email addresses, common API credential patterns, JWTs, long token/hash strings, or UUIDs after cleanup. Source-based fictional seed fixtures and `package-lock.json` remain included. No licence was added.

The previous generated report contained an existing upload identifier, exact private-data hashes, and absolute machine paths. Those stale identifying details were removed from documentation; the ignored local hash record remains available. Project documentation now attributes the concept and instructions to the project owner and the visible implementation and iterations to Codex. It states that translation-check labels are self-reported and documents the browser-local owner-token access limitation. The project owner confirmed a real recording played audibly on their laptop; Codex did not witness that manual check. The revised recording-feedback experience and physical-phone behavior still need the owner's confirmation.

For commit preparation, `npm run test:all` used the existing isolated unit and browser data paths under `.test-data`, its per-run browser services and screenshots remained isolated, and two real-data files' before/after content hashes matched. The test run failed at the fake-preview playback assertion described above, so two dependent browser checks were NOT TESTED. The production build passed separately in a unique ignored `.test-data` directory, preserving all existing files in `dist/`.

No local commit was made because the full test suite did not pass. No push or other network operation was performed.
