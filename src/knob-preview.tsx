import { render } from "solid-js/web";
import { KnobPreview } from "./app/KnobPreview";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

render(() => <KnobPreview />, root);
