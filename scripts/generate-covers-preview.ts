import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { projectArtworkVariants } from "../packages/ui/src/utils/projectArtwork.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../covers-preview.html");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Covers Preview</title>
  <style>
    body {
      background: #121212;
      color: #fff;
      font-family: sans-serif;
      padding: 40px;
      margin: 0;
    }
    h1 { margin-top: 0; margin-bottom: 10px; }
    p.description { color: #aaa; margin-bottom: 20px; }
    button#regenerate {
      background: #444;
      color: #fff;
      border: 1px solid #555;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 40px;
    }
    button#regenerate:hover { background: #555; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .card {
      border: 1px solid #333;
      border-radius: 12px;
      overflow: hidden;
      background: #1b1b1b;
    }
    .project-art {
      height: 145px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: bold;
      font-size: 24px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    .card-body {
      padding: 15px;
      text-align: center;
      color: #ccc;
    }
    h2 {
      margin-top: 40px;
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
    }
  </style>
</head>
<body>
  <h1>Auto-Generated Covers</h1>
  <p class="description">This shows all ${projectArtworkVariants.length} dynamic variants. Click to randomly re-roll the base and secondary hues.</p>
  <button id="regenerate">Regenerate Hues</button>
  <div id="container"></div>

  <script>
    const variants = ${JSON.stringify(projectArtworkVariants)};
    const container = document.getElementById('container');
    const regenerateBtn = document.getElementById('regenerate');

    function render() {
      container.innerHTML = '';
      
      // Let's render a few different base hues each time to see variety
      const huesToTest = [
        Math.floor(Math.random() * 360),
        Math.floor(Math.random() * 360),
        Math.floor(Math.random() * 360),
        Math.floor(Math.random() * 360)
      ];

      for (const hue of huesToTest) {
        // Also random secondary hue
        const secHue = Math.floor(Math.random() * 360);
        
        let sectionHTML = \`<div><h2>Base Hue: \${hue} | Secondary: \${secHue}</h2><div class="grid">\`;
        
        variants.forEach((variant, i) => {
          const styleString = Object.entries(variant)
            .map(([k, v]) => {
              const kebabKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
              let val = String(v);
              // Replace both hue variables
              val = val.replace(/var\\(--art-hue,\\s*\\d+\\)/g, hue);
              val = val.replace(/var\\(--art-secondary-hue,\\s*\\d+\\)/g, secHue);
              return \`\${kebabKey}: \${val}\`;
            })
            .join("; ");

          sectionHTML += \`<div class="card">
            <div class="project-art" style="\${styleString}">Art \${i}</div>
            <div class="card-body">Variant \${i}</div>
          </div>\`;
        });

        sectionHTML += \`</div></div>\`;
        container.innerHTML += sectionHTML;
      }
    }

    regenerateBtn.addEventListener('click', render);
    // Initial render
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
console.log(`Generated covers-preview.html at ${outputPath} with interactive client-side rendering!`);
