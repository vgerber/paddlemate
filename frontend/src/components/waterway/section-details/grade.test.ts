import { describe, expect, test } from "bun:test";
import { baseSpan, gradeLabel, gradeRank, sectionGrade } from "./grade";

const span = (grade: string, startKm: number, endKm: number) => ({
  grade,
  startKm,
  endKm,
});

describe("sectionGrade", () => {
  test("a range over 80 percent or more is the base", () => {
    expect(sectionGrade([span("III", 0, 5.4)], 5.8)).toEqual({
      base: "III",
      harder: null,
    });
    expect(sectionGrade([span("III", 0, 4.64)], 5.8)?.base).toBe("III");
  });

  test("a range below 80 percent speaks for nothing", () => {
    expect(sectionGrade([span("III", 0, 4.5)], 5.8)).toBeNull();
    expect(sectionGrade([], 5.8)).toBeNull();
    expect(sectionGrade([span("III", 0, 1)], 0)).toBeNull();
  });

  test("several ranges but no base give no grade", () => {
    expect(sectionGrade([span("II", 0, 2), span("III", 2, 4)], 5.8)).toBeNull();
  });

  test("the hardest harder stretch goes in brackets", () => {
    const grade = sectionGrade(
      [span("III", 0, 5.8), span("IV", 3.1, 4), span("IV+", 4.2, 4.4)],
      5.8,
    );
    expect(grade).toEqual({ base: "III", harder: "IV+" });
    expect(grade && gradeLabel(grade)).toBe("III (IV+)");
  });

  test("an easier stretch gets no bracket", () => {
    expect(sectionGrade([span("III", 0, 5.8), span("II", 1, 2)], 5.8)).toEqual({
      base: "III",
      harder: null,
    });
  });

  test("a value that is not a grade is ignored", () => {
    expect(sectionGrade([span("easy", 0, 5.8)], 5.8)).toBeNull();
  });

  test("the widest cover wins as base", () => {
    expect(
      baseSpan([span("IV", 0, 4.7), span("III", 0, 5.8)], 5.8)?.grade,
    ).toBe("III");
  });
});

describe("gradeRank", () => {
  test("orders signs within a grade", () => {
    expect(gradeRank("III-")).toBeLessThan(gradeRank("III"));
    expect(gradeRank("III")).toBeLessThan(gradeRank("III+"));
    expect(gradeRank("III+")).toBeLessThan(gradeRank("IV"));
  });
});
