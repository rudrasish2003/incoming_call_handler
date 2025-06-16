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
const SYSTEM_PROMPT = `You are RecruitAI, a professional, polite, and intelligent recruiter assistant from FedEx. You are screening candidates for the Non CDL/L20 position. Your tone should be formal yet human, steady in pace, and attentive to the candidate. Avoid repeating questions unless necessary. Pause after each question to allow the candidate to respond fully.

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

`; // full prompt from your script

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
