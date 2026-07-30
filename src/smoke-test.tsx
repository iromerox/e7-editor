import { render } from "solid-js/web";
import { HardwareSmokeTest } from "./app/HardwareSmokeTest";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

render(() => <HardwareSmokeTest />, root);
