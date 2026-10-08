/*
 * The words the views write themselves (labels, button text, terminal prose), as opposed to the content in
 * data/site.json. These are the English defaults. A translation (data/i18n/<lang>.json) supplies a "ui" object
 * with the same keys, merged into the data before the views run, so a view asks t(data, "key") and gets
 * the visitor's language, or English when a key is missing.
 */
import { str, obj } from "./shared.mjs";

export const UI = {
  // page chrome
  navLabel: "Main", story: "Story", skills: "Skills", certs: "Certifications", writeups: "Write-ups", terminal: "Terminal",
  flags: "Flags", cv: "CV", contact: "Contact", language: "Language",
  night: "Night", day: "Day", toNight: "Switch to night mode", toDay: "Switch to day mode",
  // buttons
  viewCv: "View CV", email: "Email", cveChecker: "CVE Checker", downloadPdf: "Download PDF",
  // home
  internship: "Internship", internshipProgress: "Internship progress",
  earned: "Earned", progress: "In progress", planned: "Planned",
  noPosts: "First write-up coming soon",
  // courses
  courses: "courses", ectsDone: "of {total} ECTS completed", semesters: "semesters",
  completed: "Completed", current: "In progress", upcoming: "Upcoming", abroad: "Abroad: ", ects: "ECTS", major: "{major} major", semester: "Semester",
  // terminal
  termHelp: "Commands (Tab completes, the up arrow brings back the last one):", termHint: "Type a command and press Enter, or tap one below.",
  termLog: "Terminal output", termCommand: "Command", termPlaceholder: "type a command", termRun: "Run", termEmpty: "Nothing here yet.",
  sumHelp: "this list", sumClear: "empty the screen",
  sumWhoami: "who I am", sumSkills: "what I know, and what I'm learning", sumProjects: "things I've built", sumCerts: "certifications",
  sumEducation: "where I study", sumExperience: "where I've worked", sumWriteups: "things I've written", sumContact: "how to reach me",
  sumCv: "my one-page CV", sumFlags: "a hint about the hidden flags",
  kName: "name", kAbout: "about", kBasedIn: "based in", kLatest: "latest", kStudying: "studying", studyingAt: " at ",
  cvLine: "One page, plain text, made for people and for ATS software.", cvOnline: "Read it online", cvPdf: "Download the PDF",
  flagsBefore: "There are flags hidden on this site. No spoilers here: the hints and the checker are in ", flagsLink: "Hidden flags",
  // behaviour in main.js (read from the page, see jsStrings)
  jsComplete: "Complete", jsDaysLeft: "{n} days left",
  jsFlagFormat: "Flags look like AA{...} with letters, numbers and underscores inside.",
  jsFlagNoCrypto: "Your browser can't check flags here. Try a recent Chrome, Firefox or Safari.",
  jsFlagWrong: "That's not one of the flags. Check for typos and try again.",
  jsFlagAgain: "You already found flag {n}.",
  jsFlagAll: "All four flags found. Message me on LinkedIn and tell me which one took longest.",
  jsFlagOne: "Flag {n} found. {left} to go.",
  jsFlagCount: "{n} of {total} found",
  jsSudo: "{user} is not in the sudoers file. This incident will be reported.",
  jsRm: "rm: permission denied. Nice try.",
  jsExit: "There is no escape. The Contact section is further down, though.",
  jsCatMissing: "cat: missing file name",
  jsCatFlag: "Nice try. The real flags aren't in a file: see the hints under Hidden flags.",
  jsCatBinary: "cat: {file}: binary file. Try the cv command.",
  jsCatNone: "cat: {file}: No such file or directory",
  jsNothingYet: "Nothing yet.",
  jsNotFound: "{word}: command not found. Type help to see what works."
};

/** The text for a key in the data's language, falling back to English. */
// (not trimmed: some strings are joiners with spaces around them)
export const t = (data, key) => { const v = obj(obj(data).ui)[key]; return typeof v === "string" && v.trim() ? v : UI[key]; };
/** `{name}` placeholders filled in. */
export const fmt = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
/** Locale for dates and the page language ("en-GB" by default). */
export const localeOf = data => str(obj(obj(data).ui).locale) || "en-GB";
/** The strings main.js needs, as one JSON-safe object. */
export const jsStrings = data => Object.fromEntries(Object.keys(UI).filter(k => k.startsWith("js")).map(k => [k, t(data, k)]));
