const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const https = require('https');
const axios = require('axios');
const { twiml: { VoiceResponse } } = require('twilio');

dotenv.config();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const {
    ULTRAVOX_API_KEY,
    GEMINI_API_KEY
} = process.env;

if (!ULTRAVOX_API_KEY || !GEMINI_API_KEY) {
    console.error("❌ Missing ULTRAVOX_API_KEY or GEMINI_API_KEY in environment");
    process.exit(1);
}

const ULTRAVOX_API_URL = 'https://api.ultravox.ai/api/calls';
const JOB_DESC_URL = 'https://funnl.team/fleetexpinc/noncdll20/Jobdetails';

// 📌 Gemini API call to generate job summary
async function getGeminiSummaryFromURL(url) {
    const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';
    const prompt = `Summarize the job description from this link in a recruiter-friendly tone. Keep it informative and don't miss any important details:\n\n${url}`;

    try {
        const response = await axios.post(`${endpoint}?key=${GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        const summary = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("✅ Gemini summary retrieved.");
        return summary || "Job description is currently unavailable.";
    } catch (err) {
        console.error("❌ Gemini error:", err.response?.data || err.message);
        return "Job description is currently unavailable.";
    }
}

// 🧠 Build the system prompt dynamically
async function buildSystemPrompt() {
    const jobSummary = await getGeminiSummaryFromURL(JOB_DESC_URL);

    return `

You are RecruitAI, a professional, polite, and intelligent recruiter assistant from FedEx. You are screening candidates for the Non CDL/L20 position. Your tone should be formal yet human, steady in pace, and attentive to the candidate. Avoid repeating questions unless necessary. Pause after each question to allow the candidate to respond fully.

Here is the job summary (use for reference only if asked):
${jobSummary}

You are handling **incoming calls** from candidates. Please follow this structured call flow.

---

🟪 **Step 0: Email Capture, Confirmation, and OTP Verification**

1. Greet the candidate and ask:  
   “To proceed, may I have your email address for verification purposes?”

2. Save response as {email}.  
3. Spell back the email character by character (including @, dot, underscore) and ask for confirmation:  
   “Just to confirm, I understood your email as: [spell out {email}]. Is that correct?”

4. If confirmed:
   - Call tool "send_verification_email" with input {email}.
   - Say: “Thank you! I’ve just sent a 4-digit verification code to your email. Please check and let me know the OTP.”
   - Save reply as {otp1}.
   - If {otp1} is “1234”: say “Perfect! Your email is verified.” and continue to Step 1.
   - Else: say “That doesn’t seem right. Please try again carefully.”  
     - Save second reply as {otp2}.
     - If {otp2} is “1234”: say “Great, we’re good now.” and continue to Step 1.
     - Else: say “Still no match. I’m resending the verification email now.”
       - Call tool "send_verification_email" again with {email}.
       - Save reply as {otp3}.
       - If {otp3} is “1234”: say “Awesome, you’re verified now.” and continue to Step 1.
       - Else: say “That didn’t work either. No worries — we’ll verify later. Let’s move ahead.”

5. If they say spelling was incorrect:
   - Ask: “Thanks for clarifying. Could you please spell your email address slowly, one character at a time — including at-sign (@), dot (.), underscore (_)?”
   - Save as {spelledEmail}, then confirm again and repeat Step 4.

---

🟪 **Step 1: Prescreening Questions**

A. Ask: “Have you worked for FedEx before?”  
→ If YES:
   - Ask: what role (driver/other) and last working day.
   - If driver:
     - Ask for FedEx ID, contractor name, terminal address, and reason for leaving.
   - If not a driver, continue.
   - If other driving experience, ask for company, position, duration, and driving type.

B. If FedEx-experienced: Ask: “Was your last working day within the past 3 months?”

C. Ask: “Do you have a valid DOT Medical Card (MEC)?”  
→ If YES: “Please take a clear photo and send it to [Phone Number].”  
→ If NO: “No problem — we’ll provide paperwork to help you get one.”

D. Ask: “Are you 21 years of age or older?”  
→ If 50 or older: “You’ll receive a video interview link shortly. Please complete it at your convenience.”

E. Ask: “Do you have reliable transportation to get to the job site?”  
→ If NO: Ask for current address to check proximity.

F. Ask: “Are you currently working?”  
→ If YES: Ask why they’re switching.  
  - If part-time: “This role requires full-time and weekend availability. Would that work for you?”  
→ If NO: Ask for reason and duration of employment gap.

G. Ask: “Are you confident you can pass a background check, drug screening, and physical?”  
→ If drug use mentioned: “These checks are mandatory for all candidates.”

H. If FedEx-experienced: Ask about prior accidents, complaints, terminations, or attendance issues.

---

🟪 **Step 2: Confirm & Wrap-Up**

- Thank the candidate.
- Confirm captured details verbally.
- Say:  
  “Thanks again for your time. We’ll now process your application and get back to you shortly.”

- Store all responses in memory.
- Call internal API tool to submit data if available.

---

🧠 Agent Guidelines:
- Speak clearly and naturally.
- Do not repeat unless there's a mismatch.
- Be empathetic and calm throughout the call.
- If unsure, pause and confirm with the candidate.

`;
}

// 🔄 Create Ultravox call session
async function createUltravoxCall(systemPrompt) {
    const config = {
        systemPrompt,
        model: 'fixie-ai/ultravox',
        temperature: 0.3,
        firstSpeaker: 'FIRST_SPEAKER_CALLER',
        medium: { twilio: {} },
        voice: 'dae96454-8512-47d5-9248-f5d8c0916d2e',
        selectedTools: [
            { toolId: "aef14f7e-cd13-4ecd-9877-724e4537dd44" }
        ]
    };

    return new Promise((resolve, reject) => {
        const req = https.request(ULTRAVOX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            }
        });

        let responseData = '';
        req.on('response', res => {
            res.on('data', chunk => (responseData += chunk));
            res.on('end', () => {
    try {
        const parsed = JSON.parse(responseData);
        console.log("📦 Ultravox raw response:", parsed); // 👈 ADD THIS LINE
        resolve(parsed);
    } catch (err) {
        console.error("❌ Failed to parse Ultravox response:", responseData);
        reject(`Parse error: ${responseData}`);
    }
});

        });

        req.on('error', reject);
        req.write(JSON.stringify(config));
        req.end();
    });
}

// 📞 Twilio will hit this when a call arrives
app.post('/incoming', async (req, res) => {
    try {
        console.log("📞 Incoming call from:", req.body.From || "Unknown Caller");
        const systemPrompt = await buildSystemPrompt();
        const { joinUrl } = await createUltravoxCall(systemPrompt);

        const response = new VoiceResponse();
        if (joinUrl) {
            response.connect().stream({ url: joinUrl });
        } else {
            console.warn("⚠️ No joinUrl received from Ultravox.");
            response.say("We are experiencing issues with our assistant. Please try again later.");
        }

        res.type('text/xml').send(response.toString());
    } catch (err) {
        console.error("❌ Error during call setup:", err);
        const fallback = new VoiceResponse();
        fallback.say("We're currently unavailable. Please try again later.");
        res.type('text/xml').send(fallback.toString());
    }
});

// ✅ Health check endpoint
app.get('/', (req, res) => {
    res.send('✅ Incoming call handler is running.');
});

// 🔥 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
