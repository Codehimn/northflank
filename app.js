import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = Number(process.env.PORT || 3000);
const TARGET_URL = process.env.TARGET_URL || "https://rollercoin.com/sign-in";

const WIDTH = Number(process.env.VIEWPORT_WIDTH || 1024);
const HEIGHT = Number(process.env.VIEWPORT_HEIGHT || 576);

const SCREENSHOT_INTERVAL_MS =
    Number(process.env.SCREENSHOT_INTERVAL_MS || 60000);

const SAVE_INTERVAL_MS =
    Number(process.env.SAVE_INTERVAL_MS || 120000);

const BLOCK_IMAGES =
    String(process.env.BLOCK_IMAGES || "true").toLowerCase() === "true";

const SCREENSHOT_PATH = "/tmp/screenshot.jpg";

const STORAGE_STATE_PATH = "./storageState.json";
const COOKIES_PATH = "./cookies.json";
const LOCAL_STORAGE_PATH = "./localStorage.json";

const PERSISTENT_STATE_PATH =
    process.env.PERSISTENT_STATE_PATH || "/data/storageState.json";

const PERSISTENT_LOCAL_STORAGE_PATH =
    process.env.PERSISTENT_LOCAL_STORAGE_PATH || "/data/localStorage.json";

let browser = null;
let context = null;
let page = null;
let cdp = null;

let startingBrowser = false;
let takingScreenshot = false;
let savingState = false;
let restartTimer = null;

function readJSON(path) {
    try {
        if (!fs.existsSync(path)) return null;
        return JSON.parse(fs.readFileSync(path, "utf8"));
    } catch (err) {
        console.error(`Error leyendo ${path}:`, err.message);
        return null;
    }
}

function browserAlive() {
    return !!browser && browser.isConnected();
}

function contextAlive() {
    return browserAlive() && !!context;
}

function pageAlive() {
    return contextAlive() && !!page && !page.isClosed();
}

function getInitialStatePath() {
    if (fs.existsSync(PERSISTENT_STATE_PATH)) return PERSISTENT_STATE_PATH;
    if (fs.existsSync(STORAGE_STATE_PATH)) return STORAGE_STATE_PATH;
    return null;
}

function getInitialLocalStorage() {
    return readJSON(PERSISTENT_LOCAL_STORAGE_PATH) || readJSON(LOCAL_STORAGE_PATH);
}

function scheduleRestart(reason = "desconocido") {
    if (restartTimer || startingBrowser) return;

    console.error(`Reinicio Chromium programado: ${reason}`);

    restartTimer = setTimeout(async () => {
        restartTimer = null;
        await startBrowser();
    }, 4000);
}

async function cleanupBrowserObjects() {
    cdp = null;

    try {
        if (page && !page.isClosed()) await page.close().catch(() => {});
    } catch {}

    try {
        if (context) await context.close().catch(() => {});
    } catch {}

    try {
        if (browser && browser.isConnected()) await browser.close().catch(() => {});
    } catch {}

    page = null;
    context = null;
    browser = null;
}

async function installLightweightRouting() {
    const blockedHosts = [
        "googletagmanager.com",
        "google-analytics.com",
        "doubleclick.net",
        "facebook.net",
        "hotjar.com",
        "posthog.com",
        "intercom.io",
        "intercomcdn.com",
        "crisp.chat",
        "static.crisp.chat",
        "clarity.ms",
        "segment.io",
        "segment.com",
        "amplitude.com",
        "sentry.io",
        "adsystem.com",
        "googlesyndication.com",
        "googleadservices.com"
    ];

    await context.route("**/*", async route => {
        const request = route.request();
        const type = request.resourceType();
        const url = request.url().toLowerCase();

        if (type === "media" || type === "font") {
            return route.abort();
        }

        if (BLOCK_IMAGES && type === "image") {
            return route.abort();
        }

        if (blockedHosts.some(host => url.includes(host))) {
            return route.abort();
        }

        return route.continue();
    });

    console.log(`Modo ligero activo. BLOCK_IMAGES=${BLOCK_IMAGES}`);
}

async function startBrowser() {
    if (startingBrowser || browserAlive()) return;

    startingBrowser = true;

    try {
        await cleanupBrowserObjects();

        console.log("==================================");
        console.log("Iniciando Chromium ligero");
        console.log("TARGET_URL:", TARGET_URL);
        console.log(`VIEWPORT: ${WIDTH}x${HEIGHT}`);
        console.log("==================================");

        browser = await chromium.launch({
            headless: false,
            chromiumSandbox: false,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--renderer-process-limit=1",
                "--process-per-site",
                "--disable-extensions",
                "--disable-component-extensions-with-background-pages",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-sync",
                "--disable-translate",
                "--disable-notifications",
                "--disable-popup-blocking",
                "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,InterestFeedContentSuggestions,NotificationTriggers,PaintHolding,BackForwardCache",
                "--metrics-recording-only",
                "--no-first-run",
                "--no-default-browser-check",
                "--no-service-autorun",
                "--password-store=basic",
                "--use-mock-keychain",
                `--window-size=${WIDTH},${HEIGHT}`,
                "--window-position=0,0"
            ]
        });

        browser.on("disconnected", () => {
            browser = null;
            context = null;
            page = null;
            cdp = null;

            console.error("Chromium se desconectó.");
            scheduleRestart("browser disconnected");
        });

        const contextOptions = {
            viewport: { width: WIDTH, height: HEIGHT },
            screen: { width: WIDTH, height: HEIGHT }
        };

        const statePath = getInitialStatePath();

        if (statePath) {
            console.log("Cargando storage state:", statePath);
            contextOptions.storageState = statePath;
        }

        context = await browser.newContext(contextOptions);

        await installLightweightRouting();

        const cookieData = readJSON(COOKIES_PATH);

        if (cookieData) {
            const cookies = Array.isArray(cookieData)
                ? cookieData
                : cookieData.cookies;

            if (Array.isArray(cookies) && cookies.length) {
                const normalized = cookies.map(cookie => {
                    const c = { ...cookie };

                    if (typeof c.sameSite === "string") {
                        const value = c.sameSite.toLowerCase();

                        if (value === "lax") c.sameSite = "Lax";
                        else if (value === "strict") c.sameSite = "Strict";
                        else if (value === "none" || value === "no_restriction") c.sameSite = "None";
                        else delete c.sameSite;
                    }

                    return c;
                });

                try {
                    await context.addCookies(normalized);
                    console.log(`Cookies añadidas: ${normalized.length}`);
                } catch (err) {
                    console.error("Error cargando cookies:", err.message);
                }
            }
        }

        const localStorageData = getInitialLocalStorage();

        if (localStorageData && typeof localStorageData === "object") {
            await context.addInitScript(storage => {
                try {
                    for (const [key, value] of Object.entries(storage)) {
                        localStorage.setItem(key, String(value));
                    }
                } catch {}
            }, localStorageData);

            console.log(`localStorage preparado: ${Object.keys(localStorageData).length} claves`);
        }

        await createMainPage();
        await navigate();

        console.log("Chromium iniciado correctamente.");
        await logMemory();
        await takeScreenshot();

    } catch (err) {
        console.error(
            "Error iniciando Chromium:",
            err?.stack || err?.message || String(err)
        );

        await cleanupBrowserObjects();
        scheduleRestart("launch failure");
    } finally {
        startingBrowser = false;
    }
}

async function createMainPage() {
    if (!contextAlive()) return;

    page = await context.newPage();

    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(30000);

    try {
        cdp = await context.newCDPSession(page);
        await cdp.send("Page.enable");
    } catch (err) {
        console.error("No se pudo crear sesión CDP:", err.message);
        cdp = null;
    }

    page.on("pageerror", err => {
        console.error("[PAGE ERROR]", err.message);
    });

    page.on("crash", () => {
        console.error("La pestaña Chromium hizo crash.");
        page = null;
        cdp = null;
        scheduleRestart("page crash");
    });

    page.on("close", () => {
        page = null;
        cdp = null;

        if (browserAlive()) {
            scheduleRestart("page closed");
        }
    });

    page.on("framenavigated", frame => {
        if (!pageAlive()) return;
        if (frame !== page.mainFrame()) return;

        const currentUrl = page.url();

        console.log("Navegación:", currentUrl);

        if (
            currentUrl.includes("/game") ||
            currentUrl.includes("/dashboard") ||
            currentUrl.includes("/marketplace") ||
            currentUrl.includes("/achievements")
        ) {
            setTimeout(() => saveEverything(), 1500);
        }
    });
}

async function navigate() {
    if (!pageAlive()) return;

    console.log("Abriendo:", TARGET_URL);

    try {
        await page.goto(TARGET_URL, {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        console.log("Página cargada:", page.url());
    } catch (err) {
        if (!pageAlive()) {
            scheduleRestart("crash durante navegación");
            return;
        }

        console.error("Navegación incompleta:", err.message);
    }
}

async function takeScreenshot() {
    if (takingScreenshot || !pageAlive()) return;

    takingScreenshot = true;

    try {
        if (!cdp) {
            cdp = await context.newCDPSession(page);
            await cdp.send("Page.enable");
        }

        const result = await cdp.send("Page.captureScreenshot", {
            format: "jpeg",
            quality: 45,
            fromSurface: true,
            captureBeyondViewport: false
        });

        fs.writeFileSync(
            SCREENSHOT_PATH,
            Buffer.from(result.data, "base64")
        );

        console.log(
            "Screenshot CDP actualizado:",
            new Date().toISOString()
        );

    } catch (err) {
        console.error("Error screenshot CDP:", err.message);

        if (!pageAlive()) {
            scheduleRestart("crash durante screenshot");
        }
    } finally {
        takingScreenshot = false;
    }
}

async function saveLocalStorage() {
    if (!pageAlive()) return false;

    try {
        const data = await page.evaluate(() => {
            const result = {};

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);

                if (key !== null) {
                    result[key] = localStorage.getItem(key);
                }
            }

            return result;
        });

        const dir = PERSISTENT_LOCAL_STORAGE_PATH.substring(
            0,
            PERSISTENT_LOCAL_STORAGE_PATH.lastIndexOf("/")
        );

        fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(
            PERSISTENT_LOCAL_STORAGE_PATH,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        console.log(`localStorage guardado: ${Object.keys(data).length} claves`);

        return true;

    } catch (err) {
        console.error("Error guardando localStorage:", err.message);
        return false;
    }
}

async function saveStorageState() {
    if (!contextAlive()) return false;

    try {
        const dir = PERSISTENT_STATE_PATH.substring(
            0,
            PERSISTENT_STATE_PATH.lastIndexOf("/")
        );

        fs.mkdirSync(dir, { recursive: true });

        await context.storageState({
            path: PERSISTENT_STATE_PATH
        });

        console.log("storageState guardado:", PERSISTENT_STATE_PATH);

        return true;

    } catch (err) {
        console.error("Error guardando storageState:", err.message);
        return false;
    }
}

async function saveEverything() {
    if (savingState || !contextAlive()) return;

    savingState = true;

    try {
        await saveLocalStorage();
        await saveStorageState();
    } finally {
        savingState = false;
    }
}

async function logMemory() {
    try {
        const status = fs.readFileSync("/proc/meminfo", "utf8");

        const lines = status
            .split("\n")
            .filter(line =>
                line.startsWith("MemTotal:") ||
                line.startsWith("MemAvailable:")
            );

        console.log("Memoria:", lines.join(" | "));
    } catch {}
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new globalThis.URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
    );

    if (
        requestUrl.pathname === "/" ||
        requestUrl.pathname === "/screenshot.jpg"
    ) {
        if (!fs.existsSync(SCREENSHOT_PATH)) {
            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8"
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

    if (requestUrl.pathname === "/status") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            browserConnected: browserAlive(),
            pageAlive: pageAlive(),
            viewport: `${WIDTH}x${HEIGHT}`,
            blockImages: BLOCK_IMAGES,
            screenshotMethod: "CDP",
            persistentState: fs.existsSync(PERSISTENT_STATE_PATH),
            persistentLocalStorage: fs.existsSync(PERSISTENT_LOCAL_STORAGE_PATH)
        }, null, 2));

        return;
    }

    if (requestUrl.pathname === "/save-state") {
        await saveEverything();

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            ok: contextAlive()
        }));

        return;
    }

    if (requestUrl.pathname === "/restart-browser") {
        await saveEverything();
        await cleanupBrowserObjects();

        setTimeout(() => startBrowser(), 500);

        res.writeHead(200, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            ok: true
        }));

        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor HTTP en 0.0.0.0:${PORT}`);
    startBrowser();
});

setInterval(takeScreenshot, SCREENSHOT_INTERVAL_MS);
setInterval(saveEverything, SAVE_INTERVAL_MS);
setInterval(logMemory, 120000);

process.on("SIGTERM", async () => {
    await saveEverything();
    await cleanupBrowserObjects();
    process.exit(0);
});

process.on("SIGINT", async () => {
    await saveEverything();
    await cleanupBrowserObjects();
    process.exit(0);
});
