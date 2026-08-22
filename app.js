import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = process.env.PORT || 3000;
const URL = process.env.TARGET_URL || "https://rollercoin.com/sign-in";

const SCREENSHOT_PATH = "/tmp/screenshot.jpg";
const COOKIES_PATH = "./cookies.json";

let browser;
let context;
let page;
let takingScreenshot = false;

async function startBrowser() {
    console.log("Iniciando Chromium...");

    browser = await chromium.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",

            // ahorrar algo de RAM
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-component-update",
            "--disable-features=Translate,MediaRouter"
        ]
    });

    context = await browser.newContext({
        viewport: {
            width: 1280,
            height: 720
        }
    });

    // ==========================
    // CARGAR COOKIES
    // ==========================

    if (fs.existsSync(COOKIES_PATH)) {
        try {
            const cookies = JSON.parse(
                fs.readFileSync(COOKIES_PATH, "utf8")
            );

            await context.addCookies(cookies);

            console.log(
                `Cookies cargadas: ${cookies.length}`
            );

        } catch (err) {
            console.error(
                "Error cargando cookies:",
                err.message
            );
        }
    } else {
        console.log("No existe cookies.json");
    }

    page = await context.newPage();

    // 2 minutos para navegación
    page.setDefaultNavigationTimeout(120000);

    // 60 segundos para clicks/selectores/etc
    page.setDefaultTimeout(60000);

    console.log("Abriendo:", URL);

    try {

        await page.goto(URL, {
            waitUntil: "domcontentloaded",
            timeout: 120000
        });

        console.log("Página cargada:", page.url());

        // darle tiempo al JS de RollerCoin
        await page.waitForTimeout(10000);

    } catch (err) {

        console.error(
            "Error navegación:",
            err.message
        );

    }

    await takeScreenshot();
}


async function takeScreenshot() {

    if (!page || takingScreenshot)
        return;

    takingScreenshot = true;

    try {

        console.log(
            "Tomando screenshot:",
            new Date().toISOString()
        );

        await page.screenshot({
            path: SCREENSHOT_PATH,
            type: "jpeg",
            quality: 70
        });

        console.log("Screenshot actualizado");

    } catch (err) {

        console.error(
            "Error screenshot:",
            err.message
        );

    } finally {

        takingScreenshot = false;

    }
}


// ==========================
// SERVIDOR HTTP
// ==========================

const server = http.createServer((req, res) => {

    if (
        req.url === "/" ||
        req.url === "/screenshot.jpg"
    ) {

        if (!fs.existsSync(SCREENSHOT_PATH)) {

            res.writeHead(200, {
                "Content-Type": "text/plain"
            });

            res.end(
                "Esperando primer screenshot..."
            );

            return;
        }

        res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control":
                "no-store, no-cache, must-revalidate"
        });

        fs.createReadStream(
            SCREENSHOT_PATH
        ).pipe(res);

        return;
    }

    if (req.url === "/status") {

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            url: page?.url(),
            browser: !!browser,
            screenshot:
                fs.existsSync(SCREENSHOT_PATH)
        }));

        return;
    }

    res.writeHead(404);
    res.end("Not found");

});


server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Servidor escuchando en puerto ${PORT}`
        );

        startBrowser();

    }
);


// screenshot cada minuto
setInterval(
    takeScreenshot,
    60000
);
