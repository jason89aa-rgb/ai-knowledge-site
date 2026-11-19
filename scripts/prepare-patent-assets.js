const fs = require("node:fs");
const path = require("node:path");

const bundle = path.join(path.dirname(require.resolve("pptxgenjs")), "pptxgen.bundle.js");
fs.copyFileSync(bundle, path.join(__dirname, "../public/patent-pptx.bundle.js"));
