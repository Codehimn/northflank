import { chromium } from "playwright";
import http from "http";
import fs from "fs";

const PORT = process.env.PORT || 3000;
const URL = process.env.TARGET_URL || "https://rollercoin.com/game";

const SCREENSHOT_PATH = "/tmp/screenshot.jpg";

const STORAGE_STATE_PATH = "./storageState.json";
const COOKIES_PATH = "./cookies.json";
const LOCAL_STORAGE_PATH = "./localStorage.json";

let browser;
let context;
let page;
let takingScreenshot = false;


// =====================================
// LEER JSON DE FORMA SEGURA
// =====================================

function readJSON(path) {
    try {
        if (!fs.existsSync(path)) {
            return null;
        }

        return JSON.parse(
            fs.readFileSync(path, "utf8")
        );

    } catch (err) {
        console.error(
            `Error leyendo ${path}:`,
            err.message
        );

        return null;
    }
}


// =====================================
// INICIAR BROWSER
// =====================================

async function startBrowser() {

    console.log("Iniciando Chromium...");

    browser = await chromium.launch({
        headless: true,

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


    // =====================================
    // STORAGE STATE
    // =====================================

    const storageStateExists =
        fs.existsSync(STORAGE_STATE_PATH);

    if (storageStateExists) {

        console.log(
            "Cargando storageState.json..."
        );

        context = await browser.newContext({
            storageState: STORAGE_STATE_PATH,

            viewport: {
                width: 1280,
                height: 720
            }
        });

        console.log(
            "storageState.json cargado"
        );

    } else {

        console.log(
            "No existe storageState.json"
        );

        context = await browser.newContext({
            viewport: {
                width: 1280,
                height: 720
            }
        });

    }


    // =====================================
    // COOKIES EXTRA
    // =====================================

    const cookieData = readJSON(
        COOKIES_PATH
    );

    if (cookieData) {

        try {

            const cookies =
                Array.isArray(cookieData)
                    ? cookieData
                    : cookieData.cookies;

            if (
                Array.isArray(cookies) &&
                cookies.length > 0
            ) {

                await context.addCookies(
                    cookies
                );

                console.log(
                    `Cookies añadidas: ${cookies.length}`
                );

            }

        } catch (err) {

            console.error(
                "Error cargando cookies:",
                err.message
            );

        }

    } else {

        console.log(
            "No existe cookies.json"
        );

    }


    // =====================================
    // LOCAL STORAGE
    // =====================================

    const localStorageData =
        readJSON(LOCAL_STORAGE_PATH);

    if (localStorageData) {

        console.log(
            `localStorage encontrado: ${
                Object.keys(localStorageData).length
            } claves`
        );

        /*
         * Este script se ejecuta ANTES
         * del JavaScript de la página.
         *
         * Así RollerCoin ya ve token,
         * refreshToken, fpdata, etc.
         * cuando comienza a cargar.
         */

        await context.addInitScript(
            (storage) => {

                try {

                    for (
                        const [key, value]
                        of Object.entries(storage)
                    ) {

                        window.localStorage.setItem(
                            key,
                            String(value)
                        );

                    }

                } catch (err) {

                    console.error(
                        "Error inyectando localStorage",
                        err
                    );

                }

            },
            localStorageData
        );

        console.log(
            "localStorage preparado para inyección"
        );

    } else {

        console.log(
            "No existe localStorage.json"
        );

    }


    // =====================================
    // CREAR PÁGINA
    // =====================================

    page = await context.newPage();

    page.setDefaultNavigationTimeout(
        120000
    );

    page.setDefaultTimeout(
        60000
    );


    // =====================================
    // DEBUG DE NAVEGACIÓN
    // =====================================

    page.on("console", msg => {
        console.log(
            `[BROWSER ${msg.type()}]`,
            msg.text()
        );
    });

    page.on("pageerror", err => {
        console.error(
            "[PAGE ERROR]",
            err.message
        );
    });


    // =====================================
    // ABRIR WEB
    // =====================================

    console.log(
        "Abriendo:",
        URL
    );

    try {

        await page.goto(
            URL,
            {
                waitUntil: "domcontentloaded",
                timeout: 120000
            }
        );

        console.log(
            "Página cargada:",
            page.url()
        );

        await page.waitForTimeout(
            10000
        );


        // =====================================
        // COMPROBAR LOCAL STORAGE
        // =====================================

        const localStorageKeys =
            await page.evaluate(() => {

                return Object.keys(
                    window.localStorage
                );

            });

        console.log(
            `localStorage activo: ${localStorageKeys.length} claves`
        );

        console.log(
            "Claves:",
            localStorageKeys
        );


    } catch (err) {

        console.error(
            "Error navegación:",
            err.message
        );

    }


    await takeScreenshot();

}


// =====================================
// SCREENSHOT
// =====================================

async function takeScreenshot() {

    if (
        !page ||
        takingScreenshot
    ) {
        return;
    }

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

        console.log(
            "Screenshot actualizado"
        );

    } catch (err) {

        console.error(
            "Error screenshot:",
            err.message
        );

    } finally {

        takingScreenshot = false;

    }

}


// =====================================
// SERVIDOR WEB
// =====================================

const server = http.createServer(
    async (req, res) => {

        // =====================================
        // SCREENSHOT
        // =====================================

        if (
            req.url === "/" ||
            req.url === "/screenshot.jpg"
        ) {

            if (
                !fs.existsSync(
                    SCREENSHOT_PATH
                )
            ) {

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            "text/plain"
                    }
                );

                res.end(
                    "Esperando primer screenshot..."
                );

                return;
            }

            res.writeHead(
                200,
                {
                    "Content-Type":
                        "image/jpeg",

                    "Cache-Control":
                        "no-store, no-cache, must-revalidate"
                }
            );

            fs.createReadStream(
                SCREENSHOT_PATH
            ).pipe(res);

            return;
        }


        // =====================================
        // STATUS
        // =====================================

        if (
            req.url === "/status"
        ) {

            let browserData = null;

            if (page) {

                try {

                    browserData =
                        await page.evaluate(
                            () => ({
                                url:
                                    location.href,

                                title:
                                    document.title,

                                localStorageKeys:
                                    Object.keys(
                                        localStorage
                                    )
                            })
                        );

                } catch {
                    browserData = null;
                }

            }

            res.writeHead(
                200,
                {
                    "Content-Type":
                        "application/json"
                }
            );

            res.end(
                JSON.stringify(
                    {
                        running:
                            !!browser,

                        page:
                            browserData,

                        files: {
                            storageState:
                                fs.existsSync(
                                    STORAGE_STATE_PATH
                                ),

                            cookies:
                                fs.existsSync(
                                    COOKIES_PATH
                                ),

                            localStorage:
                                fs.existsSync(
                                    LOCAL_STORAGE_PATH
                                )
                        },

                        screenshot:
                            fs.existsSync(
                                SCREENSHOT_PATH
                            )
                    },
                    null,
                    2
                )
            );

            return;
        }


        res.writeHead(404);
        res.end("Not found");

    }
);


// =====================================
// INICIAR SERVIDOR
// =====================================

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


// =====================================
// SCREENSHOT CADA MINUTO
// =====================================

setInterval(
    takeScreenshot,
    60_000
);
