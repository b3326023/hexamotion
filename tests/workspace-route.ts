import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspaceRoute, workspacePath } from "../lib/workspace-route";

const route = (path: string) => readWorkspaceRoute(new URL(path, "https://station.example"));
test("Legacy laboratory and shared game bookmarks resolve to the same application route", () => {
  assert.equal(workspacePath(route("/lab.html")), "/?panel=free");
  assert.equal(
    workspacePath(route("/lab.html?panel=engineering&scene=driving")),
    "/?scene=driving&panel=engineering",
  );
  for (const [panel, id] of [
    ["maze", "switchback"],
    ["challenge", "energy"],
  ]) {
    const old = route("/lab.html?" + panel + "=" + id);
    assert.equal(old.panel, panel);
    assert.deepEqual(route(workspacePath(old)), old);
  }
});
test("Scene references and the catalog can reopen on the selected scene", () => {
  const scene = route("/?scene=optics#scenarios");
  assert.equal(scene.sheet, "catalog");
  const article = { ...scene, reference: "credits:optics" as const };
  assert.deepEqual(route(workspacePath(article)), article);
  assert.equal(route("/?reference=credits:unknown").reference, null);
  assert.equal(route("/?panel=unknown&scene=unknown").scene, "manual");
});
