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

// ⚠️ Stripe webhook doit avoir raw body
app.use("/webhook", express.raw({ type: "application/json" }));

app.use(cors({
  origin: [
    "https://animaldetox.eu",
    "http://localhost:3000"
  ]
}));

app.use(express.json());

// ======================
// SERVICES
// ======================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ======================
// MULTER SECURITY FIX
// ======================
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed"));
    }
    cb(null, true);
  }
});

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.json({ status: "ok", app: "Animal Detox" });
});

// ======================
// STRIPE CHECKOUT (FIXED)
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
      success_url: "https://animaldetox.eu/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://animaldetox.eu/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe session failed" });
  }
});

// ======================
// GEMINI CALL
// ======================
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function callGemini(imageBase64, mimeType) {
  const response = await fetch(GEMINI_URL + "?key=" + process.env.GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

Retourne UNIQUEMENT du JSON valide:
{
  "object": "nom",
  "risk": "LOW|MEDIUM|HIGH|CRITICAL",
  "explanation": "texte simple",
  "action": "conseil"
}`
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ======================
// ANALYZE ROUTE (FIXED + SAFE)
// ======================
app.post("/analyze", upload.single("image"), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        object: "no_file",
        risk: "UNKNOWN",
        explanation: "Aucune image envoyée",
        action: "Envoyer une image",
      });
    }

    filePath = req.file.path;

    const imageBase64 = fs.readFileSync(filePath, {
      encoding: "base64",
    });

    const text = await callGemini(imageBase64, req.file.mimetype);

    if (!text) {
      return res.status(500).json({
        object: "error",
        risk: "UNKNOWN",
        explanation: "No AI response",
        action: "retry",
      });
    }

    let clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(clean);
      return res.json(parsed);
    } catch (e) {
      return res.json({
        object: "unknown",
        risk: "UNKNOWN",
        explanation: clean,
        action: "format error",
      });
    }

  } catch (err) {
    console.error("Analyze error:", err);

    return res.status(500).json({
      object: "server_error",
      risk: "UNKNOWN",
      explanation: "Internal error",
      action: "check logs",
    });

  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ======================
// SUPABASE (FIXED SAFETY)
// ======================
async function upgradeUser(email) {
  return await supabase
    .from("users")
    .update({ is_pro: true })
    .eq("email", email);
}

// ======================
// STRIPE WEBHOOK (CRITICAL FIX)
// ======================
app.post("/webhook", async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    console.log("📩 Stripe event:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const email = session.customer_details?.email;

      if (email) {
        await upgradeUser(email);
        console.log("✅ USER upgraded to PRO:", email);
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Animal Detox running on port", PORT);
});
"engines": {
  "node": "18.x"
}
"dev": "nodemon server.js"
