const { test } = require("node:test");
const assert = require("node:assert/strict");
const { markActivitySeen } = require("../electron/activity.cjs");
const { importData } = require("../electron/core.cjs");
test("read markers target project and event snapshots without marking later arrivals", () => {
  const projects = [
    {
      id: "a",
      events: [
        { id: "same", seen: false },
        { id: "later", seen: false },
      ],
    },
    { id: "b", events: [{ id: "same", seen: false }] },
  ];
  const changed = markActivitySeen(projects, [
    { projectId: "a", eventIds: ["same"] },
  ]);
  assert.equal(changed.length, 1);
  assert.equal(projects[0].events[0].seen, true);
  assert.equal(projects[0].events[1].seen, false);
  assert.equal(projects[1].events[0].seen, false);
  assert.deepEqual(
    markActivitySeen(projects, [{ projectId: "a", eventIds: ["same"] }]),
    [],
  );
});
test("invalid or oversized activity payloads fail before making changes", () => {
  const projects = [{ id: "a", events: [{ id: "event", seen: false }] }];
  for (const groups of [
    null,
    [
      { projectId: "a", eventIds: ["event"] },
      { projectId: "b", eventIds: null },
    ],
    [{ projectId: "a", eventIds: Array(101).fill("event") }],
    Array(1001).fill({ projectId: "a", eventIds: [] }),
  ])
    assert.throws(() => markActivitySeen(projects, groups), /Invalid activity/);
  assert.equal(projects[0].events[0].seen, false);
});
test("activity import preserves explicit unread markers and treats legacy history as seen", () => {
  const [p] = importData({
    version: 1,
    projects: [
      {
        id: "one",
        name: "History",
        url: "https://example.com",
        events: [
          { id: "read", text: "read", at: "2026-11-01T00:00:00Z", seen: true },
          {
            id: "unread",
            text: "unread",
            at: "2026-11-02T00:00:00Z",
            seen: false,
          },
          { id: "legacy", text: "legacy", at: "2025-01-01T00:00:00Z" },
        ],
      },
    ],
  });
  assert.deepEqual(
    p.events.map((e) => e.seen),
    [true, false, true],
  );
});
