// Reads a committed capture out of fixtures/ for the tests that assert against wire bytes rather than typed ones.
import type { WireLogCapture } from "./midi";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseWireLog } from "./midi";

const FIXTURES = join(process.cwd(), "fixtures");
const EXTENSION = ".wire";

export function wireLogFixtureNames(): string[] {
  return readdirSync(FIXTURES)
    .filter((fileName) => fileName.endsWith(EXTENSION))
    .map((fileName) => fileName.slice(0, -EXTENSION.length))
    .sort();
}

export function wireLogFixture(name: string): WireLogCapture {
  const fileName = `${name}${EXTENSION}`;
  return parseWireLog(fileName, readFileSync(join(FIXTURES, fileName), "utf8"));
}
