app.post("/analyze", upload.single("image"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({
        error: "No image"
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
Tu es un assistant vétérinaire.

Analyse cette image et réponds UNIQUEMENT en JSON valide :

{
"object": "nom de l'objet détecté",
"risk": "LOW | MEDIUM | HIGH | CRITICAL",
"explanation": "explication simple pour un propriétaire de chien ou chat",
"action": "conseil clair"
}

Règles :
- Si toxique pour chien/chat → HIGH ou CRITICAL
- Sinon → LOW
- Réponse uniquement JSON, sans texte autour
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
      json = {
        object: "unknown",
        risk: "UNKNOWN",
        explanation: text,
        action: "format error"
      };
    }

    res.json(json);

  } catch (err) {
    console.log(err);

    res.status(500).json({
      error: err.message
    });
  }
});
