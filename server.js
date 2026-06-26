const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());

const upload = multer({ dest: "uploads/" });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Animal Detox Gemini OK");
});

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Aucune image reçue",
      });
    }

    const imageBase64 = fs.readFileSync(req.file.path, {
      encoding: "base64",
    });

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
          text:
            "Décris précisément ce que tu vois sur cette image. Réponds en français.",
        },
      ],
    });

    fs.unlinkSync(req.file.path);

    res.json({
      result: response.text,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Serveur démarré sur le port", PORT);
});
