import { render } from "solid-js/web";
import { AdsrPreview } from "./app/AdsrPreview";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

render(() => <AdsrPreview />, root);
