import { render } from "solid-js/web";
import { LedButtonPreview } from "./app/LedButtonPreview";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

render(() => <LedButtonPreview />, root);
