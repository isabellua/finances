import { describe, expect, it } from "vitest";
import { buildICS } from "./ics";

const now = new Date("2026-11-10T12:00:00Z");

describe("buildICS", () => {
  it("gera evento de dia inteiro com DTEND no dia seguinte e dois alarmes", () => {
    const ics = buildICS([{ uid: "a@x", date: "2026-12-31", summary: "Aluguel" }], now);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
    expect(ics).toContain("DTSTAMP:20261110T120000Z\r\n");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:-PT15H");
    expect(ics).toContain("TRIGGER:PT9H");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("escapa vírgula, ponto e vírgula e quebra de linha", () => {
    const ics = buildICS([{ uid: "b@x", date: "2026-11-20", summary: "Luz; água, gás", description: "linha1\nlinha2" }], now);
    expect(ics).toContain("SUMMARY:Luz\; água\\, gás");
    expect(ics).toContain("DESCRIPTION:linha1\\nlinha2");
  });
  it("dobra linhas longas em 75 octetos sem quebrar caractere multibyte", () => {
    const ics = buildICS([{ uid: "c@x", date: "2026-11-20", summary: "ç".repeat(80) }], now);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"ç".repeat(80)}`);
  });
  it("sem eventos, ainda é um calendário válido", () => {
    expect(buildICS([], now)).toContain("END:VCALENDAR");
  });
});
