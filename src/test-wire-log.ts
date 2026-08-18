// Reads a committed capture out of fixtures/ for the tests that assert against wire bytes rather than typed ones.
import type { WireLogCapture } from "./midi";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWireLog } from "./midi";

const FIXTURES = join(process.cwd(), "fixtures");

export function wireLogFixture(name: string): WireLogCapture {
  const fileName = `${name}.wire`;
  return parseWireLog(fileName, readFileSync(join(FIXTURES, fileName), "utf8"));
}
