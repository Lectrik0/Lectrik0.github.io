/*
 * The "Ask my terminal" section: lays out the screen, the buttons and the prompt around the commands in terminal-commands.mjs.
 */
import { h } from "../html.mjs";
import { str, obj, block } from "./shared.mjs";
import { COMMANDS, dl } from "./terminal-commands.mjs";

const termNames = COMMANDS.map(([name]) => name);

export function terminal(data) {
  const first = str(obj(data.profile).name).split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "visitor";
  const ps = `${first}@portfolio:~$`;
  const cmd = name => h("p", { class: "term-cmd" }, h("span", { class: "term-ps", "aria-hidden": "true" }, ps), " ", name);
  const out = body => h("div", { class: "term-out" }, body.filter(Boolean).length ? body : h("p", { class: "term-dim" }, "Nothing here yet."));
  const helpRows = [["help", "this list"], ...COMMANDS.map(([name, what]) => [name, what]), ["clear", "empty the screen"]];
  const blocks = [["help", "", () => [h("p", {}, "Commands (Tab completes, the up arrow brings back the last one):"), dl(helpRows)]], ...COMMANDS]
    .map(([name, , render, staticView]) => block("div", { class: "term-block", "data-cmd": name, "data-static": staticView ? "" : null }, [cmd(name), out([render(data)].flat(Infinity))]));
  const chips = ["help", ...termNames].map(name => h("button", { class: "term-chip", type: "button", "data-run": name }, name));
  return block("div", { class: "term", id: "term" }, [
    h("div", { class: "term-bar", "aria-hidden": "true" }, h("i", {}), h("i", {}), h("i", {}), h("span", {}, ps.slice(0, -1))),
    h("p", { class: "term-hint needs-js" }, "Type a command and press Enter, or tap one below."),
    block("div", { class: "term-log", id: "term-log", role: "log", tabindex: "0", "aria-label": "Terminal output", "aria-live": "off" }, blocks),
    block("div", { class: "term-chips needs-js" }, chips),
    block("form", { class: "term-form needs-js", id: "term-form", novalidate: true }, [
      h("label", { class: "sr", for: "term-input" }, "Command"),
      h("span", { class: "term-ps", "aria-hidden": "true" }, ps),
      h("input", { id: "term-input", name: "command", type: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", maxlength: "40", placeholder: "type a command" }),
      h("button", { class: "term-run", type: "submit" }, "Run")
    ])
  ]);
}
