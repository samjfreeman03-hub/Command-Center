#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const CASE_STUDIES_DIR = "/Users/samfreeman/Desktop/FLAIR (SFE)/FLAIR COLLECTIVE/Key Case Studies";
const OUT_DIR = path.join(__dirname, "..", "data", "positioning-extracted");

const FILES = [
  "FLAIR Next-Gen Beauty, Wellness, Lifestyle Deck.pdf",
  "FLAIR x WOW Media (1).pdf",
  "RAB UMICH Activation - After Action Report.pdf",
  "method oasis deck.pdf",
  "FLAIR x Coca Cola Report.pdf",
  "FLAIR x Monster Energy - Case Study.pdf",
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const summary = [];
  for (const file of FILES) {
    const full = path.join(CASE_STUDIES_DIR, file);
    if (!fs.existsSync(full)) {
      console.error(`MISSING: ${file}`);
      continue;
    }
    const buf = fs.readFileSync(full);
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    await parser.destroy();
    const txt = (result.text || "").trim();
    const numpages = result.numpages || result.pages || 0;
    const outName = file.replace(/\.pdf$/i, ".txt").replace(/[^\w.\- ()]/g, "_");
    const outPath = path.join(OUT_DIR, outName);
    fs.writeFileSync(outPath, txt);
    summary.push({
      file,
      pages: numpages,
      chars: txt.length,
      out: path.relative(process.cwd(), outPath),
    });
    console.log(`✓ ${file} → ${numpages}pp, ${txt.length} chars`);
  }
  console.log("\n--- SUMMARY ---");
  console.log(JSON.stringify(summary, null, 2));
})();
