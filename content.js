// content.js — The "Field Agent"
// Listens for a message from popup.js, scrapes LinkedIn profile data, sends it back.

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "getProfileData") {
    sendResponse(scrapeProfile());
  }
  return true;
});

function scrapeProfile() {
  return {
    name: scrapeName(),
    about: scrapeAbout(),
  };
}

// ─────────────────────────────────────────────
// NAME — find the first h1 on the page that has real text.
// LinkedIn profile pages have exactly one meaningful h1: the person's name.
// We deliberately avoid class names since LinkedIn changes them constantly.
// ─────────────────────────────────────────────
function scrapeName() {
  // Attempt 1: attribute-contains selector — finds h1 even if LinkedIn adds
  // extra classes alongside text-heading-xlarge
  const byClass = document.querySelector("[class*='text-heading-xlarge']");
  if (byClass) {
    const text = (byClass.innerText || byClass.textContent || "").trim();
    if (text.length > 0) return text;
  }

  // Attempt 2: any h1 on the page — LinkedIn profiles have exactly one real h1
  const allH1s = document.querySelectorAll("h1");
  for (const h1 of allH1s) {
    const text = (h1.innerText || h1.textContent || "").trim();
    if (text.length > 0) return text;
  }

  // Attempt 3: parse document.title — LinkedIn titles are "FirstName LastName | LinkedIn"
  if (document.title) {
    const fromTitle = document.title.split("|")[0].split("–")[0].trim();
    if (fromTitle && fromTitle.toLowerCase() !== "linkedin") {
      return fromTitle;
    }
  }

  return "(Name not found — make sure the page has fully loaded)";
}

// ─────────────────────────────────────────────
// ABOUT — three independent strategies tried in order.
// If one fails we try the next.
// ─────────────────────────────────────────────
function scrapeAbout() {
  // Strategy 1: The classic approach — find <div id="about"> anchor,
  // walk up to the parent <section>, extract text from it.
  const aboutAnchor = document.getElementById("about");
  if (aboutAnchor) {
    const section = aboutAnchor.closest("section");
    const text = extractTextFromSection(section);
    if (text) return text;
  }

  // Strategy 2: Find any h2 or h3 whose visible text is exactly "About",
  // then extract text from its parent section.
  // This works even if LinkedIn removes or renames the id="about" anchor.
  const headings = document.querySelectorAll("h2, h3");
  for (const heading of headings) {
    const headingText = (heading.innerText || heading.textContent || "").trim();
    if (headingText.toLowerCase() === "about") {
      const section = heading.closest("section");
      const text = extractTextFromSection(section);
      if (text) return text;
    }
  }

  // Strategy 3: Last resort — scan every section on the page.
  // If a section starts with an "About" heading anywhere inside it, use that section.
  const allSections = document.querySelectorAll("section");
  for (const section of allSections) {
    const sectionText = (section.innerText || section.textContent || "").trim();
    if (/^about\b/i.test(sectionText)) {
      const text = extractTextFromSection(section);
      if (text) return text;
    }
  }

  return "(About section not found — this profile may not have one, or try scrolling down to load all sections first)";
}

// ─────────────────────────────────────────────
// HELPER: Given a <section> element, return the About body text.
// LinkedIn stores the full (un-truncated) text inside span[aria-hidden="true"].
// We pick the longest such span, which is the actual biography text.
// ─────────────────────────────────────────────
function extractTextFromSection(section) {
  if (!section) return null;

  // Pass 1: LinkedIn's hidden-span trick for full text
  const hiddenSpans = section.querySelectorAll('span[aria-hidden="true"]');
  let longest = "";
  hiddenSpans.forEach(function (span) {
    const text = (span.innerText || span.textContent || "").trim();
    if (text.length > longest.length) longest = text;
  });
  if (longest.length > 20) return longest; // 20-char guard to skip button labels

  // Pass 2: Any <p> tags inside the section
  const paragraphs = section.querySelectorAll("p");
  const paraText = Array.from(paragraphs)
    .map((p) => (p.innerText || p.textContent || "").trim())
    .filter((t) => t.length > 0)
    .join("\n");
  if (paraText.length > 20) return paraText;

  // Pass 3: Raw section text, stripping the "About" heading from the top
  const rawText = (section.innerText || section.textContent || "").trim();
  const stripped = rawText.replace(/^about\s*/i, "").trim();
  if (stripped.length > 20) return stripped;

  return null;
}
