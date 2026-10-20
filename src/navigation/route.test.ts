import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME, parseRoute, routeUrl } from "./route.ts";

test("an empty query is the home page", () => {
  assert.deepEqual(parseRoute(""), HOME);
  assert.deepEqual(parseRoute("?song="), HOME);
  assert.deepEqual(parseRoute("?other=1"), HOME);
});

test("a song query is that song's practice page", () => {
  assert.deepEqual(parseRoute("?song=fur-elise"), {
    page: "practice",
    songId: "fur-elise",
  });
});

test("routes round-trip through their URL", () => {
  for (const songId of ["fur-elise", "user-1700000000000-ab12cd", "a b&c=d/é"]) {
    const route = { page: "practice", songId } as const;
    assert.deepEqual(parseRoute(routeUrl(route)), route);
  }
  assert.equal(routeUrl(HOME), "./");
});
