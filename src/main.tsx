import { render } from "solid-js/web";
import { App } from "./app/App";
import { createLibraryDatabase } from "./store";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root element");
}

const database = await createLibraryDatabase();

render(() => <App database={database} />, root);
