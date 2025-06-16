const express = require('express');
const bodyParser = require('body-parser');
const https = require('https');
const dotenv = require('dotenv');
const { twiml: { VoiceResponse } } = require('twilio');

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

const {
    ULTRAVOX_API_KEY,
    TWILIO_PHONE_NUMBER
} = process.env;

// Paste your full system prompt here
const SYSTEM_PROMPT = `You are RecruitAI, a professional...`; // full prompt from your script

const ULTRAVOX_CALL_CONFIG = {
    systemPrompt: SYSTEM_PROMPT,
    model: 'fixie-ai/ultravox',
    temperature: 0.3,
    firstSpeaker: 'FIRST_SPEAKER_CALLER',
    medium: { twilio: {} },
    voice: 'dae96454-8512-47d5-9248-f5d8c0916d2e',
    selectedTools: [
        {
            toolId: "aef14f7e-cd13-4ecd-9877-724e4537dd44"
        }
    ]
};

async function createUltravoxCall() {
    return new Promise((resolve, reject) => {
        const request = https.request('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            }
        });

        let data = '';

        request.on('response', (response) => {
            response.on('data', chunk => (data += chunk));
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error(`Ultravox response parse error: ${data}`));
                }
            });
        });

        request.on('error', reject);
        request.write(JSON.stringify(ULTRAVOX_CALL_CONFIG));
        request.end();
    });
}

app.post('/incoming', async (req, res) => {
    try {
        const { joinUrl } = await createUltravoxCall();
        if (!joinUrl) throw new Error("Ultravox did not return a joinUrl.");

        const response = new VoiceResponse();
        response.connect().stream({ url: joinUrl });

        res.type('text/xml');
        res.send(response.toString());
    } catch (error) {
        console.error('❌ Incoming call error:', error.message);
        const fallback = new VoiceResponse();
        fallback.say("We are experiencing issues. Please try again later.");
        res.type('text/xml');
        res.send(fallback.toString());
    }
});

app.get('/', (req, res) => {
    res.send('✅ Ultravox Incoming Call Handler is running.');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
