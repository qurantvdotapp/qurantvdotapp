import { render } from "solid-js/web";
import { App } from "./App";

if ("serviceWorker" in navigator && !window.location.protocol.startsWith("file")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

render(() => <App />, document.getElementById("app")!);
