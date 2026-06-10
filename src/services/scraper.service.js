const prisma = require("../config/prisma");
const fs = require("fs");
const path = require("path");

async function getOpenAIKey() {
  const configPath = path.join(__dirname, "../config/platform.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.openaiKey) return config.openaiKey;
  }
  return process.env.OPENAI_API_KEY;
}

async function callOpenAI(prompt, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API Error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  return JSON.parse(result.choices[0].message.content);
}

exports.importBusinessData = async (businessId, url, io = null, manualMenuText = null) => {
  try {
    if (!url && !manualMenuText) return;
    const emit = (msg, progress) => {
      if (io) io.emit("import-progress", { businessId, message: msg, progress });
    };

    emit("Initializing Naxton AI Crawler...", 5);

    const apiKey = await getOpenAIKey();
    if (!apiKey) {
      console.error("[Scraper] No OpenAI key found.");
      emit("Error: AI Engine offline (Key Missing)", 0);
      return;
    }

    let cleanHtml = "";

    // 1. Fetch HTML content (if URL provided)
    if (url) {
      emit("Connecting to source website...", 15);
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://www.google.com/"
          }
        });

        if (response.ok) {
          const html = await response.text();
          emit("Analyzing page structure...", 30);
          cleanHtml = html
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/\s\s+/g, ' ')
            .substring(0, 100000);

          const baseUrl = new URL(url).origin;
          cleanHtml = cleanHtml.replace(/(src|href)=["'](\/[^"']+)["']/g, `$1="${baseUrl}$2"`);
        }
      } catch (err) {
        console.error(`[Scraper] Fetch error: ${err.message}`);
      }
    }

    // 2. Fallback to Manual Text
    if (!cleanHtml && manualMenuText) {
      emit("Processing Manual Menu Text...", 40);
      cleanHtml = `MANUAL_PASTE_DATA:\n${manualMenuText}`;
    }

    if (!cleanHtml) {
      emit("Import Blocked: Access Denied (403). Use Manual Import box.", 0);
      return;
    }

    // 3. AI Extraction
    emit("AI extracting full menu & images...", 60);
    const prompt = `
      Extract the COMPLETE menu, pricing, and ALL associated images from this HTML.
      Return JSON:
      {
        "logoUrl": "string",
        "categories": [
          {
            "name": "string",
            "items": [
              { "name": "string", "price": 0.0, "description": "string", "imageUrl": "string", "sizes": [] }
            ]
          }
        ]
      }
      
      CONTENT:
      ${cleanHtml}
    `;

    const data = await callOpenAI(prompt, apiKey);
    
    // 4. Saving Data
    emit("Finalizing database & image assets...", 85);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return;

    if (data.logoUrl) {
      await prisma.business.update({ where: { id: businessId }, data: { logoUrl: data.logoUrl } });
    }

    if (data.categories) {
      for (const cat of data.categories) {
        const category = await prisma.menuCategory.create({
          data: { name: cat.name, businessId, tenantId: business.tenantId }
        });
        if (cat.items) {
          for (const it of cat.items) {
            await prisma.menuItem.create({
              data: {
                name: it.name,
                description: it.description || "",
                price: parseFloat(it.price) || 0,
                imageUrl: it.imageUrl,
                categoryId: category.id,
                businessId,
                tenantId: business.tenantId,
                sizes: it.sizes ? { create: it.sizes.map(s => ({ name: s.name, price: parseFloat(s.price), tenantId: business.tenantId })) } : undefined
              }
            });
          }
        }
      }
    }

    emit("Sync Complete! Business online.", 100);
  } catch (err) {
    console.error("[Scraper] Error:", err);
    if (io) io.emit("import-progress", { businessId, message: "Sync failed: AI Engine error", progress: 0 });
  }
};
