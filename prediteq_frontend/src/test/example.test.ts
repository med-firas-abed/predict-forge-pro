import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn() utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("deduplicates tailwind classes via twMerge", () => {
    expect(cn("px-4", "px-6")).toBe("px-6");
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
