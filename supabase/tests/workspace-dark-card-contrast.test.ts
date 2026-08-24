import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("workspace dark card contrast", () => {
  test("keeps template card text light on dark card backgrounds", () => {
    const css = readFileSync("src/workspace-contrast.css", "utf8");
    expect(css).toContain(".workspace-glass .db-tcard .text-foreground");
    expect(css).toContain("color: #fffdf9 !important;");
    expect(css).toContain(".workspace-glass .db-tcard .text-muted-foreground");
    expect(css).toContain("color: #e7dfd5 !important;");
  });
});
