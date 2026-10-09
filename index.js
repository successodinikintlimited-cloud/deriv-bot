const WebSocket = require('ws');

const APP_ID = "1089";
const API_TOKEN = "Pat_32f122444a553090caa03df4d17e21d70e79e16a5563a3d1fbcdc98dfca36dd8";
const SYMBOL = "R_100";
const STAKE = 10;

const FAST_PERIOD = 5;
const SLOW_PERIOD = 15;
let prices = [];
let currentContract = null;

function calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function startBot() {
    console.log("Connecting to Deriv WebSocket from cloud server...");
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    ws.on('open', () => {
        console.log("Connected! Authorizing...");
        ws.send(JSON.stringify({ authorize: API_TOKEN }));
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);

        if (msg.msg_type === 'authorize') {
            if (msg.error) {
                console.log(`❌ Auth Error: ${msg.error.message}`);
                return;
            }
            console.log(`✅ Authorized! Account: ${msg.authorize.loginid} | Balance: $${msg.authorize.balance}`);
            console.log(`⚡ Subscribing to ${SYMBOL} tick stream...`);
            ws.send(JSON.stringify({ ticks: SYMBOL }));
        }

        if (msg.msg_type === 'tick' && msg.tick && msg.tick.quote) {
            const quote = msg.tick.quote;
            prices.push(quote);
            if (prices.length > 100) prices.shift();

            const fastMA = calculateSMA(prices, FAST_PERIOD);
            const slowMA = calculateSMA(prices, SLOW_PERIOD);

            if (fastMA && slowMA) {
                console.log(`[${new Date().toLocaleTimeString()}] ${SYMBOL}: ${quote.toFixed(2)} | Fast: ${fastMA.toFixed(2)} | Slow: ${slowMA.toFixed(2)}`);

                if (fastMA > slowMA && currentContract !== "RISE") {
                    console.log(`🚀 RISE Signal! Placing CALL trade ($${STAKE})...`);
                    ws.send(JSON.stringify({
                        buy: 1, price: STAKE,
                        parameters: {
                            amount: STAKE, basis: "stake", contract_type: "CALL",
                            currency: "USD", duration: 5, duration_unit: "t", symbol: SYMBOL
                        }
                    }));
                    currentContract = "RISE";
                } else if (fastMA < slowMA && currentContract !== "FALL") {
                    console.log(`🔻 FALL Signal! Placing PUT trade ($${STAKE})...`);
                    ws.send(JSON.stringify({
                        buy: 1, price: STAKE,
                        parameters: {
                            amount: STAKE, basis: "stake", contract_type: "PUT",
                            currency: "USD", duration: 5, duration_unit: "t", symbol: SYMBOL
                        }
                    }));
                    currentContract = "FALL";
                }
            }
        }

        if (msg.msg_type === 'buy') {
            if (msg.error) {
                console.log(`⚠️ Trade Error: ${msg.error.message}`);
            } else {
                console.log(`🎉 TRADE EXECUTED! Contract ID: ${msg.buy.contract_id}`);
            }
        }
    });

    ws.on('error', (err) => console.log(`WebSocket Error: ${err.message}`));
    ws.on('close', () => {
        console.log("Connection closed. Reconnecting in 5s...");
        setTimeout(startBot, 5000);
    });
}

startBot();
