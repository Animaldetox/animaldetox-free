const { createClient } = require("@supabase/supabase-js");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const Stripe = require("stripe");
const { GoogleGenAI } = require("@google/genai");

// ======================
// APP INIT
// ======================
const app = express();

app.use(cors());
app.use(express.json());

// ======================
// ENV INIT (IMPORTANT)
// ======================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ======================
// UPLOAD CONFIG
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// ROUTES TEST
// ======================
app.get("/", (req, res) => {
  res.send("🐾 Animal Detox Gemini OK");
});

app.get("/test", (req, res) => {
  res.json({ ok: true });
});

// ======================
// STRIPE CHECKOUT
// ======================
app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: "https://animaldetox.eu/success",
      cancel_url: "https://animaldetox.eu/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ======================
// GEMINI IMAGE ANALYSIS
// ======================
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        object: "no_file",
        risk: "UNKNOWN",
        explanation: "Aucune image envoyée",
        action: "Envoyer une image",
      });
    }

    // read image
    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64",
    });

    // call gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: imageBase64,
          },
        },
        {
          text: `
Tu es un vétérinaire expert.

Analyse cette image et réponds UNIQUEMENT en JSON valide.

Format obligatoire :
{
  "object": "nom de l'objet",
  "risk": "LOW | MEDIUM | HIGH | CRITICAL",
  "explanation": "explication simple pour chien/chat",
  "action": "conseil clair"
}

Règles :
- STRICT JSON uniquement
- Aucun texte hors JSON
`,
        },
      ],
    });

    // delete temp file
    fs.unlinkSync(req.file.path);

    let text = response.text || "";

    // clean response
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      const json = JSON.parse(text);
      return res.json(json);
    } catch (e) {
      return res.json({
        object: "unknown",
        risk: "UNKNOWN",
        explanation: text,
        action: "format error from AI",
      });
    }
  } catch (err) {
    console.error("Gemini error:", err);

    res.status(500).json({
      object: "server_error",
      risk: "UNKNOWN",
      explanation: err.message,
      action: "check logs",
    });
  }
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Animal Detox running on port", PORT);
});
