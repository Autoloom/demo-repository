import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate } from "./format";

test("a date-only string prints as the same calendar day, wherever the viewer is", () => {
  // Anchored to IST midnight, which is the previous day in London and New York. Printed in the
  // viewer's zone it read a day early — a delivery promised for 7 July showed as 6 July.
  assert.equal(formatDate("2026-07-07"), "07 Jul 2026");
  assert.equal(formatDate("2026-01-01"), "01 Jan 2026");
  assert.equal(formatDate("2026-12-31"), "31 Dec 2026");
});

test("a full timestamp prints as the day it was on the works' calendar", () => {
  // 20:00 UTC on 7 July is 01:30 on 8 July in India.
  assert.equal(formatDate("2026-07-07T20:00:00Z"), "08 Jul 2026");
  assert.equal(formatDate("2026-07-07T05:00:00Z"), "07 Jul 2026");
});

test("bad or empty input is a dash, not an exception", () => {
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("not a date"), "—");
});
