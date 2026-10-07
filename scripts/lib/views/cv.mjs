/*
 * The CV page and the job-fair cards. The CV layout itself lives in assets/cv-layout.js.
 */
import { h, raw } from "../html.mjs";
import { str, obj, block, HTML, CvLayout } from "./shared.mjs";

export const cvContact = (data, site) => raw(CvLayout.contact(data, HTML, new URL(site.url).host).join(`\n${CvLayout.separator(HTML)}\n`));
export const cvPersonal = data => raw(CvLayout.personal(data, HTML) || "");
export const cvSections = data => CvLayout.sections(data);
export const cvBody = data => raw(CvLayout.body(data, HTML).join("\n"));
// The CV's PDF, saved under the person's name.
export const cvFileName = data => (str(obj(data.cv).fullName) || str(obj(data.profile).name) || "CV").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function cvDownloads(data) {
  return h("a", { class: "btn", href: "cv.pdf", download: `${cvFileName(data)}-CV.pdf` }, "Download PDF");
}

/* ---------- job-fair cards (card.html): ten business cards to an A4 page ---------- */
export function cards(data, site) {
  const P = obj(data.profile), CV = obj(data.cv), host = new URL(site.url).host;
  const lines = [CvLayout.email(data), str(P.phone), str(P.linkedin) && CvLayout.plainUrl(str(P.linkedin)), host].filter(Boolean);
  // the first card shows on screen; all ten print
  const card = extra => block("article", { class: extra ? "card extra" : "card" }, [
    block("div", { class: "card-text" }, [
      h("p", { class: "card-name" }, str(CV.fullName) || str(P.name)),
      str(CV.headline) && h("p", { class: "card-role" }, str(CV.headline)),
      block("ul", { class: "card-contact" }, lines.map(l => h("li", {}, l)))
    ]),
    block("figure", { class: "card-qr" }, [
      h("img", { src: "assets/qr-cv.svg", alt: `QR code that opens the CV at ${host}/cv.html`, width: "96", height: "96" }),
      h("figcaption", {}, "Scan for the CV")
    ])
  ]);
  return raw(Array.from({ length: 10 }, (_, i) => card(i > 0)).join("\n"));
}
