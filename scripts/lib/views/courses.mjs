/*
 * Chapter 1: the course list.
 */
import { h, raw } from "../html.mjs";
import { str, obj, named, block } from "./shared.mjs";
import { icon } from "./icons.mjs";
import { t, fmt } from "./ui.mjs";

const SEM_STATUS = ["completed", "current", "upcoming"];
const courseList = s => named(s.courses, "name");
const ects = s => courseList(s).reduce((sum, c) => sum + (Number(c.ects) || 0), 0);
const semesterList = data => named(obj(data.courses).semesters, "name");

// "Semester 3" in the visitor's language; any other name is shown as written.
// Course names (and the "abroad" place) in the visitor's language where the translation has one, else as written.
const courseName = (data, name) => str(obj(obj(data.ui).courseNames)[str(name)]) || str(name);

const semesterName = (data, s) => str(s.name).replace(/^Semester (\d+)$/, (_, n) => `${t(data, "semester")} ${n}`);

export function coursesSummary(data) {
  const sems = semesterList(data);
  const total = sems.reduce((a, s) => a + ects(s), 0);
  const done = sems.filter(s => s.status === "completed").reduce((a, s) => a + ects(s), 0);
  const count = sems.reduce((a, s) => a + courseList(s).length, 0);
  return raw([
    h("span", {}, h("b", {}, String(count)), " " + t(data, "courses")),
    h("span", {}, h("b", {}, String(done)), " " + fmt(t(data, "ectsDone"), { total })),
    h("span", {}, h("b", {}, String(sems.length)), " " + t(data, "semesters"))
  ].join("\n"));
}

export const semesters = data => raw(semesterList(data).map(s => {
  const status = SEM_STATUS.includes(s.status) ? s.status : "upcoming";
  const abroad = str(s.abroad);   // a semester studied abroad gets its own look, so it stands out
  return block("section", { class: `sem ${status}${abroad ? " abroad" : ""}` }, [
    h("div", { class: "sem-head" }, h("h3", {}, semesterName(data, s)), h("span", { class: "sem-state" }, t(data, status))),
    abroad && h("p", { class: "sem-abroad" }, icon("plane"), h("span", {}, t(data, "abroad"), h("b", {}, courseName(data, abroad)))),
    block("ul", { class: "sem-list" }, courseList(s).map(c =>
      h("li", {}, h("span", {}, courseName(data, c.name)), h("span", { class: "ects" }, Number(c.ects) ? `${Number(c.ects)} ${t(data, "ects")}` : "")))),
    h("p", { class: "sem-total" }, `${ects(s)} ${t(data, "ects")}`)
  ]);
}).join("\n"));
