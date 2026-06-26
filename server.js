const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// ======================
// INIT APP
// ======================
const app = express();

app.use(cors());
app.use(express.json());

// ======================
// INIT SERVICES
// ======================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ======================
// UPLOAD
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// ROUTES TEST
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
      success_url: "https://animaldetox.eu/success",
      cancel_url: "https://animaldetox.eu/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// GEMINI (API HTTP STABLE)
// ======================
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function callGemini(imageBase64, mimeType) {
  const response = await fetch(GEMINI_URL + "?key=" + process.env.GEMINI_API_KEY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
            {
              text: `Analyse cette image pour animaux.

Retourne UNIQUEMENT du JSON valide :

{
  "object": "nom",
  "risk": "LOW|MEDIUM|HIGH|CRITICAL",
  "explanation": "texte simple",
  "action": "conseil"
}`
            }
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  );
}

// ======================
// ANALYZE ROUTE
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

    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64",
    });

    const text = await callGemini(imageBase64, req.file.mimetype);

    fs.unlinkSync(req.file.path);

    let clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      return res.json(JSON.parse(clean));
    } catch (e) {
      return res.json({
        object: "unknown",
        risk: "UNKNOWN",
        explanation: clean,
        action: "format error",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      object: "server_error",
      risk: "UNKNOWN",
      explanation: err.message,
      action: "check logs",
    });
  }
});

// ======================
// SUPABASE HELPERS
// ======================
async function createUser(email) {
  return await supabase.from("users").insert([
    {
      email,
      is_pro: false,
      scans: 0,
    },
  ]);
}

async function upgradeUser(email) {
  return await supabase
    .from("users")
    .update({ is_pro: true })
    .eq("email", email);
}

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Animal Detox running on port", PORT);
});
