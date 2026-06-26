const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
app.post("/create-checkout-session", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: "https://animaldetox.eu/success",
      cancel_url: "https://animaldetox.eu/cancel"
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

// 📁 upload config
const upload = multer({ dest: "uploads/" });

// 🔐 Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 🟢 TEST SERVER
app.get("/", (req, res) => {
  res.send("🐾 Animal Detox Gemini OK");
});

// 🧪 TEST API
app.get("/test", (req, res) => {
  res.json({ ok: true });
});

// 🧠 ANALYSE IMAGE
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        object: "no_file",
        risk: "UNKNOWN",
        explanation: "Aucune image envoyée",
        action: "Envoyer une image"
      });
    }

    // 📸 image base64
    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64"
    });

    // 🧠 GEMINI CALL
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: imageBase64
          }
        },
        {
          text: `
Tu es un vétérinaire expert.

Analyse cette image et réponds UNIQUEMENT en JSON valide.

Ne mets aucun texte, aucun markdown, aucun \`\`\`.

Format obligatoire :

{
  "object": "nom de l'objet",
  "risk": "LOW | MEDIUM | HIGH | CRITICAL",
  "explanation": "explication simple pour chien/chat",
  "action": "conseil clair"
}

Règles :
- Si dangereux pour animal → HIGH ou CRITICAL
- Sinon → LOW
- Réponse STRICTEMENT JSON
`
        }
      ]
    });

    fs.unlinkSync(req.file.path);

    let text = response.text;

    // 🧹 CLEAN RESPONSE GEMINI (IMPORTANT)
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let json;

    try {
      json = JSON.parse(text);
    } catch (e) {
      return res.json({
        object: "unknown",
        risk: "UNKNOWN",
        explanation: text,
        action: "format error"
      });
    }

    res.json(json);

  } catch (err) {
    console.log("❌ ERROR:", err);

    res.status(500).json({
      object: "server_error",
      risk: "UNKNOWN",
      explanation: err.message,
      action: "check logs"
    });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Animal Detox running on port", PORT);
});
