const fs = require("node:fs");
const path = require("node:path");

const bundle = path.join(path.dirname(require.resolve("pptxgenjs")), "pptxgen.bundle.js");
const publicDir = path.join(__dirname, "../public");
fs.copyFileSync(bundle, path.join(publicDir, "patent-pptx.bundle.js"));

const assets = path.join(publicDir, "patent-assets");
const packageDir = name => path.dirname(require.resolve(name + "/package.json"));
function copy(root, file, destination) {
  const target = path.join(assets, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(path.join(root, file), target, { recursive: true });
}

const pdf = packageDir("pdfjs-dist");
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copy(pdf, "legacy/build/" + file, "pdf/" + file);
for (const item of ["cmaps", "standard_fonts", "wasm", "iccs", "LICENSE"]) copy(pdf, item, "pdf/" + item);

const tesseract = packageDir("tesseract.js");
for (const file of ["tesseract.min.js", "tesseract.min.js.LICENSE.txt", "worker.min.js", "worker.min.js.LICENSE.txt"]) {
  copy(tesseract, "dist/" + file, "ocr/" + file);
}
const core = path.dirname(require.resolve("tesseract.js-core", { paths: [tesseract] }));
for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  const file = `tesseract-core-${variant}.wasm.js`;
  copy(core, file, "ocr/" + file);
}
copy(core, "LICENSE", "ocr/CORE-LICENSE");
for (const language of ["eng", "kor", "chi_sim"]) {
  const root = packageDir("@tesseract.js-data/" + language);
  copy(root, `4.0.0_best_int/${language}.traineddata.gz`, `ocr/lang/${language}.traineddata.gz`);
}
