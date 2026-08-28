import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = Number(process.env.PORT || 3000);
const URL = process.env.TARGET_URL || "https://rollercoin.com/sign-in";

const SCREENSHOT_PATH = "/tmp/screenshot.jpg";
const STORAGE_STATE_PATH = "./storageState.json";
const COOKIES_PATH = "./cookies.json";
const LOCAL_STORAGE_PATH = "./localStorage.json";
const PERSISTENT_STATE_PATH =
    process.env.PERSISTENT_STATE_PATH || "/data/storageState.json";

let browser = null;
let context = null;
let page = null;

let takingScreenshot = false;
let savingState = false;
let startingBrowser = false;
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
    if (fs.existsSync(PERSISTENT_STATE_PATH)) {
        return PERSISTENT_STATE_PATH;
    }

    if (fs.existsSync(STORAGE_STATE_PATH)) {
        return STORAGE_STATE_PATH;
    }

    return null;
}

function scheduleRestart(reason = "desconocido") {
    if (restartTimer || startingBrowser) return;

    console.error(`Chromium no está disponible. Reinicio programado. Motivo: ${reason}`);

    restartTimer = setTimeout(async () => {
        restartTimer = null;
        await startBrowser();
    }, 5000);
}

async function cleanupBrowserObjects() {
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

async function startBrowser() {
    if (startingBrowser || browserAlive()) return;

    startingBrowser = true;

    try {
        await cleanupBrowserObjects();

        console.log("==================================");
        console.log("Iniciando Chromium visible");
        console.log("DISPLAY:", process.env.DISPLAY);
        console.log("TARGET_URL:", URL);
        console.log("==================================");

        browser = await chromium.launch({
            headless: false,
            chromiumSandbox: false,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",

                // Evita /dev/shm pequeño en contenedores.
                "--disable-dev-shm-usage",

                // Reducir consumo gráfico.
                "--disable-gpu",
                "--disable-software-rasterizer",

                // Reducir procesos para un contenedor de RAM limitada.
                "--renderer-process-limit=1",

                "--disable-extensions",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-sync",
                "--disable-translate",
                "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
                "--metrics-recording-only",
                "--no-first-run",
                "--no-default-browser-check",
                "--no-service-autorun",
                "--password-store=basic",
                "--use-mock-keychain",

                "--window-position=0,0",
                "--window-size=1280,720"
            ]
        });

        browser.on("disconnected", () => {
            console.error("Chromium se cerró o fue terminado por el sistema.");
            browser = null;
            context = null;
            page = null;
            scheduleRestart("browser disconnected");
        });

        const statePath = getInitialStatePath();

        const contextOptions = {
            viewport: {
                width: 1280,
                height: 720
            },
            screen: {
                width: 1280,
                height: 720
            }
        };

        if (statePath) {
            console.log("Cargando storage state:", statePath);
            contextOptions.storageState = statePath;
        } else {
            console.log("No se encontró storageState previo.");
        }

        context = await browser.newContext(contextOptions);

        const cookieData = readJSON(COOKIES_PATH);

        if (cookieData) {
            const cookies = Array.isArray(cookieData)
                ? cookieData
                : cookieData.cookies;

            if (Array.isArray(cookies) && cookies.length) {
                try {
                    await context.addCookies(cookies);
                    console.log(`Cookies añadidas: ${cookies.length}`);
                } catch (err) {
                    console.error("Error cargando cookies.json:", err.message);
                }
            }
        }

        const localStorageData = readJSON(LOCAL_STORAGE_PATH);

        if (localStorageData && typeof localStorageData === "object") {
            console.log(
                `Preparando localStorage: ${Object.keys(localStorageData).length} claves`
            );

            await context.addInitScript((storage) => {
                try {
                    for (const [key, value] of Object.entries(storage)) {
                        window.localStorage.setItem(key, String(value));
                    }
                } catch {}
            }, localStorageData);
        }

        page = await context.newPage();

        page.setDefaultNavigationTimeout(120000);
        page.setDefaultTimeout(60000);

        page.on("pageerror", err => {
            console.error("[PAGE ERROR]", err.message);
        });

        page.on("close", () => {
            console.error("La pestaña principal fue cerrada.");
            page = null;

            if (browserAlive()) {
                createReplacementPage().catch(err => {
                    console.error("No se pudo recrear la pestaña:", err.message);
                });
            }
        });

        await navigateCurrentPage();

        console.log("Chromium iniciado correctamente.");
        await logMemory();
        await takeScreenshot();

    } catch (err) {
        console.error("Fallo iniciando Chromium/Playwright:");
        console.error(err?.stack || err?.message || String(err));

        await cleanupBrowserObjects();
        scheduleRestart("launch failure");
    } finally {
        startingBrowser = false;
    }
}

async function createReplacementPage() {
    if (!contextAlive() || pageAlive()) return;

    page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(60000);

    page.on("close", () => {
        page = null;
    });

    await navigateCurrentPage();
}

async function navigateCurrentPage() {
    if (!pageAlive()) return;

    console.log("Abriendo:", URL);

    try {
        await page.goto(URL, {
            waitUntil: "domcontentloaded",
            timeout: 120000
        });

        console.log("Página cargada:", page.url());
    } catch (err) {
        if (/Target page|context or browser has been closed/i.test(err.message)) {
            console.error("Chromium se cerró durante la navegación.");
            scheduleRestart("closed during navigation");
            return;
        }

        // Un timeout no implica necesariamente que la página sea inutilizable.
        console.error("Navegación incompleta:", err.message);
    }
}

async function takeScreenshot() {
    if (takingScreenshot) return;

    if (!pageAlive()) {
        if (!browserAlive()) scheduleRestart("screenshot without browser");
        return;
    }

    takingScreenshot = true;

    try {
        await page.screenshot({
            path: SCREENSHOT_PATH,
            type: "jpeg",
            quality: 60,
            timeout: 20000
        });

        console.log("Screenshot actualizado:", new Date().toISOString());
    } catch (err) {
        if (!pageAlive() || !browserAlive()) {
            scheduleRestart("browser closed during screenshot");
        } else {
            console.error("Error screenshot:", err.message);
        }
    } finally {
        takingScreenshot = false;
    }
}

async function saveCurrentState() {
    if (savingState || !contextAlive()) return;

    savingState = true;

    try {
        const slash = PERSISTENT_STATE_PATH.lastIndexOf("/");
        const dir = slash > 0 ? PERSISTENT_STATE_PATH.slice(0, slash) : null;

        if (dir) fs.mkdirSync(dir, { recursive: true });

        await context.storageState({
            path: PERSISTENT_STATE_PATH
        });

        console.log("Storage state guardado:", PERSISTENT_STATE_PATH);
    } catch (err) {
        if (!contextAlive()) {
            scheduleRestart("browser closed during storageState");
        } else {
            console.error("Error guardando storage state:", err.message);
        }
    } finally {
        savingState = false;
    }
}

async function logMemory() {
    try {
        const status = fs.readFileSync("/proc/meminfo", "utf8");
        const keep = status
            .split("\n")
            .filter(line =>
                line.startsWith("MemTotal:") ||
                line.startsWith("MemAvailable:")
            )
            .join(" | ");

        console.log("Memoria:", keep);
    } catch {}
}

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (
        requestUrl.pathname === "/" ||
        requestUrl.pathname === "/screenshot.jpg"
    ) {
        if (!fs.existsSync(SCREENSHOT_PATH)) {
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
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
        let pageInfo = null;

        if (pageAlive()) {
            try {
                pageInfo = await page.evaluate(() => ({
                    url: location.href,
                    title: document.title,
                    localStorageKeys: Object.keys(localStorage)
                }));
            } catch {}
        }

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            browserConnected: browserAlive(),
            contextAlive: contextAlive(),
            pageAlive: pageAlive(),
            startingBrowser,
            page: pageInfo,
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

    if (requestUrl.pathname === "/save-state") {
        await saveCurrentState();

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            ok: contextAlive(),
            path: PERSISTENT_STATE_PATH
        }, null, 2));

        return;
    }

    if (requestUrl.pathname === "/restart-browser") {
        await cleanupBrowserObjects();
        setTimeout(() => startBrowser(), 500);

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            ok: true,
            message: "Reinicio de Chromium solicitado"
        }, null, 2));

        return;
    }

    res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor HTTP escuchando en 0.0.0.0:${PORT}`);
    startBrowser();
});

// Menos trabajo periódico para un contenedor con poca RAM.
setInterval(takeScreenshot, 60_000);
setInterval(saveCurrentState, 5 * 60_000);
setInterval(logMemory, 60_000);

process.on("SIGTERM", async () => {
    console.log("SIGTERM recibido.");
    await saveCurrentState();
    await cleanupBrowserObjects();
    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("SIGINT recibido.");
    await saveCurrentState();
    await cleanupBrowserObjects();
    process.exit(0);
});
