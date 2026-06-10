import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCSV, downloadCSV } from "@/lib/export";

describe("buildCSV", () => {
  it("produces a header row followed by data rows", () => {
    const csv = buildCSV(["Name", "Score"], [["Alice", 90], ["Bob", 75]]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Name,Score");
    expect(lines[1]).toBe("Alice,90");
    expect(lines[2]).toBe("Bob,75");
  });

  it("uses CRLF as the row separator", () => {
    const csv = buildCSV(["A"], [["1"], ["2"]]);
    expect(csv).toContain("\r\n");
    expect(csv.split("\r\n").length).toBe(3);
  });

  it("escapes values containing commas with double-quotes", () => {
    const csv = buildCSV(["Name"], [["Smith, John"]]);
    expect(csv).toContain('"Smith, John"');
  });

  it("escapes values containing double-quotes by doubling them", () => {
    const csv = buildCSV(["Quote"], [[`say "hi"`]]);
    expect(csv).toContain('"say ""hi"""');
  });

  it("escapes values containing newlines", () => {
    const csv = buildCSV(["Text"], [["line1\nline2"]]);
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null as an empty string", () => {
    const csv = buildCSV(["A", "B"], [[null, "x"]]);
    expect(csv.split("\r\n")[1]).toBe(",x");
  });

  it("renders undefined as an empty string", () => {
    const csv = buildCSV(["A"], [[undefined]]);
    expect(csv.split("\r\n")[1]).toBe("");
  });

  it("renders numbers correctly including zero and negatives", () => {
    const csv = buildCSV(["Score"], [[100], [0], [-5]]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("100");
    expect(lines[2]).toBe("0");
    expect(lines[3]).toBe("-5");
  });

  it("handles an empty rows array (headers only)", () => {
    const csv = buildCSV(["A", "B"], []);
    expect(csv).toBe("A,B");
  });

  it("does not quote plain string values", () => {
    const csv = buildCSV(["Name"], [["Alice"]]);
    expect(csv.split("\r\n")[1]).toBe("Alice");
  });

  it("handles a single-character comma value", () => {
    const csv = buildCSV(["X"], [[","]]);
    expect(csv.split("\r\n")[1]).toBe('","');
  });

  it("handles a bare double-quote character", () => {
    const csv = buildCSV(["X"], [['"']]);
    expect(csv.split("\r\n")[1]).toBe('""""');
  });
});

describe("downloadCSV", () => {
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clickSpy = vi.fn();

    globalThis.URL = {
      createObjectURL: vi.fn().mockReturnValue("blob:mock"),
      revokeObjectURL: vi.fn(),
    } as any;

    vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
    vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") return { href: "", download: "", click: clickSpy } as any;
      return document.createElement.call(document, tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers a click to download the file", () => {
    downloadCSV("report", "A,B\r\n1,2");
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("revokes the object URL after download", () => {
    downloadCSV("report", "");
    expect((globalThis.URL as any).revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("appends .csv when the filename has no extension", () => {
    let saved = "";
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") {
        return {
          href: "",
          get download() { return saved; },
          set download(v: string) { saved = v; },
          click: clickSpy,
        } as any;
      }
      return document.createElement.call(document, tag);
    });
    downloadCSV("my-report", "");
    expect(saved).toBe("my-report.csv");
  });

  it("does not double-append .csv when already present", () => {
    let saved = "";
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") {
        return {
          href: "",
          get download() { return saved; },
          set download(v: string) { saved = v; },
          click: clickSpy,
        } as any;
      }
      return document.createElement.call(document, tag);
    });
    downloadCSV("report.csv", "");
    expect(saved).toBe("report.csv");
  });
});
