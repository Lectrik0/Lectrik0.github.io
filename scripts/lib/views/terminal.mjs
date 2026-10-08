/*
 * The "Ask my terminal" section: lays out the screen, the buttons and the prompt around the commands in terminal-commands.mjs.
 */
import { h } from "../html.mjs";
import { str, obj, block } from "./shared.mjs";
import { COMMANDS, dl } from "./terminal-commands.mjs";
import { t } from "./ui.mjs";

// The screen's name for the visitor: "ali@portfolio:~$".
const promptFor = data => {
  const user = str(obj(data.profile).name).split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "visitor";
  return `${user}@portfolio:~$`;
};

// `help` lists every command, so it is built from COMMANDS rather than being one of them.
const HELP = {
  name: "help",
  render: data => [
    h("p", {}, t(data, "termHelp")),
    dl([["help", t(data, "sumHelp")], ...COMMANDS.map(c => [c.name, t(data, c.summary)]), ["clear", t(data, "sumClear")]])
  ]
};

// One command's echoed line and its output. main.js lifts the output out of the page and reprints it on demand.
function commandBlock(command, data, prompt) {
  const parts = [command.render(data)].flat(Infinity);
  return block("div", { class: "term-block", "data-cmd": command.name, "data-static": command.showsWithoutJs ? "" : null }, [
    h("p", { class: "term-cmd" }, h("span", { class: "term-ps", "aria-hidden": "true" }, prompt), " ", command.name),
    h("div", { class: "term-out" }, parts.some(Boolean) ? parts : h("p", { class: "term-dim" }, t(data, "termEmpty")))
  ]);
}

const commandButton = name => h("button", { class: "term-chip", type: "button", "data-run": name }, name);

export function terminal(data) {
  const prompt = promptFor(data);
  const blocks = [HELP, ...COMMANDS].map(command => commandBlock(command, data, prompt));
  return block("div", { class: "term", id: "term" }, [
    h("div", { class: "term-bar", "aria-hidden": "true" }, h("i", {}), h("i", {}), h("i", {}), h("span", {}, prompt.slice(0, -1))),
    h("p", { class: "term-hint needs-js" }, t(data, "termHint")),
    block("div", { class: "term-log", id: "term-log", role: "log", tabindex: "0", "aria-label": t(data, "termLog"), "aria-live": "off" }, blocks),
    block("div", { class: "term-chips needs-js" }, [HELP, ...COMMANDS].map(c => commandButton(c.name))),
    block("form", { class: "term-form needs-js", id: "term-form", novalidate: true }, [
      h("label", { class: "sr", for: "term-input" }, t(data, "termCommand")),
      h("span", { class: "term-ps", "aria-hidden": "true" }, prompt),
      h("input", { id: "term-input", name: "command", type: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off",
        spellcheck: "false", maxlength: "40", placeholder: t(data, "termPlaceholder") }),
      h("button", { class: "term-run", type: "submit" }, t(data, "termRun"))
    ])
  ]);
}
