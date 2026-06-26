const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const Stripe = require("stripe");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("@supabase/supabase-js");

// ======================
// APP INIT
// ======================
const app = express();

app.use(cors());
app.use(express.json());

// ⚠️ IMPORTANT: Stripe webhook needs raw body (future upgrade)
app.use(express.urlencoded({ extended: true }));

// ======================
// SERVICES INIT
// ======================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ======================
// UPLOAD
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// TEST
// ======================
app.get("/", (req, res) => {
  res.send("🐾 Animal Detox OK");
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
      success_url: "https://animaldetox.eu/success?email=test",
      cancel_url: "https://animaldetox.eu/cancel",
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// GEMINI ANALYSIS
// ======================
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

    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64"
    });

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
Analyse cette image pour animaux.

Retourne UNIQUEMENT du JSON valide :

{
  "object": "nom",
  "risk": "LOW | MEDIUM | HIGH | CRITICAL",
  "explanation": "...",
  "action": "..."
}
`
        }
      ]
    });

    fs.unlinkSync(req.file.path);

    let text = response.text || "";

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      return res.json(JSON.parse(text));
    } catch (e) {
      return res.json({
        object: "unknown",
        risk: "UNKNOWN",
        explanation: text,
        action: "format error"
      });
    }

  } catch (err) {
    return res.status(500).json({
      object: "server_error",
      risk: "UNKNOWN",
      explanation: err.message,
      action: "check logs"
    });
  }
});

// ======================
// SUPABASE FUNCTIONS (CORRECT)
// ======================

// créer user (UTILISABLE dans routes)
async function createUser(email) {
  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        email: email,
        is_pro: false,
        scans: 0
      }
    ]);

  return { data, error };
}

// upgrade user (UTILISABLE)
async function upgradeUser(email) {
  const { data, error } = await supabase
    .from("users")
    .update({ is_pro: true })
    .eq("email", email);

  return { data, error };
}

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Animal Detox running on port", PORT);
});
