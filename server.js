const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// 🔐 Gemini setup
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// 🟢 Test serveur
app.get("/", (req, res) => {
  res.send("🐾 Animal Detox Gemini OK");
});

// 🧪 Test API simple
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
        explanation: "Aucune image reçue",
        action: "Envoyer une image"
      });
    }

    // 📸 image en base64
    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64"
    });

    // 🧠 appel Gemini
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

Analyse cette image et réponds UNIQUEMENT en JSON valide :

{
  "object": "nom de l'objet",
  "risk": "LOW | MEDIUM | HIGH | CRITICAL",
  "explanation": "explication simple pour chien/chat",
  "action": "conseil clair"
}

Règles :
- Si toxique pour chien/chat → HIGH ou CRITICAL
- Sinon → LOW
- Répond uniquement en JSON sans texte autour
`
        }
      ]
    });

    fs.unlinkSync(req.file.path);

    let text = response.text;

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
  console.log("🚀 Server running on port", PORT);
});
