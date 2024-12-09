import { launch } from "puppeteer";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers"; // `hideBin` helps manage argv array

let status = 0;

// Parse arguments with yargs
const argv = yargs(hideBin(process.argv))
    .option("website", {
        alias: "w",
        description: "Your website",
        type: "string",
        demandOption: true,
    })
    .help()
    .alias("help", "h").argv;

const website = argv.website;
const cleanUrl = website.replace(/^https?:\/\//, "");

// Make the `dist` folder and the directory for the website
const outputPath = `dist/output`;
fs.open(outputPath, "a", (err, fd) => {
    if (err) {
        console.error("Error opening file:", err);
        return;
    }
    // Update the timestamp of the file (mimicking touch behavior)
    fs.utimes(outputPath, new Date(), new Date(), (err) => {
        if (err) {
            console.error("Error updating file timestamps:", err);
            return;
        }
        console.log("File was touched (timestamp updated)");
    });
    // Close the file descriptor
    fs.close(fd, (err) => {
        if (err) console.error("Error closing file:", err);
    });
});
fs.appendFileSync(
    `dist/output`,
    `# Output - ${new Date().toLocaleString()}\n\n

---

Making dist folder...`
);
fs.mkdirSync("dist", { recursive: true }, (err) => {
    if (err) {
        console.error("Error creating folder:", err);
        status = 1;
    }
});

fs.mkdirSync(`dist/${cleanUrl}`, { recursive: true }, (err) => {
    if (err) {
        console.error("Error creating folder:", err);
        status = 1;
    }
});

(async () => {
    try {
        if (status === 1) {
            return status;
        }
        console.log(`Puppeteer will go to: ${website}...`);
        fs.appendFileSync(`dist/output`, `\nScraping ${website}...`);

        const browser = await launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(website, {
            waitUntil: "networkidle0",
        });

        // Copy the entire page as source code
        const html = await page.content();

        fs.appendFileSync(`dist/output`, "\nExporting the source");

        // Export the source code to file system
        fs.writeFileSync(`dist/${cleanUrl}/index.html`, html);

        // Include any stylesheets as styles.css
        const css = `/* styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

${await page.evaluate(() => {
    const styles = Array.from(document.styleSheets)
        .map((styleSheet) => {
            try {
                return Array.from(styleSheet.cssRules)
                    .map((cssRule) => cssRule.cssText)
                    .join("\n");
            } catch (e) {
                console.warn("Stylesheet could not be loaded", e);
                return "";
            }
        })
        .join("\n");
    return styles;
})}`;

        fs.appendFileSync(`dist/output`, "\nExporting the styles");

        // Export the styles to the file system
        fs.writeFileSync(`dist/${cleanUrl}/styles.css`, css);

        // Gather any JS scripts that you can from the page
        const scripts = await page.evaluate(async () => {
            const scripts = Array.from(document.scripts)
                .map((script) => script.src)
                .filter((src) => src);

            return scripts;
        });

        const js = (
            await Promise.all(
                scripts.map((src) =>
                    fetch(src)
                        .then((res) => res.text())
                        .then(
                            (source) =>
                                `
/** ${src}
*  ${website}
*/

${source}
`
                        )
                )
            )
        ).join("\n");

        fs.appendFileSync(`dist/output`, "\nExporting the JS");

        // Export the JS to the file system
        fs.writeFileSync(`dist/${cleanUrl}/scripts.js`, js);

        // Generate the PDF from the page
        await page.emulateMediaType("screen");

        const pdf = await page.pdf({ format: "A4" });

        await browser.close();

        fs.appendFileSync(`dist/output`, "\nExporting the PDF\n\n");

        // Export the PDF to the file system

        fs.writeFileSync(`dist/${cleanUrl}/index.pdf`, pdf);

        return status;
    } catch (err) {
        fs.appendFileSync(`dist/output`, `\nError: ${err}\n\n`);
        console.error("Error:", err);
        return 1;
    }
})();
