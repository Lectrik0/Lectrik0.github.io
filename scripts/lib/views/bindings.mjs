/*
 * Single text values, for elements marked data-bind="...".
 */
import { str, arr, obj } from "./shared.mjs";
import { t, fmt } from "./ui.mjs";

export function bindings(data) {
  const P = obj(data.profile), C = obj(data.courses), CV = obj(data.cv);
  const values = {
    "profile.name": str(P.name),
    "profile.location": str(P.location),
    "profile.tagline": str(P.tagline),
    "cv.name": str(CV.fullName) || str(P.name),
    "cv.headline": str(CV.headline),
    "courses.university": str(C.university),
    "courses.subtitle": [str(C.degree), str(C.major) && fmt(t(data, "major"), { major: str(C.major) })].filter(Boolean).join(", ")
  };
  arr(data.story).forEach((ch, i) => {
    values[`story.${i}.title`] = str(obj(ch).title);
    values[`story.${i}.text`] = str(obj(ch).text);
  });
  return values;
}
