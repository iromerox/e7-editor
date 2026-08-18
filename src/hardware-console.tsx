import { render } from "solid-js/web";
import { HardwareConsole } from "./app/HardwareConsole";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

render(() => <HardwareConsole />, root);
