import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = process.env.PORT || 3000;
const URL = process.env.TARGET_URL || "https://example.com";

let browser;

async function screenshot() {
    try {
        console.log("Tomando screenshot de:", URL);

        if (!browser) {
            browser = await chromium.launch({
                headless: true,
                args: [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu"
                ]
            });
        }

        const page = await browser.newPage({
            viewport: {
                width: 1280,
                height: 720
            }
        });

        await page.goto(URL, {
            waitUntil: "networkidle",
            timeout: 30000
        });

        await page.screenshot({
            path: "/tmp/screenshot.png"
        });

        await page.close();

        console.log("Screenshot actualizado");

    } catch (err) {
        console.error("Error screenshot:", err);
    }
}


// Primera captura al iniciar
screenshot();

// Después cada minuto
setInterval(screenshot, 60_000);


// Servidor web mínimo
const server = http.createServer((req, res) => {

    if (req.url === "/" || req.url === "/screenshot.png") {

        if (!fs.existsSync("/tmp/screenshot.png")) {
            res.writeHead(200, {
                "Content-Type": "text/plain"
            });

            res.end("Esperando primer screenshot...");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "image/png",
            "Cache-Control": "no-cache"
        });

        fs.createReadStream("/tmp/screenshot.png").pipe(res);

    } else {

        res.writeHead(404);
        res.end("Not found");

    }

});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});
