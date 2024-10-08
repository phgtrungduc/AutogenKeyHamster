const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');

const promoLoginUrl = "https://api.gamepromo.io/promo/login-client";
const registerEventUrl = "https://api.gamepromo.io/promo/register-event";
const createCodeUrl = "https://api.gamepromo.io/promo/create-code";

const lock = new Set(); 

function loadAppTokens(filename) {
    const appTokenData = [];
    try {
        const data = fs.readFileSync(filename, 'utf8');
        const lines = data.split('\n');
        lines.forEach(line => {
            const parts = line.trim().split('|');
            if (parts.length === 3) {
                appTokenData.push({
                    appToken: parts[0].trim(),
                    promoId: parts[1].trim(),
                    eventType: parts[2].trim()
                });
            } else {
                console.log(`Invalid format in line: ${line.trim()}`);
            }
        });
    } catch (err) {
        console.log(`File ${filename} not found.`);
    }
    return appTokenData;
}

function generateRandomString(length) {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
}

async function getBearerToken(appToken) {
    const loginPayload = {
        appToken: appToken,
        clientId: generateRandomString(37),
        clientOrigin: "android",
        clientVersion: "2.4.9"
    };
    try {
        const response = await axios.post(promoLoginUrl, loginPayload);
        return response.data.clientToken || null;
    } catch (error) {
        return null;
    }
}

async function sendEventRequest(bearerToken, promoId, eventType) {
    const eventPayload = {
        promoId: promoId,
        eventId: generateRandomString(37),
        eventType: eventType,
        eventOrigin: "undefined"
    };
    const headers = {
        "User-Agent": "UnityPlayer/2022.3.28f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`
    };

    while (true) {
        try {
            const response = await axios.post(registerEventUrl, eventPayload, { headers });
            
            if (response.status === 400) {
                await delay(120000);
            } else if (response.data.hasCode) {
                if (await createCodeRequest(bearerToken, promoId)) {
                    return true;
                }
            } else {
                await delay(15000);
            }
        } catch (error) {
            await delay(5000); 
        }
    }
}


async function createCodeRequest(bearerToken, promoId) {
    const createCodePayload = { promoId: promoId };
    const headers = {
        "User-Agent": "UnityPlayer/2022.3.28f1 (UnityWebRequest/1.0, libcurl/8.5.0-DEV)",
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${bearerToken}`
    };
    try {
        const response = await axios.post(createCodeUrl, createCodePayload, { headers });
        
        const rawData = response.data;
        const match = rawData.match(/{"promoCode":"([^"]+)"}/);
        
        if (match && match[1]) {
            const promoCode = match[1];
            if (!lock.has(promoCode)) {
                lock.add(promoCode);
                console.log(`Promo Code: ${promoCode}`);
                fs.appendFileSync('code.txt', `${promoCode}\n`);
            }
            return true;
        } else {
            console.log("Không tìm thấy promoCode trong response");
            return false;
        }
    } catch (error) {
        console.error("Lỗi khi gọi API:", error);
        return false;
    }
}

async function processAppToken(appToken, promoId, eventType) {
    const bearerToken = await getBearerToken(appToken);
    if (bearerToken) {
        while (true) {
            const hasCode = await sendEventRequest(bearerToken, promoId, eventType);
            if (hasCode) {
                break;
            }
        }
    }
}

async function mainLoop() {
    while (true) {
        const appTokensData = loadAppTokens("app_token.txt");
        if (appTokensData.length === 0) {
            console.log("No valid app tokens found.");
            return;
        }

        const promises = appTokensData.map(data =>
            processAppToken(data.appToken, data.promoId, data.eventType)
        );

        await Promise.all(promises);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', () => {
    console.log("Program stopped.");
    process.exit();
});

mainLoop();
