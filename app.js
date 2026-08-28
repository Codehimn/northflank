import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = process.env.PORT || 3000;
const URL = process.env.TARGET_URL || "https://rollercoin.com/sign-in";

const SCREENSHOT_PATH = "/tmp/screenshot.jpg";

const STORAGE_STATE_PATH = "./storageState.json";
const COOKIES_PATH = "./cookies.json";
const LOCAL_STORAGE_PATH = "./localStorage.json";

const PERSISTENT_STATE_PATH = process.env.PERSISTENT_STATE_PATH || "/data/storageState.json";

let browser;
let context;
let page;
let takingScreenshot = false;

function readJSON(path) {
    try {
        if (!fs.existsSync(path)) return null;
        return JSON.parse(fs.readFileSync(path, "utf8"));
    } catch (err) {
        console.error(`Error leyendo ${path}:`, err.message);
        return null;
    }
}

function getStatePath() {
    if (fs.existsSync(PERSISTENT_STATE_PATH)) {
        return PERSISTENT_STATE_PATH;
    }

    if (fs.existsSync(STORAGE_STATE_PATH)) {
        return STORAGE_STATE_PATH;
    }

    return null;
}

async function startBrowser() {
    console.log("Iniciando Chromium visible...");

    browser = await chromium.launch({
        headless: false,
        args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
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

    const statePath = getStatePath();

    if (statePath) {
        console.log("Cargando storage state:", statePath);

        context = await browser.newContext({
            storageState: statePath,
            viewport: {
                width: 1280,
                height: 720
            }
        });
    } else {
        console.log("No existe storageState previo");

        context = await browser.newContext({
            viewport: {
                width: 1280,
                height: 720
            }
        });
    }

    const cookieData = readJSON(COOKIES_PATH);

    if (cookieData) {
        try {
            const cookies = Array.isArray(cookieData)
                ? cookieData
                : cookieData.cookies;

            if (Array.isArray(cookies) && cookies.length > 0) {
                await context.addCookies(cookies);
                console.log(`Cookies añadidas: ${cookies.length}`);
            }
        } catch (err) {
            console.error("Error cargando cookies:", err.message);
        }
    }

    const localStorageData = readJSON(LOCAL_STORAGE_PATH);

    if (localStorageData) {
        console.log(
            `localStorage encontrado: ${Object.keys(localStorageData).length} claves`
        );

        await context.addInitScript((storage) => {
            for (const [key, value] of Object.entries(storage)) {
                try {
                    window.localStorage.setItem(key, String(value));
                } catch {}
            }
        }, localStorageData);
    }

    page = await context.newPage();

    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(60000);

    page.on("console", msg => {
        console.log(`[BROWSER ${msg.type()}]`, msg.text());
    });

    page.on("pageerror", err => {
        console.error("[PAGE ERROR]", err.message);
    });

    console.log("Abriendo:", URL);

    try {
        await page.goto(URL, {
            waitUntil: "domcontentloaded",
            timeout: 120000
        });

        console.log("Página cargada:", page.url());

        await page.waitForTimeout(5000);
    } catch (err) {
        console.error("Error navegación:", err.message);
    }

    await takeScreenshot();
}

async function takeScreenshot() {
    if (!page || takingScreenshot) return;

    takingScreenshot = true;

    try {
        await page.screenshot({
            path: SCREENSHOT_PATH,
            type: "jpeg",
            quality: 70
        });

        console.log("Screenshot actualizado:", new Date().toISOString());
    } catch (err) {
        console.error("Error screenshot:", err.message);
    } finally {
        takingScreenshot = false;
    }
}

async function saveCurrentState() {
    if (!context) return;

    try {
        const dir = PERSISTENT_STATE_PATH.substring(
            0,
            PERSISTENT_STATE_PATH.lastIndexOf("/")
        );

        if (dir) {
            fs.mkdirSync(dir, { recursive: true });
        }

        await context.storageState({
            path: PERSISTENT_STATE_PATH
        });

        console.log("Storage state guardado:", PERSISTENT_STATE_PATH);
    } catch (err) {
        console.error("Error guardando storage state:", err.message);
    }
}

const server = http.createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/screenshot.jpg") {
        if (!fs.existsSync(SCREENSHOT_PATH)) {
            res.writeHead(200, {
                "Content-Type": "text/plain"
            });

            res.end("Esperando primer screenshot...");
            return;
        }

        res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        });

        fs.createReadStream(SCREENSHOT_PATH).pipe(res);
        return;
    }

    if (req.url === "/status") {
        let browserData = null;

        if (page) {
            try {
                browserData = await page.evaluate(() => ({
                    url: location.href,
                    title: document.title,
                    localStorageKeys: Object.keys(localStorage)
                }));
            } catch {}
        }

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            running: !!browser,
            page: browserData,
            files: {
                storageState: fs.existsSync(STORAGE_STATE_PATH),
                persistentStorageState: fs.existsSync(PERSISTENT_STATE_PATH),
                cookies: fs.existsSync(COOKIES_PATH),
                localStorage: fs.existsSync(LOCAL_STORAGE_PATH)
            },
            screenshot: fs.existsSync(SCREENSHOT_PATH)
        }, null, 2));

        return;
    }

    if (req.url === "/save-state") {
        await saveCurrentState();

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            ok: true,
            path: PERSISTENT_STATE_PATH
        }));

        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
    startBrowser();
});

setInterval(takeScreenshot, 60_000);
setInterval(saveCurrentState, 60_000);

process.on("SIGTERM", async () => {
    console.log("SIGTERM recibido, guardando estado...");
    await saveCurrentState();

    try {
        await browser?.close();
    } catch {}

    process.exit(0);
});
