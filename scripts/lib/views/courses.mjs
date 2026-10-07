/*
 * Chapter 1: the course list.
 */
import { h, raw } from "../html.mjs";
import { str, obj, named, block } from "./shared.mjs";
import { icon } from "./icons.mjs";

const SEM_STATUS = { completed: "Completed", current: "In progress", upcoming: "Upcoming" };
const courseList = s => named(s.courses, "name");
const ects = s => courseList(s).reduce((sum, c) => sum + (Number(c.ects) || 0), 0);
const semesterList = data => named(obj(data.courses).semesters, "name");

export function coursesSummary(data) {
  const sems = semesterList(data);
  const total = sems.reduce((a, s) => a + ects(s), 0);
  const done = sems.filter(s => s.status === "completed").reduce((a, s) => a + ects(s), 0);
  const count = sems.reduce((a, s) => a + courseList(s).length, 0);
  return raw([
    h("span", {}, h("b", {}, String(count)), " courses"),
    h("span", {}, h("b", {}, String(done)), ` of ${total} ECTS completed`),
    h("span", {}, h("b", {}, String(sems.length)), " semesters")
  ].join("\n"));
}

export const semesters = data => raw(semesterList(data).map(s => {
  const status = SEM_STATUS[s.status] ? s.status : "upcoming";
  const abroad = str(s.abroad);   // a semester studied abroad gets its own look, so it stands out
  return block("section", { class: `sem ${status}${abroad ? " abroad" : ""}` }, [
    h("div", { class: "sem-head" }, h("h3", {}, str(s.name)), h("span", { class: "sem-state" }, SEM_STATUS[status])),
    abroad && h("p", { class: "sem-abroad" }, icon("plane"), h("span", {}, "Abroad: ", h("b", {}, abroad))),
    block("ul", { class: "sem-list" }, courseList(s).map(c =>
      h("li", {}, h("span", {}, str(c.name)), h("span", { class: "ects" }, Number(c.ects) ? `${Number(c.ects)} ECTS` : "")))),
    h("p", { class: "sem-total" }, `${ects(s)} ECTS`)
  ]);
}).join("\n"));
